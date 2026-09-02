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

- ~~Create the iOS OAuth client~~ — created 2026-09-01: `537601059334-302klho3gdlj3kloseb6akr96o26r855.apps.googleusercontent.com`, also the repository variable `MARU_IOS_GOOGLE_CLIENT_ID`.

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

The account proof files are:

- `account-signed-out-light.png` and `account-signed-out-dark.png`
- `account-ceremony-light.png` and `account-ceremony-dark.png`
- `account-signed-in-light.png` and `account-signed-in-dark.png`
