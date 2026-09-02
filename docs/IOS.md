# Maru for iPhone

Maru supports iPhone on iOS 17 or newer through Tauri 2.

The iOS bundle identifier is `app.getmaru.ios`.
The desktop identifier remains unchanged.

## Toolchain setup

Install Rust with the official rustup installer.

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
  sh -s -- -y --no-modify-path
export PATH="$HOME/.cargo/bin:$PATH"
rustup toolchain install stable
rustup default stable
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
```

Export the Cargo path in each new shell.

Install JavaScript dependencies from the repository root.

```sh
npm install
```

The generated Xcode project already lives in `src-tauri/gen/apple`.
Regenerate it only after an intentional Tauri configuration change.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri -- ios init
```

The generated project uses development team `2M8UE59WH7`.
The deployment target is iOS 17.0.

## Demo mode

The default iOS client id is `PLACEHOLDER.apps.googleusercontent.com`.
That exact value keeps the application in demo mode.
A non-default value enables the real Gmail service.

Set the client id before an iOS build.

```sh
export VITE_MARU_IOS_GOOGLE_CLIENT_ID="537601059334-302klho3gdlj3kloseb6akr96o26r855.apps.googleusercontent.com"
# The official iOS client for bundle app.getmaru.ios (created 2026-09-01).
# CI reads the same value from the repository variable MARU_IOS_GOOGLE_CLIENT_ID.
```

The build derives and registers
`com.googleusercontent.apps.<client-id>` as the callback scheme.
The build hook runs `prepare-ios-oauth.mjs` through `node --import tsx`.
That lets the hook and application import the same validated callback helper
from `src/lib/ios-oauth.ts`.

The mobile shell also supports browser development at `?mobile=1`.
Use a 390 by 844 point viewport for that path.

Maru uses `@tauri-apps/plugin-os` to detect iOS.
Desktop platforms continue to mount the existing desktop application.

## Build and run

Build a debug simulator application with the demo fixtures.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri -- ios build --debug --target aarch64-sim
```

For an end-to-end authentication-session check without a production client,
use a non-default invalid id. Google will load and report `invalid_client`.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
VITE_MARU_IOS_GOOGLE_CLIENT_ID=PLACEHOLDER-TEST.apps.googleusercontent.com \
  npm run tauri -- ios build --debug --target aarch64-sim
```

Run and deploy to the named simulator.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri -- ios dev "iPhone 16"
```

If port 1420 is occupied, give both Tauri and Vite another port.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri -- ios dev \
  --config '{"build":{"devUrl":"http://localhost:1421","beforeDevCommand":"npm run dev -- --port 1421"}}' \
  "iPhone 16"
```

Use FlowDeck for simulator control and proof.

```sh
flowdeck simulator create --name "iPhone 16" \
  --device-type "iPhone 16" --runtime "iOS <newest-installed-version>"
flowdeck simulator boot "iPhone 16"
flowdeck simulator launch app.getmaru.ios -S "iPhone 16"
flowdeck ui simulator session start -S "iPhone 16"
flowdeck ui simulator screen -S "iPhone 16" --screenshot --output capture.png
```

The Tauri Xcode build phase needs a live Tauri CLI socket.
For that reason, a standalone `flowdeck build` cannot compile this generated project.
Use the Tauri CLI for builds and deployment.
Use FlowDeck for simulator state, touch automation, appearance, and screenshots.

## Native shell

The bottom chrome on iPhone is UIKit's, not the web's.

The `maru-shell` plugin lives in `src-tauri/plugins/maru-shell`.
It is iOS-only, in the same shape as `maru-auth`.
The Swift half takes Tauri's root view controller out of the window.
It hosts that controller inside a `UITabBarController`.
The web content is adopted once and never moves again.
A tab switch changes no view. It sends the index to the web layer.
`ios/Sources/MaruShellPlugin.swift` states the reason for each choice.

The bar is the system's, so the iOS 26 SDK draws it as Liquid Glass.
The bar minimizes on scroll down and returns on scroll up.
iOS 17 to 25 get the classic bar with no minimize.

The plugin installs itself when the web layer subscribes.
It waits for `UIWindow.didBecomeKeyNotification` on a cold start.

The page sets `viewport-fit=cover`, and that is load-bearing.
Without it WebKit reports every `env(safe-area-inset-*)` as zero.
The webview also keeps the default `contentInsetAdjustmentBehavior`.

`env(safe-area-inset-bottom)` carries the home indicator and nothing else.
The iOS 26 bar floats over the content and insets nothing.
The plugin measures the bar and publishes `--maru-native-tab-inset`.
`mobile.css` adds that where the web tab bar's height used to go.
The value is held at the expanded height while the bar is on screen.
The page therefore does not reflow as the bar minimizes,
and the last row still clears the glass.

### The tab list has one source

`MOBILE_TABS` in `src/mobile/state.ts` holds the order.
`MOBILE_TAB_CHROME` holds each tab's label, web icon and SF Symbol.
The web layer sends those descriptors with `watch_tabs`.
Swift writes no tab list of its own.
`tests/mobile-state.test.ts` asserts the mapping.

### The phone scrolls the document

Every phone screen scrolls the page, not an inner container.
UIKit minimizes the tab bar by watching a `UIScrollView`.
The only scroll view present is the WKWebView's own.
A fixed-position shell never moves it, and the bar never minimizes.

`src/mobile/mobile.css` holds the layout and the reasons.

Sticky or fixed follows one rule. The push and the edge-back animation put a
transform on the thread screen and the account screen. A transformed ancestor
is the containing block for a fixed child, so a fixed element inside those
screens pins to the bottom of a page-tall screen instead of the bottom of the
phone. Inside a transformed screen, use `position: sticky` or portal the
element to `.mobile-app`. Everywhere else, `position: fixed` is correct.
Headers are sticky. The web tab bar and the bulk toolbar are fixed. The thread
toolbar is sticky. Sheets portal.

The inbox list uses `useWindowVirtualizer`.
Pull to refresh reads `window.scrollY`.
A sheet holds the page still through CSS, not by pinning the body:
`html:has(.mobile-sheet-layer)`.
Pinning the body would report a scroll offset of zero to the virtualizer.
`src/mobile/use-route-scroll.ts` restores each screen's scroll position.
`.mobile-nav::before` paints through the status bar strip.
Toasts clear the bar through `--maru-native-tab-inset` as well.
No `overscroll-behavior` is set. Rubber-banding stays the system's.
A long press is cancelled by `scroll` and by `touchmove`.
The scroll view claims the gesture, so the row stops seeing pointer events.

### The inbox stays mounted

The stage keeps one screen mounted for the life of the shell: the inbox.
Every other screen mounts when it becomes the visible screen.
It unmounts when it stops being the visible screen.
That is the rule for the thread, the account, search and settings.

The inbox is the exception because a remount costs the most there.
It owns a window virtualizer, its measured row heights,
and the measured top of its list.
It is also the screen a thread is opened from and returned to.
Search and settings hold no measurement worth keeping.

`visibleScreen()` in `src/mobile/state.ts` states the rule.
It returns the tab while the stack is at its root.
It returns `thread` or `account` while a screen is pushed.
`tests/mobile-state.test.ts` asserts it.

`MobileApp` passes `hidden` to `InboxScreen`.
`InboxScreen` sets `hidden` and `inert` on its own section.
`hidden` takes the screen out of flow. `inert` keeps VoiceOver and focus out.
`.mobile-screen[hidden] { display: none }` is required in `mobile.css`.
The UA rule for `[hidden]` loses to the author `display: flex` without it.

The screen must leave the flow, not just become invisible.
The document is the scroller, so the page height must be the top screen's.
The thread screen keeps its push transform, because it is the only screen
in flow while it is up.

`hidden` also sets `enabled: false` on the virtualizer. That does three things.

1. It drops the window scroll listener.
   A thread's scrolling then re-renders nothing behind it.
2. It disconnects the row `ResizeObserver`.
   A `display: none` row measures zero, and that zero would be cached.
3. It reports a size of zero, so the range empties and no row renders.

The measured row heights survive all three. That is the point of the change.

Returning to the inbox sets `enabled: true` again.
The virtualizer then asks `initialOffset` for the scroll position.
It asks during the render, one commit before `useRouteScroll` restores it.
So `useRouteScroll` returns `readScrollTop`, and `InboxScreen` passes that.
`readScrollTop` gives the offset the page is going to,
not the offset of the screen being left.
`window.scrollY` would give the wrong one, and the first frame would be wrong.
`initialRect` is answered with the real viewport for the same reason.

The restore is exact, and it is no longer racing a remount.
The list is full height on the frame it appears, from the cached measurements,
so `window.scrollTo` cannot be clamped to a shorter page.

### Commands and events

The plugin owns these commands:

- `select_tab(index)` selects a tab from JS.
- `set_badge(index, value)` sets or clears a tab badge. `null` clears it.
- `set_tab_bar_hidden(hidden)` hides or shows the bar.
- `impact(style)` plays `light`, `medium`, `heavy`, `soft` or `rigid`.
- `notify(kind)` plays `success`, `warning` or `error`.
- `prepare_haptics()` wakes the Taptic Engine before a gesture.
- `watch_tabs(channel, tabs)` builds the bar and subscribes to taps.
- `unwatch_tabs()` clears the channel.

The plugin emits one event, `tabSelected`, carrying `{ index }`.
It rides a typed Tauri channel, not `addPluginListener`.
Only a real tap emits the event.
UIKit does not call its delegate for a programmatic selection,
so `select_tab` cannot echo back to JS.

### How the web falls back

`src/platform/shell.ts` wraps every command.
Each one is a no-op when the platform is not iOS.
`src/mobile/use-native-shell.ts` subscribes once through `watch_tabs`.
It answers `null` while the call is in flight,
then `true` for the native bar and `false` for the web bar.
The pending state stops the web bar flashing under the glass for one frame.

`MobileApp` renders the web tab bar only when the answer is `false`.
The web bar stays in the codebase for the `?mobile=1` browser preview.
That preview is the only way to reach Search and Settings outside the simulator,
and captures and design review run there.
`--mobile-tab-height` drops to zero whenever a native bar is possible,
so no dead padding is reserved under the glass on a cold start.

The native bar draws over the webview.
The web layer therefore hides it for the thread route, the account route,
the composer and every bottom sheet.

Only one tab bar exists at a time.
VoiceOver and reduced motion are the system's on iOS.
The FlowDeck accessibility tree on the inbox reports exactly two elements:
the application, and one `Tab Bar` group.

### Haptics

- `impact("medium")` on archive and on a Later commit.
- `impact("light")` when a pull crosses the refresh threshold.
- `notify("success")` on send.
- No selection tick on a tab change. UIKit already plays that one.

Archive and Later ride their mutations in `src/features/mail/queries.ts`.
`cue()` in `src/lib/cue.ts` fires the completion sound and its haptic together.
One policy decides both, so they cannot disagree.
A bulk archive of twenty threads is one tap, not twenty.

The plugin keeps one feedback generator per style for the life of the app.
`prepare_haptics()` runs at the start of a pull, when a sheet opens,
and when the shell installs.

Each haptic writes a debug line under the `maru-shell` log category.
A haptic leaves no trace a simulator can screenshot.
Read them with `flowdeck logs <app-id>`.

## Push

Maru's push is content-free, by design and permanently
(`docs/spec/MARU-ACCOUNT.md` §1 and §9). The relay says only "something
changed for this address". The phone then fetches from Gmail with its own
token and composes every word a person reads.

The chain is Gmail → Pub/Sub → the Maru relay → APNs → this device.

### What runs where

- `src-tauri/plugins/maru-push` is the iOS-only Tauri plugin. It registers for
  remote notifications, hands the APNs device token up as lowercase hex,
  receives the background push, posts the local notification, and sets the
  badge.
- `src/core/push` holds the decisions: when a watch is due, what the
  notification says, what number the badge shows, and what one wake does.
  It has no native or network dependency and is unit-tested in Node.
- `src/platform/push.ts` is the seam. On iOS it is the plugin. Everywhere else
  it reports `unsupported` and does nothing.
- `src/features/notifications/use-push.ts` starts the runtime in the phone
  shell and routes a notification tap into the mobile reducer.

### The application delegate

Tauri owns the `UIApplicationDelegate`. Its iOS plugin API exposes no
lifecycle hook — the Swift `Plugin` base class offers `load(webview:)` and
nothing else, while the Android half of the same API does have delegate
hooks. maru-push therefore installs a **forwarding proxy** in front of Tauri's
`AppDelegate`. The proxy implements three methods and forwards every other
message, and every other `respondsToSelector:` question, to Tauri's delegate:

- `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`
- `application(_:didFailToRegisterForRemoteNotificationsWithError:)`
- `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`

Do not replace this with `class_addMethod` on the live delegate class. That
was tried and it fails silently: `UIApplication` reads which optional delegate
methods exist when the delegate is assigned and keeps the answer, so after the
graft `respondsToSelector:` returns true and iOS still never calls the method.
Re-assigning the same delegate object does not refresh that table. Assigning
`nil` first does refresh it, and takes wry's window down with it — the app
returns to the home screen. All three were measured on an iPhone 16 simulator
on 2026-09-01.

`tauri-plugin-notification` claims `UNUserNotificationCenter.delegate` and
force-unwraps its own map for a notification it did not schedule. maru-push
takes the delegate and forwards everything that is not its own, which keeps
that plugin working and keeps it away from that crash.

### What the Simulator cannot show

`simctl push` (via `flowdeck simulator push`) reaches the Simulator's
user-notification system — an alert payload draws its banner — but it never
invokes the application delegate. Neither
`application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` nor the
legacy `application(_:didReceiveRemoteNotification:)` fires, with the app in
the foreground or the background, with `UIBackgroundModes` set and
`aps-environment` present in the simulated entitlements. The Simulator has no
background-wake path to simulate.

So the wake half of push — `pushReceived` → history sync → local notification →
badge → completion handler — is verified by unit test (`tests/push.test.ts`)
and is owed one run on a physical iPhone. Everything up to the delegate is
verified live on the Simulator: the proxy installs, the permission alert
appears, `registerForRemoteNotifications` runs, and the APNs device token
arrives **through the proxy**, which is the same delegate path the push
callback uses.

### Keychain accessibility

iOS writes its keychain items with `kSecAttrAccessibleAfterFirstUnlock`
(`src-tauri/src/ios_keychain.rs`). The `keyring` crate takes the system
default, `WhenUnlocked`, which a push-woken background fetch cannot read after
a reboot. The item shape — class, service, account — is unchanged, so entries
written by an earlier build are still found and re-stamp themselves on the
next write. Desktop keeps `keyring` untouched.

### Project settings

- `UIBackgroundModes: remote-notification` is in `project.yml`,
  `wren_iOS/Info.plist`, and the plist that `prepare-ios-oauth.mjs` generates
  for the Tauri merge.
- `aps-environment` in `wren_iOS/wren_iOS.entitlements` reads the
  `APS_ENVIRONMENT` build setting: `development` for debug, `production` for
  release. The relay's APNs key is `T89G5MWVBQ`, production.
- The relay's Pub/Sub topic is `projects/maru-mail-prod/topics/gmail-push`.

### The loop

1. On iOS with notifications granted, the device registers with APNs and
   reports the token with `POST /v1/push/register`.
2. For each Gmail account the client calls `users.watch` — INBOX only, so a
   sent message or a label sweep does not spend a wake — and reports the
   expiration with `POST /v1/push/watch`. Google grants seven days; Maru
   renews on app open, on every return to the foreground, and after every
   push, whenever the remaining life is under a day.
3. A push wakes the app. The relay names no address and never could, so every
   account runs an incremental history sync.
4. Each arrival pass becomes one local notification, composed on the phone
   from the sender and subject this device just fetched. Tapping it opens the
   conversation.
5. The badge is set to the unread count of the unified inbox.
6. The completion handler iOS gave us is answered when the sync finishes, and
   in any case within 25 seconds.

Off iOS, and with no Maru account signed in, every one of these is a no-op.

### Settings

Settings → Notifications carries the permission state and a toggle that shows
the system alert. iOS shows that alert once ever, so once the answer is
granted or denied the row says so and points at iPhone Settings rather than
offering a switch that would do nothing. The footnote states that new mail
reaches the phone only with a Maru account signed in.

## Current behavior

The following behavior is real in the iOS application:

- The native Tauri wrapper, safe areas, system appearance, and iPhone status areas.
- Inbox navigation, search operators, account lenses, swipe actions, long press, and multi-select.
- Thread push and pop transitions, edge-swipe back, sanitized message bodies, and attachment rendering.
- Compose and reply sheets, the system file picker, discard confirmation, and the system share sheet.
- Later presets, grouped settings, pull to refresh, and the animated Maru empty state.
- Maru account sign-in, sign-up, recovery, device management, history restore, password changes, sign-out, and account deletion.
- Account subscription management opens `https://getmaru.app/account` in the system browser. The phone contains no purchase control.
- Phone Settings can start Gmail sign-in in a persistent `ASWebAuthenticationSession`.
- iOS uses the reversed-client callback, public-client PKCE exchange, and iOS Keychain storage.
- Account vaults file current-device tokens under `credentials.ios` and list desktop addresses for directed consent.

The following behavior uses demo fixtures:

- Mail reads and mutations stay inside `DemoMailService` memory.
- Send adds a message to the demo thread and does not contact Gmail.
- Archive, Later, read state, stars, and settings reset after process restart.
- Maru account operations stay inside `DemoAccountClient` memory.
- Demo account data resets after process restart.
- Background Gmail sync does not run. Remote notifications need a Maru
  account and a Gmail account, so demo mode arms no watch; the plugin, the
  permission prompt, the badge and the local notification are all live.

## Phone accessibility verification

The I2 polish pass was checked on an iPhone 16 simulator on 2026-09-01.
FlowDeck drove the inbox, thread, compose, and account routes by touch.

- Inbox controls have names and state attributes. Swipe actions remain available from the labeled long-press menu.
- Thread controls have names. Expanded messages report their state. The toolbar has a named toolbar role.
- Compose controls have names. Recipient chips expose the full address. Sheets trap focus and restore it after close.
- Account controls have names. Authentication tabs report selection. Account sheets and recovery trap focus.
- Sent, Archived, and sync changes use polite live regions.

The Accessibility Inspector audit did not complete against the Tauri WebView.
It remained at `Auditing...` and returned no child findings.
Source review verified roles, labels, and focus order.
The FlowDeck run verified the same control path by touch in the simulator.
A VoiceOver pass on a physical iPhone is still owed.
Queue item for Nick: complete and record that physical-device VoiceOver pass.

## Dynamic Type verification

The phone root uses the iOS body font size.
All mobile type sizes derive from that root with relative units.
FlowDeck tested the default `large` category and `extra-extra-extra-large`.
Inbox rows remeasure their content. Compose rows, chips, tab bars, and toolbars grow without clipping.

Large-text proof files are:

- `inbox-large-text-light.png`
- `thread-large-text-light.png`
- `compose-large-text-light.png`

## iOS OAuth

The production iOS OAuth client is live.
It was created for bundle identifier `app.getmaru.ios` on 2026-09-01.
Pass it as `VITE_MARU_IOS_GOOGLE_CLIENT_ID` for a real-mode iOS build.

- ~~Create the iOS OAuth client~~ — created 2026-09-01: `537601059334-302klho3gdlj3kloseb6akr96o26r855.apps.googleusercontent.com`, also the repository variable `MARU_IOS_GOOGLE_CLIENT_ID`.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
VITE_MARU_IOS_GOOGLE_CLIENT_ID=<ios-client-id>.apps.googleusercontent.com \
  npm run tauri -- ios dev "iPhone 16"
```

Verified on the simulator on 2026-09-01.
Settings reports `Gmail mode`.
`Add Gmail account` opens the system consent alert.
`Continue` opens `accounts.google.com` in the authentication session.
Google shows its real sign-in page, headed `to continue to Maru Mail`.
It no longer reports `invalid_client`.
Cancelling the sheet returns to Settings and reports `Sign-in cancelled`.
The proof is `wayfinder/captures/ios/ios-auth-real-client-light.png`.
No account was signed in.

The client seam, callback registration, PKCE exchange, Keychain filing,
directed consent, Settings entry, and cancellation handling are implemented.

## Verification

Run the repository gates from the root.

```sh
npm run typecheck && npm test && npm run build
```

Simulator proof lives in `wayfinder/captures/ios`.
The folder contains Inbox, Thread, Compose, Later, Settings, account, and empty-state captures in both themes.

The I4 push proof files are:

- `ios-notifications-permission-light.png` — the system permission alert over
  Settings → Notifications, with the row reading "Waiting for your answer…".
- `ios-notifications-granted-light.png` — the row after Allow, reading "On".

The I3 native session proof is `wayfinder/captures/ios/ios-auth-session-light.png`.
It shows `accounts.google.com` inside the system sheet and Google's expected
`invalid_client` result for `PLACEHOLDER-TEST.apps.googleusercontent.com`.
FlowDeck also verified that cancelling the sheet returns to Settings with
`Sign-in cancelled` and does not crash.

The I8 native-shell proof files are:

- `native-tabbar-light.png` and `native-tabbar-dark.png`
- `native-tabbar-badge-light.png`
- `native-tabbar-scrolled-light.png`
- `native-tabbar-minimized-light.png`
- `ios-auth-real-client-light.png`

The account proof files are:

- `account-signed-out-light.png` and `account-signed-out-dark.png`
- `account-ceremony-light.png` and `account-ceremony-dark.png`
- `account-signed-in-light.png` and `account-signed-in-dark.png`
