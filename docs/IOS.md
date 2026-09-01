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

Set `VITE_MARU_DEMO=1` when building or running the iOS target.
This variable forces `DemoMailService` even when Tauri APIs exist.

The mobile shell also supports browser development at `?mobile=1`.
Use a 390 by 844 point viewport for that path.

Without the override, Maru uses `@tauri-apps/plugin-os` to detect iOS.
Desktop platforms continue to mount the existing desktop application.

## Build and run

Build a debug simulator application with the demo fixtures.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
VITE_MARU_DEMO=1 npm run tauri -- ios build --debug --target aarch64-sim
```

Run and deploy to the named simulator.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
VITE_MARU_DEMO=1 npm run tauri -- ios dev "iPhone 16"
```

If port 1420 is occupied, give both Tauri and Vite another port.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
VITE_MARU_DEMO=1 npm run tauri -- ios dev \
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

The following behavior uses demo fixtures:

- Mail reads and mutations stay inside `DemoMailService` memory.
- Send adds a message to the demo thread and does not contact Gmail.
- Archive, Later, read state, stars, and settings reset after process restart.
- Account rows are fixture accounts. Account management is read-only.
- Background Gmail sync and remote notifications do not run.

## iOS OAuth follow-up

Real Gmail sign-in needs a separate iOS OAuth client and these integration steps:

- Register bundle identifier `app.getmaru.ios` in the Google Cloud project.
- Add the iOS client identifier and its reversed callback scheme to the application metadata.
- Replace the desktop loopback listener with an iOS browser authentication session.
- Route callback URLs back into Maru and validate OAuth state before token exchange.
- Store refresh tokens in the iOS Keychain and test sign-out and token revocation.
- Connect Add account, reauthentication, and consent errors to the mobile Settings screens.
- Verify Gmail scopes, consent configuration, and production redirect registrations.
- Add device tests for cancellation, expired sessions, revoked access, and multiple accounts.

Until that work lands, every iOS build must use demo mode.

## Verification

Run the repository gates from the root.

```sh
npm run typecheck && npm test && npm run build
```

Simulator proof lives in `wayfinder/captures/ios`.
The folder contains Inbox, Thread, Compose, Later, Settings, and empty-state captures in both themes.
