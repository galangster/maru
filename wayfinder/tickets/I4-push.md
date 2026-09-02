# I4 — Push on the phone  `wayfinder:task`

status: **blocked by A4** · map 5

APNs registration through a Tauri plugin; `POST /v1/push/register`; the
client calls `users.watch` per account and reports it with
`POST /v1/push/watch`; renewal on open, on background refresh and on every
silent push (watch lasts seven days); silent push → history fetch → local
notification with sender and subject composed on the phone.

---

## Build log — 2026-09-01

Shipped on `lane/i4`: the `maru-push` iOS plugin, iOS keychain accessibility,
the client push loop, and the Settings → Notifications row.

### Gates

- `npm run typecheck` · `npm test` (710 passed, 3 skipped, 25 of them new for
  push) · `npm run build` — all pass.
- `cargo check` (desktop untouched) and `cargo check --target
  aarch64-apple-ios-sim` — both pass; the second compiles the Swift package.
- `npm run tauri -- ios build --debug --target aarch64-sim` in real mode
  (`VITE_MARU_IOS_GOOGLE_CLIENT_ID=537601059334-…`) — BUILD SUCCEEDED. The
  built `Info.plist` carries `UIBackgroundModes: remote-notification`, and
  `Maru.app-Simulated.xcent` carries `aps-environment: development` from the
  per-configuration `APS_ENVIRONMENT` setting.

### On an iPhone 16 simulator, real mode

Verified live, from the app's own os_log (`subsystem app.getmaru.ios`,
`category maru-push`):

    delegate proxy installed in front of AppDelegate
    channel open, 0 buffered event(s)
    APNs token registered (80b92e47…)
    badge set to 0

Settings → Notifications draws the row, the footnote, and the toggle. Tapping
the toggle raised the system alert — "'Maru' Would Like to Send You
Notifications" — with the row underneath reading "Waiting for your answer…".
Accepting it turned the row to "On" and left the switch disabled, because iOS
shows that alert once ever and only iPhone Settings can change the answer
afterwards.

Captures: `wayfinder/captures/ios/ios-notifications-permission-light.png` and
`ios-notifications-granted-light.png`.

### The one thing the simulator cannot show

The wake itself. `flowdeck simulator push` reaches the Simulator's
user-notification system — an alert payload draws its banner — but never calls
the application delegate. With `{"aps":{"content-available":1}}`, foreground
and background, neither
`application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` nor the
legacy `application(_:didReceiveRemoteNotification:)` fired, with
`UIBackgroundModes` set and `aps-environment` in the simulated entitlements.
The Simulator has no background-wake path to simulate.

Everything up to the delegate is proven on the simulator, and the delegate
proxy is proven by the APNs token arriving through it — the same delegate
path the push callback uses. The rest of the chain — `pushReceived` → history
sync → local notification → badge → completion handler — is covered end to end
by `tests/push.test.ts` and is owed one run on a physical iPhone. Queued for
Nick in `wayfinder/NICK-QUEUE.md`; detail in `docs/IOS.md` § What the Simulator
cannot show.

### Two findings worth keeping

1. **Do not graft delegate methods with `class_addMethod`.** It fails
   silently. `UIApplication` reads which optional delegate methods exist when
   the delegate is assigned and keeps the answer, so `respondsToSelector:`
   returns true afterwards and iOS still never calls the method. Re-assigning
   the same object does not refresh that table; assigning `nil` first does, and
   takes wry's window with it — the app drops to the home screen. A forwarding
   proxy in front of Tauri's `AppDelegate` is what works.
2. **`src-tauri/Info.ios.generated.plist` is not committed**, and Tauri parses
   it before it runs `beforeBuildCommand` — so the first iOS build in a fresh
   worktree fails with "failed to parse plist". Run
   `node --import tsx src-tauri/scripts/prepare-ios-oauth.mjs` once, then
   build. Pre-existing; not introduced here.
