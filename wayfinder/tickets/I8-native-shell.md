# I8 — Native shell: Liquid Glass chrome around the web content  `wayfinder:task`

status: **lane 1 in flight (2026-09-01)** · map 5 · asked by Nick: "make the bottom menu native liquid glass; any other places we should try and make feel native?"

The phone becomes native frame, web content. UIKit owns the chrome that
must feel like iOS 26 — the tab bar, sheets, the navigation bar and back
gesture, context menus, haptics, search — and the WebView keeps the
product: list, reading, compose body, settings. Built against the iOS 26
SDK so Liquid Glass and the tab bar's scroll-minimize come from the system;
iOS 17–25 get the classic bar automatically.

## Lanes, in the order they change the feel

1. **Tab bar + haptics** (this lane). A Tauri mobile plugin `maru-shell`
   hosts the WKWebView inside a `UITabBarController` (Inbox, Search,
   Settings with SF Symbols, Inbox badge), emits `tabSelected` to JS, takes
   `selectTab`, `setBadge`, `setTabBarHidden`; haptics commands `impact`
   and `notify`. The web tab bar is removed when the native one is present.
2. **Sheets** as `UISheetPresentationController` with detents: compose,
   Later, actions.
3. **Navigation bar and the interactive pop** as `UINavigationController`;
   large title on Inbox, glass toolbar in the thread.
4. **Context menus** with row preview; **search** as `UISearchController`
   with operator tokens.

Not native, on purpose: the list and reading surfaces, Settings' grouped
list, text selection.

## Acceptance for lane 1

Captures on an iPhone 16 simulator running iOS 26: the glass tab bar over
the inbox in light and dark, minimized after a scroll, and the Inbox badge.
FlowDeck drives: switch tabs by native tap, JS reflects the route; archive a
thread and feel (log) the impact haptic; pull to refresh past the threshold.
Existing 685 tests pass; the web tab bar has no dead code left behind.

## Lane 1 build log — 2026-09-01

Shipped. `src-tauri/plugins/maru-shell` (Rust crate `tauri-plugin-maru-shell`,
Swift package under `ios/`), registered under `cfg(target_os = "ios")` in
`src-tauri/src/lib.rs` and permitted by `maru-shell:default` in
`src-tauri/capabilities/ios.json`. Web side: `src/platform/shell.ts`,
`src/mobile/use-native-shell.ts`, and the wiring in `src/mobile/MobileApp.tsx`,
`src/mobile/state.ts`, `src/mobile/use-pull-refresh.ts`, `src/mobile/mobile.css`.

Gates: `npm run typecheck && npm test && npm run build` pass — 691 tests, six
new over the badge string and the tab-index mapping. `cargo check` (desktop)
and `cargo check --target aarch64-apple-ios-sim` both clean.

Simulator: iPhone 16 on iOS 26.5, demo mode, driven with FlowDeck.

- Native taps on Search and Settings moved the web route; the Inbox tap moved
  it back. Read from the screen, not from a log.
- Archiving from the actions sheet dropped the Inbox badge from 9 to 8 live,
  which is the badge path proven end to end, and logged `[maru-shell] impact
  medium`.
- A Later commit logged `impact medium`. A pull past the threshold logged
  `impact light`. A send logged `notify success`.
- The bar hides itself for every sheet and for the thread and account routes;
  captured while the actions sheet was open.
- The accessibility tree on the inbox has two elements: the application, and
  one `Tab Bar` group. The web layer announces no second tab bar.
- Scrolled to the end of the inbox, the last row clears the glass. UIKit gives
  the child 83 points of bottom safe area and the web layer reads it through
  `env(safe-area-inset-bottom)`.

Captures in `wayfinder/captures/ios/`: `native-tabbar-light.png`,
`native-tabbar-dark.png`, `native-tabbar-badge-light.png`,
`native-tabbar-scrolled-light.png`.

Two findings worth carrying forward.

1. **`contentInsetAdjustmentBehavior = .never` is wrong here.** The charter
   suggested it. WebKit derives CSS `env(safe-area-inset-*)` from the adjusted
   content inset, so `.never` reports zero insets to the page: the inbox header
   climbed under the status bar and the list ran to the bottom edge. Removing
   the line gives the intended result, because UIKit already folds the tab
   bar's height into the child's bottom safe area.

2. **Scroll-minimize does not engage, and `native-tabbar-minimized-light.png`
   is not delivered.** `tabBarMinimizeBehavior = .onScrollDown` is set and
   guarded with `#available(iOS 26, *)`. UIKit tracks a `UIScrollView` to
   decide when to minimize, and the only one in the hierarchy is the WKWebView's
   own. The mobile shell is a fixed-position web app — `.mobile-app` is
   `position: fixed; inset: 0` and every list scrolls inside a DOM container —
   so that scroll view never moves. Verified across many scroll gestures at
   several speeds; the bar never minimized. Letting the document scroll would
   light it up, and would change rubber-banding and keyboard behaviour on every
   phone screen. That is an owner decision, not a lane-1 change.
   `native-tabbar-scrolled-light.png` is delivered in its place: it shows the
   list scrolled under the glass, which is the part that does work.

Owner gate for Nick: decide whether the phone shell moves to document
scrolling so the system bar can minimize on scroll.

The web tab bar is kept, not removed. `?mobile=1` in a browser is the only way
to reach Search and Settings outside the simulator, and captures and design
review run there. It never renders on iOS, so there is no second set of tabs
for VoiceOver to find.

### Simplify pass — 2026-09-01

`/simplify` ran on the lane diff, two agents over the four angles. Applied:

- The archive haptic moved out of `MobileApp.act` into `usePerformAction`,
  beside `playSound('complete')` — the choke point whose own comment says the
  cue must live in "one place, four surfaces". It now shares that cue's 400 ms
  guard, which also closes a real defect: `onArchive(keys)` fans out per key,
  so a bulk archive fired one haptic per thread. Re-verified on the simulator:
  a three-thread bulk archive logs exactly one `impact medium`.
- `TAB_ITEMS` wrote the tab order a second time. The web bar now renders from
  `MOBILE_TABS` with a `TAB_CHROME` label record, so the web bar cannot drift
  out of step with the native indices.
- The two native-shell effects moved into `useNativeShellSync`, so MobileApp
  states the policy in one call instead of carrying two guarded effects. The
  badge effect now depends on the badge string, not the raw unread count, so
  100 to 150 unread sends no IPC.
- `setBadge(0, …)` became `setBadge(indexOfTab('inbox'), …)`.
- `attachNativeShell` returns a detach function; the hook calls it on unmount
  and on a probe that lands after teardown.
- `error.rs` no longer copies maru-auth's `{ code, message }` serializer. The
  Swift side never rejects, so the error serializes as a plain string.
- The three Swift haptic handlers collapsed into one `haptic(_:_:_:)` helper,
  and the `prepare()` calls went: an async warm-up one line before the fire
  pays the cost and buys nothing.
- `use-pull-refresh` gained a `begin()` that resets both gesture flags, so a
  fifth entry point cannot forget one.
- `INBOX_VIEW` is a module constant instead of a render-time literal.
- `MOBILE_BADGE_LIMIT` is module-private; nothing imported it.

Skipped, with reasons:

- Deleting the unused `selection` command. The charter specifies it as part of
  the plugin's API, and the plugin is the deliverable.
- Collapsing the Rust command → handle → `call` transport and the payload
  structs. The charter says to follow maru-auth's boilerplate, and that shape
  is maru-auth's.
- Resolving the native-shell probe in `src/lib/env.ts` beside `platformOS`.
  That module resolves synchronously before either shell mounts; the probe is
  an async invoke and cannot join it without making the whole module async.
- Replacing the Swift install retry loop with a window-attachment observer.
  The poll is bounded, runs only on a cold start before first paint, and the
  observer needs a WKWebView subclass this plugin does not own.
- Moving the send haptic to a shared choke point. Mobile compose calls
  `service.send` directly; there is no shared send mutation to hang it on.
