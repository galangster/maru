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

`/simplify` ran on the lane diff. Read the provenance before the list: two
review agents were launched over the four angles, but their reports had not
landed when the fixes below were applied, so **every finding here is the
orchestrator's own review of the diff, not an agent's**. The agents were asked
for their reports afterwards; anything they raise that is not already covered
is appended below as a second pass. Applied:

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

## Lane 2 build log — 2026-09-01

The owner gate from lane 1 is answered: **the phone scrolls the document**, and
the Liquid Glass bar minimizes on scroll down and comes back at the top.
`native-tabbar-minimized-light.png` is delivered.

Four commits, one per part.

### Part 0 — the document scrolls

`.mobile-app` stops being a fixed viewport pane. `html`, `body` and `#root` are
unparked for the shell through `html:has(.mobile-app)`, so the desktop base
layer is untouched and the rule follows the shell into whichever bundle it lands
in. Every screen's main region — inbox, search, settings, thread, account — is
page content now; `.mobile-scroll` keeps its name and stops being a scroller.
Headers hold their place with `position: sticky`. The web tab bar and the bulk
toolbar are fixed; the thread toolbar is sticky, because its screen keeps a
transform from the push animation and a transformed ancestor is the containing
block for a fixed child. The inbox uses `useWindowVirtualizer`, pull to refresh
reads `window.scrollY`, and `use-route-scroll.ts` gives the stack its scroll
behaviour back. No `overscroll-behavior` anywhere: rubber-banding is the
system's, which is the same gesture UIKit reads.

### Part 1 — the plugin

The web content is adopted once, as a child of the tab bar controller pinned
under the bar, and never re-parented. All three tabs are the same page, so a
switch moves no views at all and the WKWebView keeps its layers, its first
responder and its scroll position; selection reaches JS through the delegate
alone. `setContentScrollView(_:for:)` names the scroll view UIKit must watch to
minimize, which its own heuristic could no longer find.

One retained generator per feedback style, warmed by `prepare_haptics()` at the
boundaries that end in a haptic. Installation waits on
`UIWindow.didBecomeKeyNotification` instead of a hundred 50 ms timer hops, and
starts at `watch_tabs` — the bar cannot be built before the web layer says what
is on it. The tab descriptors come from `MOBILE_TABS` and `MOBILE_TAB_CHROME`;
Swift writes no tab list. `unwatch_tabs` added, `selection()` deleted end to
end, `Channel<TabSelected>` replaces `Channel<serde_json::Value>` and the
`serde_json` dependency goes with it.

### Part 2 — the web seam

The bar's selection is a projection of `navigation.tab`, mirrored in
`useNativeShellSync` beside `hidden` and the badge. The Later haptic rides
`useDefer`; the send cue plays sound and haptic at one moment. `lib/cue.ts`
binds a cue to what it feels like over one guard — `rateLimit(key, ms)` in
`sound-policy.ts` — which is the half of the policy a silent confirmation
needs, because `decideSound` only records a cue that was audible and sound is
off by default. `lastCompleteHaptic` is gone. `data-native-shell` is
synchronous, and the unread query that feeds the badge runs only when there is
a bar to put it on.

### Part 3 — six defects the simulator found

None of these were visible in the `?mobile=1` preview.

1. `viewport-fit=cover` was never set, so every `env(safe-area-inset-*)` in
   `mobile.css` was reading zero and living off its fallbacks.
2. An empty, clear tab host view is still hit-testable: the web content
   received no touches at all until the stacking was fixed.
3. `insertSubview(_:belowSubview:)` at install runs before UIKit finishes
   adding its own subviews. The order is re-asserted every layout.
4. React's development double-mount tore down the first subscription after the
   second had landed, and `unwatch_tabs` took the live channel with it: the bar
   highlighted the tapped tab and the route never moved.
5. The bar's height reaches the page as `--maru-native-tab-inset`, published by
   the controller. `contentLayoutGuide` reports the full view — the iOS 26 bar
   floats over content on purpose — and `additionalSafeAreaInsets` on the
   content controller does not reach WebKit's `env()`. Held at the expanded
   height so the page does not reflow as the bar shrinks.
6. A drag became a long press: with the page as the scroller, WebKit hands the
   gesture to the scroll view and the row stops seeing pointer events, so
   nothing cancelled the 480 ms timer. `scroll` and `touchmove` both cancel it.

Two changes followed. The sheet scroll lock is CSS
(`html:has(.mobile-sheet-layer)`), not a pinned body — pinning reported a
scroll offset of zero to the window virtualizer and the inbox went blank behind
every sheet, so `use-body-scroll-lock.ts` is gone. And `.mobile-nav::before`
paints through the status bar, where content that has passed the sticky header
is otherwise drawn over the clock.

One more defect, found while proving the sign-in cancel: toasts were landing
under the bar. They now read `--maru-native-tab-inset` too.

### Gates

`npm run typecheck && npm test && npm run build` pass — 696 tests, five new
over the tab-descriptor mapping and the shared cue clock. `cargo check` and
`cargo check --target aarch64-apple-ios-sim` both clean.

### Simulator — iPhone 16, iOS 26.5, FlowDeck

- The bar minimizes on scroll down and returns at the top of the list.
- Native taps on Search and Settings move the web route; Inbox moves it back.
- An archive from the actions sheet drops the badge from 9 to 8 and logs
  exactly one `impact medium`. A Later commit logs one. A pull past the
  threshold logs `impact light`. A send logs `notify success`. (The log stream
  repeats each line; the timestamps are single.)
- The last row of the inbox clears the glass.
- A sheet holds the list still behind it, at the position it was left.
- Real client: Settings reports `Gmail mode`, the consent alert appears,
  and Google's real sign-in page loads headed `to continue to Maru Mail`.
  Cancelling returns to Settings with `Sign-in cancelled`. No account signed in.

Captures in `wayfinder/captures/ios/`: `native-tabbar-light.png`,
`native-tabbar-dark.png`, `native-tabbar-badge-light.png`,
`native-tabbar-scrolled-light.png`, `native-tabbar-minimized-light.png`,
`ios-auth-real-client-light.png`.

### Owed

- `/simplify` did not run on this lane's diff. A delegate never seals; the
  orchestrating session owns that pass.
- The context menu still opens if a finger rests on a row for 480 ms without
  moving at the very end of the list. `touchmove` covers every case reachable
  by hand; the residual is synthetic-input only, and worth one more look.
- Lane 3 of the charter — sheets as `UISheetPresentationController` — is
  untouched, and the bottom sheets are still the web's.

## Lane 3 build log — 2026-09-01

The third delegated lane, not charter lane 3 — sheets as
`UISheetPresentationController` is still untouched. This lane applied the
orchestrator's two-reviewer pass over the lane 1 and lane 2 diff. Behaviour is
unchanged except where a finding names a defect.

### Applied

- `src/mobile/screens/inbox-screen.css` deleted with its import: its only rule
  was an `overscroll-behavior` on an element that no longer scrolls.
- `lib/cue.ts` narrowed to `CueName = 'complete' | 'sent' | 'defer'`, so `FEEL`
  is a total `Record` and the `Partial`, the `?.` and the absent-entry
  paragraph are gone; `defer` is the soundless cue.
- `useDefer` calls `cue('defer')`; the direct `rateLimit` and `nativeShell`
  pair, and their imports, are gone from `queries.ts`.
- The inbox `listTop` measurement runs on
  `[rootFontSizePx, editing, query.isPending, rows.length === 0]` instead of
  every render, and the row transform reads `virtualizer.options.scrollMargin`
  rather than holding a second copy of it.
- `use-route-scroll.ts` coalesces the scroll sample into one
  `requestAnimationFrame` per frame, still `passive`.
- `.mobile-nav::before` is `max(env(safe-area-inset-top), 64px)` tall, not
  `100vh`.
- The sonner override is scoped under `html:has(.mobile-app)` and hoists its
  repeated `calc()` into `--mobile-toast-offset`, whose fallback now agrees
  with `.mobile-app[data-native-shell]` — zero, not 84px. `!important` stays:
  sonner writes both offsets as inline styles, which no selector outranks.
- The leftover `min-height: 0` is off `.mobile-scroll`.
- One `useHapticBoundary()` in `use-native-shell.ts` replaces the duplicated
  `prepareHaptics` effect in `bottom-sheet.tsx` and `compose-sheet.tsx`.
- A successful long press calls `cancelLongPress()` first, so the `scroll` and
  `touchmove` listeners it armed come off instead of outliving the row.
- `impact` in `MaruShellPlugin.swift` does one lookup:
  `(impactGenerators[args.style] ?? impactGenerators["medium"])?.impactOccurred()`.
- `tests/mobile-state.test.ts` drops a length assertion the `toEqual` above it
  already made, and the second tab test is reduced to the web `icon`, the only
  half the descriptor test does not cover.
- `docs/IOS.md` states the sticky-versus-fixed rule and its cause once — a
  transformed ancestor from the push and edge-back animation is the containing
  block for a fixed child — and the four code comments that repeated it
  (`mobile.css` on `.mobile-nav`, `.mobile-bulk-toolbar` and
  `.mobile-thread-toolbar`, and the portal comment in `bottom-sheet.tsx`) are
  now pointers to it.

### Deferred to the next I8 lane

Keep `InboxScreen` mounted across a thread push, so the window virtualizer does
not rebuild on every return (reviewer efficiency finding 2). Not taken here
because it changes the stage's mounting model, which is a wider change than a
cleanup lane should make on its own.

### Attribution correction for lane 1

The lane 1 build log's simplify section describes two review agents. They were
the lane's own reading of its diff, not a separate review. The orchestrator's
independent two-reviewer pass ran afterwards; its findings were applied in
lane 2 and in this lane.

### Gates

`npm run typecheck && npm test && npm run build` pass — 696 tests, 41 files.
`cargo check` and `cargo check --target aarch64-apple-ios-sim` both clean. The
Swift change is not covered by either `cargo check`; Xcode compiles that half.

## Lane 4 build log — 2026-09-01

The deferred item from lane 3 is closed: **`InboxScreen` is mounted for the
life of the phone shell.** A thread pushes over it, a tab switch hides it, and
in both cases the window virtualizer, its measured row heights, `listTop` and
the scroll position survive.

### The rule, written down

The stage keeps one screen mounted: the inbox. Every other screen — thread,
account, search, settings — mounts when it becomes the visible screen and
unmounts when it stops being it. The inbox is the exception because it is the
only screen that pays for a remount, and it is the screen a thread is opened
from and returned to. `docs/IOS.md` § "The inbox stays mounted" holds the rule
and the reasons.

`visibleScreen(route)` in `src/mobile/state.ts` is the whole rule as one pure
function: the tab while the stack is at its root, otherwise `thread` or
`account`. Three tests in `tests/mobile-state.test.ts` cover it. It also
replaces the four-way ternary that used to choose the screen in `MobileApp`,
and it collapses the three route-scroll keys into `screen:<name>`.

### How the inbox hides

- `InboxScreen` puts `hidden` and `inert` on its own section. `hidden` takes it
  out of flow so the document's height is the top screen's; `inert` keeps
  focus and VoiceOver out. `.mobile-screen[hidden] { display: none }` is
  required — a UA `[hidden]` rule loses to the author `display: flex`.
- `hidden` also sets `enabled: false` on the virtualizer, which is what makes
  the hidden screen free and safe. It drops the window scroll listener, so a
  thread's scrolling re-renders nothing behind it. It disconnects the row
  `ResizeObserver` — without that, every row of a `display: none` list measures
  zero and the zero is cached, which would be worse than the remount. And the
  reported size falls to zero, so the range empties and no row renders. The
  measured heights survive all three.
- The `listTop` measurement is guarded on `hidden` for the same reason: a
  hidden screen's `offsetTop` reads zero, and a refetch landing behind a thread
  would otherwise overwrite the real value with it.

### How the return is exact

Re-enabling the virtualizer clears its remembered offset, so it asks
`initialOffset` again — during the render, which is one commit before
`useRouteScroll` restores the page. `window.scrollY` there is the offset of the
screen being left. So `useRouteScroll` now returns `readScrollTop`, which gives
the offset the page is *going* to while a restore is pending, and `InboxScreen`
passes it as `initialOffset`. `initialRect` is answered with the real viewport
for the same reason: the first frame of the return is a full screen of rows
instead of an empty one waiting on a resize callback.

`useRouteScroll` also re-asserts the target once on the next frame. Measured:
the single `scrollTo` does not always stick, because the page moves twice in
that frame — WebKit re-applies its own idea of the old offset, and the
virtualizer compensates its first row measurements.

### Simulator — iPhone 16, iOS 26.5, demo mode, FlowDeck

Deployed with `npm run tauri -- ios dev "iPhone 16"` after
`node --import tsx src-tauri/scripts/prepare-ios-oauth.mjs`. The stale install
from an earlier lane was uninstalled first.

- Scrolled the inbox to the middle, opened a thread, went back: the inbox is
  there on the **first frame** — no skeleton, no empty range, no blank strip.
  The immediate capture and the settled capture are the same screen.
- The scroll offset is restored exactly. Instrumented on the device:
  `y=1702` before the push, `y=1702` after the return, with the list's page
  position (`listAbs=213`) unchanged.
- Switched to Search and back: same, and the immediate frame is again the full
  list.
- The old behaviour was measured on the same simulator for comparison, by
  reverting only the mounting model: **returning from a thread landed at the
  top of the inbox**, losing the position completely.

`wayfinder/captures/ios/native-inbox-return-light.png` is the inbox after a
thread return, deep in the list.

### One finding, carried forward

The restored *offset* is exact, but the rows can sit about one row lower than
they did, because the list re-measures under it. `@tanstack/virtual` does not
measure a row while `isScrolling` is true, so rows that scroll past keep the
`5.5rem` estimate; they are measured for real when they next mount, and the
list grows. Measured live: the list's height went 3071 → 3176 across one thread
return, and 3271 → 3071 during ordinary scrolling with no thread involved. So
this is an estimate-versus-measurement drift in the list, present before this
lane and independent of the mounting model. Closing it means anchoring the
restore on an item index rather than a pixel offset, or bringing
`estimateSize` onto the real row height. Neither belongs in this lane.

### Gates

`npm run typecheck && npm test && npm run build` pass — 730 tests, three new
over `visibleScreen`. No Rust or Swift changed, so neither `cargo check` was
re-run.

### Owed

`/simplify` did not run as its own pass. A lane delegate may not spawn the two
review agents that pass needs, so the orchestrating session owns it. The lane's
own review of its diff produced the `hidden` guard on the `listTop`
measurement, the `.mobile-screen[hidden]` rule, and `visibleScreen` replacing
the ternary chain.
