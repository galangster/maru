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

/// One item on the bar: what it says and which SF Symbol draws it.
///
/// This side writes no tab list. The order, the titles and the symbols all
/// come from `MOBILE_TABS` in `src/mobile/state.ts` and arrive with the
/// channel, because the reducer already addresses tabs by position and a
/// second copy here could only drift out of step with it.
private struct TabDescriptor: Decodable {
  let title: String
  let symbol: String
}

private struct WatchTabsArgs: Decodable {
  let channel: Channel
  let tabs: [TabDescriptor]
}

private struct TabSelectedEvent: Encodable {
  let index: Int
}

/// The tab bar controller, with the web content pinned under its bar.
///
/// It also measures the bar for the page. The iOS 26 bar floats over the
/// content by design, and `env(safe-area-inset-bottom)` carries only the
/// window's own inset -- the home indicator -- however the content controller
/// is parented. So the bar's own height is handed to CSS as a custom property
/// instead, and `mobile.css` adds it to `env()` exactly where the web tab bar's
/// height used to go.
final class MaruShellTabBarController: UITabBarController {
  weak var content: UIViewController?
  weak var webView: WKWebView?
  /// The expanded bar's height, held while the bar is on screen.
  private var reserved: CGFloat = 0
  private var published: CGFloat = -1

  /// Keeps the web content directly under the bar, every layout.
  ///
  /// UIKit adds and reorders the tab hosts as tabs change, so the order has to
  /// be re-asserted rather than set once. Under the bar so the glass draws over
  /// the page; above the hosts because a host's view is hit-testable even when
  /// it is empty and clear, and anything above the content swallows every touch
  /// the page should have had.
  private func restack(_ content: UIViewController) {
    guard content.view.superview === view else { return }
    guard let barRoot = view.subviews.last(where: { tabBar.isDescendant(of: $0) }) else { return }
    guard let barIndex = view.subviews.firstIndex(of: barRoot) else { return }
    if view.subviews.firstIndex(of: content.view) != barIndex - 1 {
      view.insertSubview(content.view, belowSubview: barRoot)
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard let content else { return }
    restack(content)

    let hidden: Bool
    if #available(iOS 18.0, *) {
      hidden = isTabBarHidden
    } else {
      hidden = tabBar.isHidden
    }
    // The bar's own frame. `contentLayoutGuide` reports the full view, because
    // the iOS 26 bar is meant to float over the content rather than inset it.
    var occluded: CGFloat = 0
    if !hidden, tabBar.frame.minY < view.bounds.maxY {
      occluded = view.bounds.maxY - tabBar.frame.minY
    }
    // The high-water mark while the bar is up, not the measurement of the
    // moment. The bar shrinks to a pill as the page scrolls, and a number that
    // shrank with it would reflow the page mid-scroll and let the last row
    // slide under the pill. Reserving the expanded height keeps the list still
    // and leaves the minimized bar floating over the page's own bottom margin,
    // which is what iOS does. A hidden bar reserves nothing and re-measures
    // when it comes back.
    reserved = hidden ? 0 : max(reserved, occluded)
    // Only what the page does not already know: `env(safe-area-inset-bottom)`
    // carries the home indicator, and the bar's frame includes it.
    publish(max(0, reserved - view.safeAreaInsets.bottom))
  }

  private func publish(_ inset: CGFloat) {
    // The webview, not the value, gates this: the first layout can land before
    // the plugin has handed the controller its webview, and recording a value
    // that never reached the page would make every later layout a no-op.
    guard let webView, abs(published - inset) > 0.5 else { return }
    published = inset
    webView.evaluateJavaScript(
      "document.documentElement.style.setProperty('--maru-native-tab-inset','\(inset)px')"
    )
  }
}

final class MaruShellPlugin: Plugin, UITabBarControllerDelegate {
  private static let impactStyles: [String: UIImpactFeedbackGenerator.FeedbackStyle] = [
    "light": .light,
    "medium": .medium,
    "heavy": .heavy,
    "soft": .soft,
    "rigid": .rigid,
  ]

  private static let notificationKinds: [String: UINotificationFeedbackGenerator.FeedbackType] = [
    "success": .success,
    "warning": .warning,
    "error": .error,
  ]

  private weak var webView: WKWebView?
  private var tabBarController: MaruShellTabBarController?
  /// Tauri's own root view controller, kept alive after it stops being the
  /// window's root. Its view holds the WKWebView that wry added.
  private var contentController: UIViewController?
  private var tabChannel: Channel?
  private var tabs: [TabDescriptor] = []
  private var windowObserver: NSObjectProtocol?

  private var impactGenerators: [String: UIImpactFeedbackGenerator] = [:]
  private var notificationGenerator: UINotificationFeedbackGenerator?

  @objc public override func load(webview: WKWebView) {
    self.webView = webview
  }

  // MARK: - Installation

  /// The bar cannot be built until the web layer has said what is on it, so
  /// `watch_tabs` is what starts installation. On a cold start the webview may
  /// still have no window at that point; the window announces itself exactly
  /// once, and one observer is the whole wait. Lane 1 polled every 50 ms for
  /// five seconds for the same result.
  private func installWhenReady() {
    if install() { return }
    guard windowObserver == nil else { return }
    windowObserver = NotificationCenter.default.addObserver(
      forName: UIWindow.didBecomeKeyNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.install()
    }
  }

  @discardableResult
  private func install() -> Bool {
    guard tabBarController == nil, !tabs.isEmpty else { return false }
    guard let window = webView?.window ?? Self.keyWindow(),
          let root = window.rootViewController,
          !(root is UITabBarController)
    else { return false }

    // Before `makeKeyAndVisible` below, which would otherwise re-enter this.
    if let observer = windowObserver {
      NotificationCenter.default.removeObserver(observer)
      windowObserver = nil
    }

    let controller = MaruShellTabBarController()
    controller.delegate = self
    controller.webView = webView
    controller.viewControllers = tabs.enumerated().map { index, tab in
      let host = UIViewController()
      host.view.backgroundColor = .clear
      // Nothing is drawn here and nothing may be touched here. The web content
      // sits underneath and must receive every touch that is not the bar's.
      host.view.isUserInteractionEnabled = false
      host.tabBarItem = UITabBarItem(
        title: tab.title,
        image: UIImage(systemName: tab.symbol),
        tag: index
      )
      observeScroll(from: host)
      return host
    }
    // iOS 26 only. Below it the bar is the classic opaque one and never
    // minimizes, which is the documented fallback, not a defect.
    if #available(iOS 26.0, *) {
      controller.tabBarMinimizeBehavior = .onScrollDown
    }

    // The scroll view keeps its default `contentInsetAdjustmentBehavior`, and
    // that is load-bearing. WebKit derives CSS `env(safe-area-inset-*)` from
    // the adjusted content inset, so `.never` does not merely stop the scroll
    // view insetting itself -- it reports zero insets to the page, and the
    // inbox header climbs under the status bar.

    // Strong reference first: assigning a new root releases the old one.
    contentController = root
    window.rootViewController = controller

    // Adopted once, and never again. All three tabs are the same web page, so
    // the content hangs off the tab bar controller rather than off the selected
    // tab: a tab switch then moves no views at all, and the WKWebView keeps its
    // layers, its first responder and its scroll position. Selection reaches
    // the web layer through the delegate instead.
    controller.addChild(root)
    root.view.translatesAutoresizingMaskIntoConstraints = false
    controller.view.addSubview(root.view)
    NSLayoutConstraint.activate([
      root.view.topAnchor.constraint(equalTo: controller.view.topAnchor),
      root.view.bottomAnchor.constraint(equalTo: controller.view.bottomAnchor),
      root.view.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor),
      root.view.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor),
    ])
    root.didMove(toParent: controller)
    controller.content = root
    observeScroll(from: root)

    tabBarController = controller
    window.makeKeyAndVisible()
    // The install is itself a gesture boundary: the first haptic in a session
    // is usually the first archive, and this is the earliest honest moment to
    // wake the engine.
    warmGenerators(prepare: true)
    return true
  }

  /// Names the scroll view UIKit watches to decide when to minimize the bar.
  ///
  /// Not optional here. Left to its own heuristic UIKit searches the selected
  /// tab's hierarchy for a scroll view, and the web content deliberately does
  /// not live there -- it is pinned under the bar so a tab switch moves nothing.
  /// The one scroll view that exists is the WKWebView's own, which is why the
  /// page had to become the scroller (mobile.css).
  private func observeScroll(from controller: UIViewController) {
    guard #available(iOS 15.0, *) else { return }
    guard let scrollView = webView?.scrollView else { return }
    controller.setContentScrollView(scrollView, for: .bottom)
  }

  /// The same four lines as maru-auth's presentation anchor, on purpose. Each
  /// Tauri iOS plugin is its own Swift package, so sharing them would mean a
  /// third package to hold one expression.
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
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.tabChannel = args.channel
      self.tabs = args.tabs
      self.installWhenReady()
      invoke.resolve()
    }
  }

  @objc public func unwatchTabs(_ invoke: Invoke) {
    DispatchQueue.main.async { [weak self] in
      self?.tabChannel = nil
      invoke.resolve()
    }
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

  /// Wake the Taptic Engine ahead of a gesture that is about to end in a
  /// haptic: the start of a pull, a sheet opening, the shell installing.
  ///
  /// `prepare()` is asynchronous and holds the engine warm for a couple of
  /// seconds, so calling it one line before the impact pays the cost and buys
  /// nothing -- which is why lane 1 removed it. It only helps at a real
  /// boundary, and only if the generator that fires is the one that was
  /// prepared, so the generators are retained rather than made per call.
  @objc public func prepareHaptics(_ invoke: Invoke) {
    DispatchQueue.main.async { [weak self] in
      self?.warmGenerators(prepare: true)
      invoke.resolve()
    }
  }

  @objc public func impact(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ImpactArgs.self)
    haptic(invoke, "impact \(args.style)") { [weak self] in
      guard let self else { return }
      self.warmGenerators(prepare: false)
      let style = Self.impactStyles[args.style] == nil ? "medium" : args.style
      self.impactGenerators[style]?.impactOccurred()
    }
  }

  @objc public func notify(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(NotifyArgs.self)
    haptic(invoke, "notify \(args.kind)") { [weak self] in
      guard let self else { return }
      self.warmGenerators(prepare: false)
      self.notificationGenerator?.notificationOccurred(Self.notificationKinds[args.kind] ?? .success)
    }
  }

  // MARK: - Helpers

  /// Main queue only: feedback generators are UIKit objects.
  private func warmGenerators(prepare: Bool) {
    if impactGenerators.isEmpty {
      impactGenerators = Self.impactStyles.mapValues(UIImpactFeedbackGenerator.init(style:))
    }
    if notificationGenerator == nil {
      notificationGenerator = UINotificationFeedbackGenerator()
    }
    guard prepare else { return }
    impactGenerators.values.forEach { $0.prepare() }
    notificationGenerator?.prepare()
  }

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
