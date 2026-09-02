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
