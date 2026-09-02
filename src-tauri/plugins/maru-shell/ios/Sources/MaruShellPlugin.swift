import Tauri
import UIKit
import WebKit

private struct SelectTabArgs: Decodable {
  let index: Int
}

private struct SetBadgeArgs: Decodable {
  let index: Int
  let value: String?
}

private struct SetTabBarHiddenArgs: Decodable {
  let hidden: Bool
}

private struct ImpactArgs: Decodable {
  let style: String
}

private struct NotifyArgs: Decodable {
  let kind: String
}

private struct WatchTabsArgs: Decodable {
  let channel: Channel
}

private struct TabSelectedEvent: Encodable {
  let index: Int
}

/// One per tab. It owns nothing: on appearance it asks the plugin to move the
/// single web content controller into it, so all three tabs show the same
/// WKWebView and the web layer keeps its state across a tab switch.
///
/// The content lives inside the selected tab's controller rather than beside
/// it in the tab bar controller's view, because that is where UIKit looks for
/// the scroll view that drives `tabBarMinimizeBehavior`, and where it applies
/// the tab bar's share of the safe area.
final class MaruShellTabHostController: UIViewController {
  weak var shell: MaruShellPlugin?

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    shell?.adopt(host: self)
  }
}

final class MaruShellPlugin: Plugin, UITabBarControllerDelegate {
  private static let tabs: [(title: String, symbol: String)] = [
    ("Inbox", "tray"),
    ("Search", "magnifyingglass"),
    ("Settings", "gearshape"),
  ]

  private weak var webView: WKWebView?
  private var tabBarController: UITabBarController?
  /// Tauri's own root view controller, kept alive after it stops being the
  /// window's root. Its view holds the WKWebView that wry added.
  private var contentController: UIViewController?
  private var tabChannel: Channel?

  @objc public override func load(webview: WKWebView) {
    self.webView = webview
    DispatchQueue.main.async { [weak self] in
      self?.install(attempt: 0)
    }
  }

  // MARK: - Installation

  /// The webview has no window at plugin-load time on a cold start, so this
  /// retries on the main queue until the window scene exists. Five seconds of
  /// attempts, then it gives up and the app stays on the web tab bar.
  private func install(attempt: Int) {
    guard tabBarController == nil else { return }
    guard let window = webView?.window ?? Self.keyWindow(),
          let root = window.rootViewController,
          !(root is UITabBarController)
    else {
      if attempt < 100 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
          self?.install(attempt: attempt + 1)
        }
      }
      return
    }

    let controller = UITabBarController()
    controller.delegate = self
    controller.viewControllers = Self.tabs.enumerated().map { index, tab in
      let host = MaruShellTabHostController()
      host.shell = self
      host.view.backgroundColor = .clear
      host.tabBarItem = UITabBarItem(
        title: tab.title,
        image: UIImage(systemName: tab.symbol),
        tag: index
      )
      return host
    }
    // iOS 26 only. Below it the bar is the classic opaque one and never
    // minimizes, which is the documented fallback, not a defect.
    if #available(iOS 26.0, *) {
      controller.tabBarMinimizeBehavior = .onScrollDown
    }

    // Strong reference first: assigning a new root releases the old one.
    contentController = root

    // The scroll view keeps its default `contentInsetAdjustmentBehavior`, and
    // that is load-bearing. WebKit derives CSS `env(safe-area-inset-*)` from
    // the adjusted content inset, so `.never` does not merely stop the scroll
    // view insetting itself -- it reports zero insets to the page, and the
    // inbox header climbs under the status bar. Left alone, UIKit folds the
    // tab bar's height into the child's bottom safe area, the page reads it
    // through `env()`, and the list clears the glass while still scrolling
    // beneath it.

    window.rootViewController = controller
    tabBarController = controller
    if let first = controller.viewControllers?.first {
      adopt(host: first)
    }
    window.makeKeyAndVisible()
  }

  /// Moves the web content controller into `host`. A no-op when it is already
  /// there, so the repeated `viewWillAppear` on a re-selected tab costs nothing.
  func adopt(host: UIViewController) {
    guard let content = contentController, content.parent !== host else { return }
    if content.parent != nil {
      content.willMove(toParent: nil)
      content.view.removeFromSuperview()
      content.removeFromParent()
    }
    host.addChild(content)
    content.view.translatesAutoresizingMaskIntoConstraints = false
    host.view.addSubview(content.view)
    NSLayoutConstraint.activate([
      content.view.topAnchor.constraint(equalTo: host.view.topAnchor),
      content.view.bottomAnchor.constraint(equalTo: host.view.bottomAnchor),
      content.view.leadingAnchor.constraint(equalTo: host.view.leadingAnchor),
      content.view.trailingAnchor.constraint(equalTo: host.view.trailingAnchor),
    ])
    content.didMove(toParent: host)
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
  }

  // MARK: - Tab selection

  /// Only a real tap reaches here. UIKit does not call the delegate for a
  /// programmatic `selectedIndex`, so `selectTab` can never echo back to JS.
  func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
    try? tabChannel?.send(TabSelectedEvent(index: tabBarController.selectedIndex))
  }

  @objc public func watchTabs(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(WatchTabsArgs.self)
    tabChannel = args.channel
    invoke.resolve()
  }

  @objc public func selectTab(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SelectTabArgs.self)
    onMain(invoke) { controller in
      guard args.index >= 0, args.index < (controller.viewControllers?.count ?? 0) else { return }
      controller.selectedIndex = args.index
    }
  }

  @objc public func setBadge(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetBadgeArgs.self)
    onMain(invoke) { controller in
      guard let items = controller.viewControllers, args.index >= 0, args.index < items.count else { return }
      items[args.index].tabBarItem.badgeValue = args.value
    }
  }

  @objc public func setTabBarHidden(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetTabBarHiddenArgs.self)
    onMain(invoke) { controller in
      if #available(iOS 18.0, *) {
        controller.setTabBarHidden(args.hidden, animated: true)
      } else {
        controller.tabBar.isHidden = args.hidden
      }
    }
  }

  // MARK: - Haptics
  //
  // Each one logs under the `maru-shell` category. A haptic leaves no trace a
  // simulator can screenshot, so without this line there is no way to prove
  // from the outside that an archive reached the Taptic Engine. Debug builds
  // only, by Tauri's Logger.
  //
  // No `prepare()` before firing. It is an asynchronous warm-up, and calling it
  // one line before the impact pays the cost without buying the latency.

  @objc public func impact(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ImpactArgs.self)
    let style: UIImpactFeedbackGenerator.FeedbackStyle
    switch args.style {
    case "light": style = .light
    case "heavy": style = .heavy
    case "soft": style = .soft
    case "rigid": style = .rigid
    default: style = .medium
    }
    haptic(invoke, "impact \(args.style)") {
      UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
  }

  @objc public func notify(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(NotifyArgs.self)
    let kind: UINotificationFeedbackGenerator.FeedbackType
    switch args.kind {
    case "warning": kind = .warning
    case "error": kind = .error
    default: kind = .success
    }
    haptic(invoke, "notify \(args.kind)") {
      UINotificationFeedbackGenerator().notificationOccurred(kind)
    }
  }

  @objc public func selection(_ invoke: Invoke) {
    haptic(invoke, "selection") {
      UISelectionFeedbackGenerator().selectionChanged()
    }
  }

  // MARK: - Helpers

  /// Runs `body` against the installed tab bar controller on the main queue and
  /// always answers the invoke. A command that arrives before the shell is
  /// installed resolves quietly rather than rejecting: the web layer would have
  /// nothing useful to do with the failure.
  private func onMain(_ invoke: Invoke, _ body: @escaping (UITabBarController) -> Void) {
    DispatchQueue.main.async { [weak self] in
      if let controller = self?.tabBarController {
        body(controller)
      }
      invoke.resolve()
    }
  }

  /// Logs the cue, plays it on the main queue, and answers the invoke.
  private func haptic(_ invoke: Invoke, _ label: String, _ play: @escaping () -> Void) {
    Logger.debug(label, category: "maru-shell")
    DispatchQueue.main.async {
      play()
      invoke.resolve()
    }
  }
}

@_cdecl("init_plugin_maru_shell")
func initPlugin() -> Plugin {
  MaruShellPlugin()
}
