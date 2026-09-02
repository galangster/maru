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
export VITE_MARU_IOS_GOOGLE_CLIENT_ID="<client-id>.apps.googleusercontent.com"
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
The three tabs are Inbox (`tray`), Search (`magnifyingglass`)
and Settings (`gearshape`).
All three tabs show the same WKWebView.
The plugin moves the web content controller into the selected tab on appearance.
The web layer therefore keeps its state across a tab switch.

The bar is the system's, so the iOS 26 SDK draws it as Liquid Glass.
The plugin sets `tabBarMinimizeBehavior = .onScrollDown` behind
`#available(iOS 26, *)`.
iOS 17 to 25 get the classic bar with no minimize.

The webview keeps the default `contentInsetAdjustmentBehavior`.
That is load-bearing.
WebKit derives CSS `env(safe-area-inset-*)` from the adjusted content inset.
`.never` reports zero insets to the page and puts the header under the status bar.
Left alone, UIKit folds the tab bar's height into the child's bottom safe area.
The measured inset on an iPhone 16 is 83 points.
The web layer reads that through `env(safe-area-inset-bottom)`.
The list then scrolls beneath the glass and its last row still clears the bar.

### Commands and events

The plugin owns these commands:

- `select_tab(index)` selects a tab from JS.
- `set_badge(index, value)` sets or clears a tab badge. `null` clears it.
- `set_tab_bar_hidden(hidden)` hides or shows the bar.
- `impact(style)` plays `light`, `medium`, `heavy`, `soft` or `rigid`.
- `notify(kind)` plays `success`, `warning` or `error`.
- `selection()` plays the selection tick.
- `watch_tabs(channel)` subscribes to native tab taps.

The plugin emits one event, `tabSelected`, carrying `{ index }`.
It rides a Tauri channel, not `addPluginListener`.
A channel argument is registered when Tauri deserializes it from the payload.
It therefore needs no `register_listener` command and no second ACL entry.
Only a real tap emits the event.
UIKit does not call its delegate for a programmatic selection,
so `select_tab` cannot echo back to JS.

### How the web falls back

`src/platform/shell.ts` wraps every command.
Each one is a no-op when the platform is not iOS.
`src/mobile/use-native-shell.ts` probes once through `watch_tabs`.
It answers `null` while the probe is in flight,
then `true` for the native bar and `false` for the web bar.
The pending state stops the web bar flashing under the glass for one frame.

`MobileApp` renders the web tab bar only when the probe answers `false`.
The web bar stays in the codebase for the `?mobile=1` browser preview.
That preview is the only way to reach Search and Settings outside the simulator,
and captures and design review run there.
Under the native shell `--mobile-tab-height` drops to zero,
because UIKit already provides the room through the safe-area inset.

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
- No `selection()` on a tab change. UIKit already plays that one.

The archive haptic rides `usePerformAction` in `src/features/mail/queries.ts`.
It sits beside the `complete` sound, at the one choke point every surface uses.
It shares that cue's 400 millisecond guard.
A bulk archive of twenty threads is therefore one tap, not twenty.

Each haptic writes a debug line under the `maru-shell` log category.
A haptic leaves no trace a simulator can screenshot.
Read them with `flowdeck logs <app-id>`.

### Known limit: scroll-minimize does not engage yet

The minimize behavior is set and correct.
It does not fire in the current application.
UIKit tracks a `UIScrollView` to decide when to minimize.
The only one present is the WKWebView's own scroll view.
The mobile shell is a fixed-position web application.
`.mobile-app` uses `position: fixed; inset: 0`,
and every list scrolls inside a DOM container.
The WKWebView scroll view therefore never moves, and UIKit never minimizes.

Letting the document scroll would light this up.
That change alters rubber-banding and keyboard behavior on every phone screen.
It is an owner decision, not a lane-1 change.
Queue item for Nick: decide whether the phone shell moves to document scrolling.

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
- Background Gmail sync and remote notifications do not run.

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

## iOS OAuth follow-up

The remaining production setup is one value:

- Create the iOS OAuth client for bundle identifier `app.getmaru.ios`.
- Paste its client id into `VITE_MARU_IOS_GOOGLE_CLIENT_ID` for the iOS build.

The client seam, callback registration, PKCE exchange, Keychain filing,
directed consent, Settings entry, and cancellation handling are implemented.

## Verification

Run the repository gates from the root.

```sh
npm run typecheck && npm test && npm run build
```

Simulator proof lives in `wayfinder/captures/ios`.
The folder contains Inbox, Thread, Compose, Later, Settings, account, and empty-state captures in both themes.

The I3 native session proof is `wayfinder/captures/ios/ios-auth-session-light.png`.
It shows `accounts.google.com` inside the system sheet and Google's expected
`invalid_client` result for `PLACEHOLDER-TEST.apps.googleusercontent.com`.
FlowDeck also verified that cancelling the sheet returns to Settings with
`Sign-in cancelled` and does not crash.

The I8 native-shell proof files are:

- `native-tabbar-light.png` and `native-tabbar-dark.png`
- `native-tabbar-badge-light.png`
- `native-tabbar-scrolled-light.png`

The account proof files are:

- `account-signed-out-light.png` and `account-signed-out-dark.png`
- `account-ceremony-light.png` and `account-ceremony-dark.png`
- `account-signed-in-light.png` and `account-signed-in-dark.png`
