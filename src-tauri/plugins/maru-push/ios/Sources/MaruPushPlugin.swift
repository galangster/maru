import Foundation
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

/// How many events wait for the web layer to open the channel. A cold launch
/// flushes a handful; anything past this is a webview that never arrived, and
/// the oldest wakes are the ones already closest to their deadline.
private let maxBufferedEvents = 20

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
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.claimNotificationCenterDelegate()
      MaruAppDelegateProxy.install(plugin: self)
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
    lock.unlock()
    Logger.info("channel open, \(pending.count) buffered event(s)", category: "maru-push")

    for event in pending {
      try? args.onEvent.send(event)
    }

    resolvePermissionState { [weak self] state in
      if state == "granted" {
        MaruPushPlugin.registerForRemoteNotifications()
      }
      // Read the token here rather than at the top of this command: reading the
      // notification settings is a round trip to another process, and a token
      // that lands inside it would otherwise be reported as "no token" for the
      // whole of this launch.
      invoke.resolve(StatusResponse(permission: state, token: self?.currentToken()))
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

  @objc public func setBadgeCount(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(BadgeArgs.self)
    let count = max(0, args.count)
    Logger.info("badge set to \(count)", category: "maru-push")
    // Package.swift pins iOS 17 and the application ships iOS 17, but neither
    // decides what this compiles against: swift-rs builds the package at the
    // deployment target tauri hands it — iOS 13, clamped up to 15 under Xcode
    // 27 — so an unguarded iOS 16 API is a build error, not dead code.
    // Measured 2026-09-01: removing this branch fails `cargo check --target
    // aarch64-apple-ios-sim`.
    if #available(iOS 16.0, *) {
      UNUserNotificationCenter.current().setBadgeCount(count) { _ in
        invoke.resolve()
      }
    } else {
      DispatchQueue.main.async {
        UIApplication.shared.applicationIconBadgeNumber = count
        invoke.resolve()
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
    Logger.info("local notification posted", category: "maru-push")
    UNUserNotificationCenter.current().add(request) { error in
      if let error {
        invoke.reject(error.localizedDescription, code: "failed")
      } else {
        invoke.resolve()
      }
    }
  }

  @objc public func completePush(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(CompletePushArgs.self)
    Logger.info(
      "sync finished for push \(args.id), newData=\(args.newData)", category: "maru-push")
    finish(args.id, result: args.newData ? .newData : .noData)
    invoke.resolve()
  }

  // MARK: Delivery from the app delegate

  fileprivate func didRegister(token: Data) {
    let hex = token.map { String(format: "%02x", $0) }.joined()
    // The first bytes only: the whole token identifies the device.
    Logger.info("APNs token registered (\(hex.prefix(8))…)", category: "maru-push")
    lock.lock()
    deviceToken = hex
    lock.unlock()
    emit(PushEvent(event: "pushToken", token: hex))
  }

  fileprivate func didFailToRegister(error: Error) {
    Logger.error("APNs registration failed: \(error)", category: "maru-push")
    emit(PushEvent(event: "pushFailed", message: error.localizedDescription))
  }

  fileprivate func didReceiveRemotePush(completion: @escaping (UIBackgroundFetchResult) -> Void) {
    let id = UUID().uuidString
    Logger.info("pushReceived \(id)", category: "maru-push")
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
    var dropped: [PushEvent] = []
    if channel == nil {
      buffered.append(event)
      while buffered.count > maxBufferedEvents {
        dropped.append(buffered.removeFirst())
      }
    }
    lock.unlock()
    // A wake we drop still owes iOS its completion handler.
    for old in dropped where old.event == "pushReceived" {
      if let id = old.id {
        Logger.info("dropped buffered push \(id)", category: "maru-push")
        finish(id, result: .noData)
      }
    }
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

  /// Hands one delegate callback back to whoever held the delegate before Maru
  /// did. `fallback` runs when there is nobody to hand it to — every one of
  /// these callbacks owes its own completion handler an answer either way.
  private func forward(
    selector: Selector,
    else fallback: () -> Void,
    to send: (UNUserNotificationCenterDelegate) -> Void
  ) {
    guard let previous = previousCenterDelegate, previous.responds(to: selector) else {
      fallback()
      return
    }
    send(previous)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if isMaru(notification) {
      // Guarded for the same reason `setBadgeCount` is: see the note there.
      if #available(iOS 14.0, *) {
        completionHandler([.banner, .list, .sound, .badge])
      } else {
        completionHandler([.alert, .sound, .badge])
      }
      return
    }
    forward(
      selector: #selector(
        UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:)),
      else: { completionHandler([]) }
    ) { previous in
      previous.userNotificationCenter?(
        center, willPresent: notification, withCompletionHandler: completionHandler)
    }
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
    forward(
      selector: #selector(
        UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:)),
      else: completionHandler
    ) { previous in
      previous.userNotificationCenter?(
        center, didReceive: response, withCompletionHandler: completionHandler)
    }
  }
}

// MARK: - App delegate

/// Tauri owns the `UIApplicationDelegate` and its iOS plugin API exposes no
/// lifecycle hook of any kind — the Swift `Plugin` base class offers
/// `load(webview:)` and nothing else (tauri 2.11,
/// `mobile/ios-api/Sources/Tauri/Plugin/Plugin.swift`). The Android half of the
/// same API does have delegate hooks; the iOS half does not. So the three
/// `UIApplicationDelegate` callbacks push needs have to come from somewhere
/// else.
///
/// What works is putting a different object in front, which `UIApplication`
/// inspects afresh: this proxy implements the three push callbacks and forwards
/// every other message — and every other `respondsToSelector:` question — to
/// Tauri's delegate untouched. Verified live: the APNs device token and the
/// application lifecycle callbacks both arrive through it.
private final class MaruAppDelegateProxy: NSObject, UIApplicationDelegate {
  /// Strong on purpose. `UIApplication.delegate` does not own what it points
  /// at, so the proxy holds Tauri's delegate alive, and `installed` below holds
  /// the proxy.
  private let target: UIApplicationDelegate
  /// Weak: the plugin outlives nothing here, and Tauri owns its lifetime.
  private weak var plugin: MaruPushPlugin?

  static var installed: MaruAppDelegateProxy?

  init(target: UIApplicationDelegate, plugin: MaruPushPlugin) {
    self.target = target
    self.plugin = plugin
  }

  static func install(plugin: MaruPushPlugin) {
    guard installed == nil, let delegate = UIApplication.shared.delegate else { return }
    if delegate is MaruAppDelegateProxy { return }
    let proxy = MaruAppDelegateProxy(target: delegate, plugin: plugin)
    installed = proxy
    UIApplication.shared.delegate = proxy
    Logger.info(
      "delegate proxy installed in front of \(NSStringFromClass(type(of: delegate)))",
      category: "maru-push")
  }

  override func responds(to aSelector: Selector!) -> Bool {
    super.responds(to: aSelector) || target.responds(to: aSelector)
  }

  override func forwardingTarget(for aSelector: Selector!) -> Any? {
    target.responds(to: aSelector) ? target : nil
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    plugin?.didRegister(token: deviceToken)
    target.application?(
      application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    plugin?.didFailToRegister(error: error)
    target.application?(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    Logger.info("proxy received remote notification", category: "maru-push")
    guard let plugin else {
      completionHandler(.noData)
      return
    }
    // Maru owns this completion handler: it answers when the sync it starts
    // finishes, or at the 25 s cap. Tauri's delegate does not implement this
    // callback at all, so there is nothing to forward to.
    plugin.didReceiveRemotePush(completion: completionHandler)
  }
}

@_cdecl("init_plugin_maru_push")
func initPlugin() -> Plugin {
  MaruPushPlugin()
}
