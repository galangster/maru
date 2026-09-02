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

## Lane 2 — cleanup, 2026-09-01

One pass over the push surface: one defect, four efficiency items, three
altitude items, eight simplifications. Behaviour is otherwise unchanged.

**The defect.** `handlePush` resolved the iOS completion handler before the
notification was posted — `announce` was fire-and-forget. The runtime now
tracks the announcements in flight and `handlePush` awaits
`Promise.allSettled` on them, after the refresh and before the badge and
`completePush`. Two tests cover it: a slow notify holds the completion until it
lands, and a failing notify still completes.

**Efficiency.**

1. `PushRuntime.onForeground` is single-flight. iOS raises `visibilitychange`
   and `focus` on the same return, and that was two permission reads and two
   watch sweeps.
2. The badge count is memoised. The native write is skipped when the number has
   not moved, and during a wake `handlePush` owns the single write — `announce`
   no longer writes one per arrival.
3. `pushPort()` is a module-level lazy singleton and `TauriPushPort.start` opens
   the plugin channel once per process. A remount re-subscribes instead of
   opening a second channel, so no second `start` and no second
   `registerForRemoteNotifications`.
4. The Settings row reads `usePushUi` field by field through selectors.
5. The Swift pre-channel buffer is capped at the last 20 events. A dropped
   `pushReceived` still answers its completion handler with `.noData`.

**Altitude.**

6. `PushMailService.startPushWatch` is optional and `renewWatches` returns
   early when it is absent — a build that cannot call `users.watch` no longer
   logs one failure per account. The hook's identity-forwarding adapter is
   gone: the mail service is passed straight through.
7. Sign-in calls the new `PushRuntime.onRelayAvailable()` — register the token,
   arm the watches — instead of a full `onForeground()`.
8. `requestPermission` no longer guards the `renewWatches` call on the
   permission. `renewWatches` is the single decision point.

**Reuse and simplification.**

9. The dead `token` command is gone from Swift, `mobile.rs`, `commands.rs`,
   `build.rs`, `lib.rs` and `permissions/default.toml`; its autogenerated toml
   is deleted and `reference.md` and `schemas/schema.json` regenerated by the
   plugin build.
10. One `forward(selector:else:)` helper replaces the two hand-rolled
    previous-delegate forwards.
11. `PushOk` / `OkResponse` are gone. `set_badge_count`,
    `schedule_local_notification` and `complete_push` return `()`, and Swift
    answers with a bare `invoke.resolve()` — which the bridge sends as `null`
    and serde reads as `()`.
12. `push-store.ts` exposes one `setPushUi(patch)` instead of four setters.
13. The hook keeps `runtimeRef` only; the parallel local binding is gone.
14. The `permissionState` getter is gone from `PushRuntime`; the test asserts
    through the `onPermission` spy.
15. `MaruAppDelegateProxy.install(plugin:)` takes the plugin as a weak
    property. `static weak var current` and the `class_addMethod` note are
    gone — that finding is recorded above, under "Two findings worth keeping".

### One item not applied, and why

The `#available` fallbacks in `setBadgeCount` (iOS 16) and `willPresent`
(iOS 14) **stay**. Package.swift pins iOS 17, but it does not decide what this
compiles against: swift-rs builds the package at the deployment target Tauri
hands it — iOS 13, clamped up to 15 under Xcode 27. Removing the guards fails
`cargo check --target aarch64-apple-ios-sim` with "'list' is only available in
iOS 14.0 or newer". Measured 2026-09-01. The comment above `setBadgeCount` was
therefore not stale; it is rewritten to name the real cause and the failing
command, so the next reader does not try again.

### Gates

`npm run typecheck`, `npm test` (716 passed, 3 skipped), `npm run build`,
`cargo check` in `src-tauri`, and `cargo check --target aarch64-apple-ios-sim`
in `plugins/maru-push` — which compiles the Swift package — all pass.

`src-tauri/gen/schemas/*.json` still name `maru-push:allow-token`. Those are
regenerated by an iOS build of the application, not by this lane's gates, and
they will drop it on the next one.
