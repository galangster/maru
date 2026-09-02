import Foundation
import ObjectiveC
import Tauri
import UIKit
import UserNotifications
import WebKit

/// Every notification this plugin posts carries this identifier prefix, which
/// is how the `UNUserNotificationCenter` delegate below tells Maru's own
/// notifications from the ones `tauri-plugin-notification` scheduled.
private let notificationIdPrefix = "maru-push."

/// iOS gives a background push about thirty seconds. Maru resolves the
/// completion handler when the web layer says the sync is done; this is the
/// backstop for a sync that never answers, deliberately short of the real
/// deadline so the app is never killed for overrunning it.
private let completionCapSeconds: TimeInterval = 25

// MARK: - Wire types

private struct StartArgs: Decodable {
  let onEvent: Channel
}

private struct BadgeArgs: Decodable {
  let count: Int
}

private struct LocalNotificationArgs: Decodable {
  let title: String
  let body: String
  let threadId: String?
}

private struct CompletePushArgs: Decodable {
  let id: String
  let newData: Bool
}

private struct StatusResponse: Encodable {
  let permission: String
  let token: String?
}

private struct OkResponse: Encodable {
  let ok: Bool
}

/// One frame on the event channel. `event` names the case; the rest is
/// optional because Swift sends one shape and the web layer switches on it.
private struct PushEvent: Encodable {
  let event: String
  var token: String? = nil
  var id: String? = nil
  var threadId: String? = nil
  var message: String? = nil
}

// MARK: - Plugin

final class MaruPushPlugin: Plugin, UNUserNotificationCenterDelegate {
  /// The swizzled app-delegate methods are plain C functions with no captured
  /// context, so they reach the plugin through this.
  fileprivate static weak var current: MaruPushPlugin?

  private let lock = NSLock()
  private var channel: Channel?
  /// Events that arrived before the web layer opened the channel. An APNs wake
  /// can start the process, so this is the normal path on a cold launch, not
  /// an edge case.
  private var buffered: [PushEvent] = []
  private var deviceToken: String?
  private var completions: [String: (UIBackgroundFetchResult) -> Void] = [:]
  /// `tauri-plugin-notification` claims `UNUserNotificationCenter.delegate`
  /// first and force-unwraps its own map when a notification it did not
  /// schedule comes back. Maru takes the delegate and forwards everything that
  /// is not its own, which keeps that plugin working and keeps it away from
  /// the crash.
  private weak var previousCenterDelegate: UNUserNotificationCenterDelegate?

  @objc public override func load(webview: WKWebView) {
    MaruPushPlugin.current = self
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.claimNotificationCenterDelegate()
      AppDelegateHooks.install()
    }
  }

  private func claimNotificationCenterDelegate() {
    let center = UNUserNotificationCenter.current()
    if center.delegate === self { return }
    previousCenterDelegate = center.delegate
    center.delegate = self
  }

  // MARK: Commands

  @objc public func start(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartArgs.self)
    lock.lock()
    channel = args.onEvent
    let pending = buffered
    buffered = []
    let token = deviceToken
    lock.unlock()

    for event in pending {
      try? args.onEvent.send(event)
    }

    resolvePermissionState { state in
      if state == "granted" {
        MaruPushPlugin.registerForRemoteNotifications()
      }
      invoke.resolve(StatusResponse(permission: state, token: token))
    }
  }

  @objc public func permissionState(_ invoke: Invoke) throws {
    resolvePermissionState { [weak self] state in
      invoke.resolve(StatusResponse(permission: state, token: self?.currentToken()))
    }
  }

  @objc public func requestPermission(_ invoke: Invoke) throws {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) {
      [weak self] granted, _ in
      if granted { MaruPushPlugin.registerForRemoteNotifications() }
      // Ask the centre rather than trusting `granted`: the person may have
      // answered a previous prompt, in which case no alert was shown and
      // `granted` reports the standing answer, not a new one.
      self?.resolvePermissionState { state in
        invoke.resolve(StatusResponse(permission: state, token: self?.currentToken()))
      }
    }
  }

  @objc public func token(_ invoke: Invoke) throws {
    resolvePermissionState { [weak self] state in
      invoke.resolve(StatusResponse(permission: state, token: self?.currentToken()))
    }
  }

  @objc public func setBadgeCount(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(BadgeArgs.self)
    let count = max(0, args.count)
    // The application is iOS 17 only, but swift-rs compiles the package
    // against its own lower deployment target, so the check is spelled out.
    if #available(iOS 16.0, *) {
      UNUserNotificationCenter.current().setBadgeCount(count) { _ in
        invoke.resolve(OkResponse(ok: true))
      }
    } else {
      DispatchQueue.main.async {
        UIApplication.shared.applicationIconBadgeNumber = count
        invoke.resolve(OkResponse(ok: true))
      }
    }
  }

  @objc public func scheduleLocalNotification(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(LocalNotificationArgs.self)
    let content = UNMutableNotificationContent()
    content.title = args.title
    content.body = args.body
    content.sound = .default
    if let threadId = args.threadId {
      content.userInfo = ["maruThreadId": threadId]
      // Groups the conversation's notifications together in Notification Centre.
      content.threadIdentifier = threadId
    }
    let request = UNNotificationRequest(
      identifier: notificationIdPrefix + UUID().uuidString,
      content: content,
      // nil fires it now. A trigger of any kind would make iOS treat it as
      // scheduled and delay it past the wake we are already inside.
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request) { error in
      if let error {
        invoke.reject(error.localizedDescription, code: "failed")
      } else {
        invoke.resolve(OkResponse(ok: true))
      }
    }
  }

  @objc public func completePush(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(CompletePushArgs.self)
    finish(args.id, result: args.newData ? .newData : .noData)
    invoke.resolve(OkResponse(ok: true))
  }

  // MARK: Delivery from the app delegate

  fileprivate func didRegister(token: Data) {
    let hex = token.map { String(format: "%02x", $0) }.joined()
    lock.lock()
    deviceToken = hex
    lock.unlock()
    emit(PushEvent(event: "pushToken", token: hex))
  }

  fileprivate func didFailToRegister(error: Error) {
    emit(PushEvent(event: "pushFailed", message: error.localizedDescription))
  }

  fileprivate func didReceiveRemotePush(completion: @escaping (UIBackgroundFetchResult) -> Void) {
    let id = UUID().uuidString
    lock.lock()
    completions[id] = completion
    lock.unlock()
    // The cap runs whatever the web layer does. `finish` is idempotent, so the
    // first of the two to arrive wins and the other is a no-op.
    DispatchQueue.main.asyncAfter(deadline: .now() + completionCapSeconds) { [weak self] in
      self?.finish(id, result: .noData)
    }
    emit(PushEvent(event: "pushReceived", id: id))
  }

  private func finish(_ id: String, result: UIBackgroundFetchResult) {
    lock.lock()
    let completion = completions.removeValue(forKey: id)
    lock.unlock()
    completion?(result)
  }

  // MARK: Helpers

  private func currentToken() -> String? {
    lock.lock()
    defer { lock.unlock() }
    return deviceToken
  }

  private func resolvePermissionState(_ completion: @escaping (String) -> Void) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let state: String
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral: state = "granted"
      case .denied: state = "denied"
      default: state = "prompt"
      }
      completion(state)
    }
  }

  private func emit(_ event: PushEvent) {
    lock.lock()
    let channel = self.channel
    if channel == nil { buffered.append(event) }
    lock.unlock()
    guard let channel else { return }
    try? channel.send(event)
  }

  private static func registerForRemoteNotifications() {
    DispatchQueue.main.async {
      UIApplication.shared.registerForRemoteNotifications()
    }
  }

  // MARK: UNUserNotificationCenterDelegate

  private func isMaru(_ notification: UNNotification) -> Bool {
    notification.request.identifier.hasPrefix(notificationIdPrefix)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if isMaru(notification) {
      if #available(iOS 14.0, *) {
        completionHandler([.banner, .list, .sound, .badge])
      } else {
        completionHandler([.alert, .sound, .badge])
      }
      return
    }
    guard
      let previous = previousCenterDelegate,
      previous.responds(
        to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:)))
    else {
      completionHandler([])
      return
    }
    previous.userNotificationCenter?(
      center, willPresent: notification, withCompletionHandler: completionHandler)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    if isMaru(response.notification) {
      if response.actionIdentifier == UNNotificationDefaultActionIdentifier,
        let threadId = response.notification.request.content.userInfo["maruThreadId"] as? String
      {
        emit(PushEvent(event: "notificationOpened", threadId: threadId))
      }
      completionHandler()
      return
    }
    guard
      let previous = previousCenterDelegate,
      previous.responds(
        to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:)))
    else {
      completionHandler()
      return
    }
    previous.userNotificationCenter?(
      center, didReceive: response, withCompletionHandler: completionHandler)
  }
}

// MARK: - App delegate hooks

/// Tauri owns the `UIApplicationDelegate` and its iOS plugin API exposes no
/// lifecycle hook of any kind — `Plugin` offers `load(webview:)` and nothing
/// else (tauri 2.11, `mobile/ios-api/Sources/Tauri/Plugin/Plugin.swift`). The
/// Android half of the same API does have delegate hooks; the iOS half does
/// not, so the three `UIApplicationDelegate` callbacks push needs are added to
/// the live delegate class at runtime.
///
/// `class_addMethod` is the normal case: Tauri's delegate implements none of
/// these, and adding one is what makes `respondsToSelector` true so iOS starts
/// delivering. If a future Tauri does implement one, the original IMP is kept
/// and called after Maru has handled it, so nothing is stolen.
private typealias FetchCompletion = (UIBackgroundFetchResult) -> Void

private enum AppDelegateHooks {
  private static var installed = false
  private static var originalDidRegister: IMP?
  private static var originalDidFail: IMP?
  private static var originalDidReceive: IMP?

  static func install() {
    guard !installed else { return }
    guard let delegate = UIApplication.shared.delegate else { return }
    installed = true
    let cls: AnyClass = type(of: delegate)

    let didRegister: @convention(block) (AnyObject, UIApplication, NSData) -> Void = {
      selfObj, app, token in
      MaruPushPlugin.current?.didRegister(token: token as Data)
      if let original = originalDidRegister {
        typealias Fn = @convention(c) (AnyObject, Selector, UIApplication, NSData) -> Void
        unsafeBitCast(original, to: Fn.self)(
          selfObj,
          #selector(UIApplicationDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:)),
          app, token)
      }
    }
    originalDidRegister = graft(
      cls,
      #selector(UIApplicationDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:)),
      didRegister, "v@:@@")

    let didFail: @convention(block) (AnyObject, UIApplication, NSError) -> Void = {
      selfObj, app, error in
      MaruPushPlugin.current?.didFailToRegister(error: error)
      if let original = originalDidFail {
        typealias Fn = @convention(c) (AnyObject, Selector, UIApplication, NSError) -> Void
        unsafeBitCast(original, to: Fn.self)(
          selfObj,
          #selector(UIApplicationDelegate.application(_:didFailToRegisterForRemoteNotificationsWithError:)),
          app, error)
      }
    }
    originalDidFail = graft(
      cls,
      #selector(UIApplicationDelegate.application(_:didFailToRegisterForRemoteNotificationsWithError:)),
      didFail, "v@:@@")

    let didReceive:
      @convention(block) (AnyObject, UIApplication, NSDictionary, @escaping FetchCompletion) -> Void = {
        selfObj, app, userInfo, completion in
        guard let plugin = MaruPushPlugin.current else {
          completion(.noData)
          return
        }
        plugin.didReceiveRemotePush(completion: completion)
        if let original = originalDidReceive {
          typealias Fn = @convention(c) (
            AnyObject, Selector, UIApplication, NSDictionary, @escaping FetchCompletion
          ) -> Void
          unsafeBitCast(original, to: Fn.self)(
            selfObj,
            #selector(UIApplicationDelegate.application(_:didReceiveRemoteNotification:fetchCompletionHandler:)),
            app, userInfo, { _ in })
        }
      }
    originalDidReceive = graft(
      cls,
      #selector(UIApplicationDelegate.application(_:didReceiveRemoteNotification:fetchCompletionHandler:)),
      didReceive, "v@:@@@")
  }

  /// Adds `selector` to `cls`, or replaces it and returns the implementation
  /// that was there.
  private static func graft(
    _ cls: AnyClass, _ selector: Selector, _ block: Any, _ types: String
  ) -> IMP? {
    let imp = imp_implementationWithBlock(block)
    if let existing = class_getInstanceMethod(cls, selector) {
      return method_setImplementation(existing, imp)
    }
    class_addMethod(cls, selector, imp, types)
    return nil
  }
}

@_cdecl("init_plugin_maru_push")
func initPlugin() -> Plugin {
  MaruPushPlugin()
}
