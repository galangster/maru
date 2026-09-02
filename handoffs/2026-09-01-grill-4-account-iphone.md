# Handoff — 2026-09-01, grill 4: the account, the phone, and production

Baseline `395608e` → **see `git log`, HEAD after the I4 and store-shots merges** on `main`, pushed to `galangster/maru`.
Working tree clean. **660 tests pass** (638 at the baseline), `tsc` clean,
`vite build` clean; server: 34 tests, typecheck, build. Orchestrated by one
Fable 5.1 session as planner and auditor; seven Codex `gpt-5.6-sol` lanes
did the execution in worktrees (`../wren-lane-{server,vault,ios,ops}`), all
merged. `/simplify` ran on every lane's diff (two Opus reviewers per lane,
every finding applied by a follow-up lane, none skipped).

## What Nick asked, and what was ruled

"One sign in account … a full-blown perfectly designed iOS app … production
quality", then mid-flight: pricing and Stripe. Grill 4 settled 25 rulings;
`wayfinder/GRILL-4-AGENDA.md` is the record and `wayfinder/AUDIT-2026-09-01.md`
the audit (nothing retired; fourteen unraised items decided or queued).

## What shipped today

- **The contract**: `docs/spec/MARU-ACCOUNT.md` — Bitwarden-shaped keys,
  ciphertext-only custodian, per-platform-family credentials, content-free
  push, allowlisted beta, **$5/month or $50/year with a 14-day trial**,
  vault history, recover-start, device rename.
- **The service** (`server/`, A1): Hono on Node 22, Postgres, Argon2id
  proofs, opaque vault with ten-deep history, devices with remote revoke,
  Stripe Checkout/Portal/webhooks with server-computed entitlement,
  Pub/Sub → APNs relay, pglite tests. README and env table in
  `server/README.md`.
- **The desktop account** (A2): `src/core/account/` and Settings → Maru
  account. Walked through in the browser in demo mode: sign up → forced
  twelve-word ceremony → signed-in state with entitlement, devices, history,
  password change, sign out, typed-email delete. Public claims in README,
  SECURITY.md, the site and the dossier rewritten for a world with the
  account.
- **Maru for iPhone** (I1, I2): Tauri iOS target, bundle `app.getmaru.ios`,
  iOS 17+, demo mode forced until I3. `src/mobile/` is Apple's structure with
  Maru's hue and character; virtualized inbox, navigation reducer, two
  gesture hooks, tokens reused. FlowDeck proved open → reply → send → archive
  → pull to refresh on an iPhone 16 simulator; twelve captures in
  `wayfinder/captures/ios/`. Phone entry chunk 191 KB (was 583 KB). Feel
  gates: pass, Tauri continues (verdict on I2).
- **Production paperwork** (A6, A7, A8): privacy and terms drafts on the
  site (marked draft), `docs/SUPPORT.md`, `.github/workflows/release.yml`
  with provenance attestations (never run), `docs/RELEASING.md`,
  `ops/STATUS.md`, `ops/INCIDENT-RUNBOOK.md`, `ops/ACCESS.md`.
- **Railway** (A5): project `maru-sync`, one Postgres, service `sync`
  managed by `.railway/railway.ts` (GitHub source, root `server/`,
  healthcheck, custom domain, allowlist and comp lists). **Live and
  healthy** at `https://sync-production-c0b0.up.railway.app` from commit
  `65d7647`: `/healthz` → `{"ok":true,"version":"0.1.7"}`; prelogin returns
  the KDF and salt; a stranger's signup → 403; the vault and billing without
  a bearer → 401. Every push to `main` redeploys.

## Live surfaces

| Surface | State |
| --- | --- |
| `getmaru.app` | Pages deploys from `main`; today's push put the draft privacy/terms/status pages and the README live |
| `https://sync-production-c0b0.up.railway.app` | the sync service, healthy, allowlisted to Nick's three addresses, comped |
| `sync.getmaru.app` | **live with certificate**; Pub/Sub endpoint moved to it; relay has the APNs secret |
| Installed Maru.app | 0.1.7 on this Mac; it will offer 0.1.8 on its next update check |
| GitHub Releases / updater | **v0.1.8 published** (DMG, tarball, .sig, latest.json); `releases/latest` and `latest.json` both report 0.1.8; Windows `.exe` and `.msi` attached from CI run 33559691464 |

## Open owner gates (all in `wayfinder/NICK-QUEUE.md`, top section)

Stripe account and keys; the two DNS records; Pub/Sub topic + push
subscription + iOS OAuth client in `maru-mail-prod`; APNs key and App Store
Connect app; App Review accounts; lawyer's read; **A9 decision** (Later
across devices); second operator; beta device list.

## Exact resume points

- **Live proof: done.** `tests/live/account-live.test.ts` runs the real
  client code against the deployed service when `MARU_LIVE_SYNC_URL` and
  `MARU_LIVE_EMAIL` are set, and passes: signup with a comped entitlement,
  vault put, second-device login and open, device rename and revoke, delete,
  re-signup. It found three defects the in-process test database could not:
  the comp list only touched existing users (now a standing `comped_emails`
  table, migration 003); the driver returned the KDF column as text (parsed
  at every read); and `@node-rs/argon2` threw on non-UTF-8 Buffer proofs
  (proofs are now hashed as base64url text; test keys carry 0xff so it cannot
  recur). Leaves no account behind.
- **A5 restore drill** is not done.
- **I5 is merged** (`5d8b26c`, `462409b`): Settings → Maru account on the
  phone — signed-out with the segment control, the recovery ceremony, the
  signed-in grouped list with entitlement, "Manage on getmaru.app", devices,
  restore, change password, sign out, delete; sheets in the reducer, edge
  swipe back, lazy chunk. Six captures `account-*.png`. Demo backend until
  I3. **I3** waits on the iOS OAuth client; **I4** on A4.
- **A5 restore drill: done** (see the ticket): dump and restore into a
  scratch database in one second, vault row identical.
- **0.1.8 is published** with the account inside, built with
  `VITE_MARU_SYNC_URL` pointing at the Railway domain until DNS lands.
  Windows installers are attached (CI-built, unsigned, not hand-tested);
  `latest.json` deliberately lists macOS only until the Windows hand-smoke.
- **Polish left on I2**: recipient chips in compose, VoiceOver, Dynamic Type.

## Operational facts learned (also in memory `wren-push-and-railway-ops`)

`gh auth switch -u galangster` before pushing. Railway MCP is denied on this
project; use the CLI (5.47.1). `railway.json` is deprecated and ignored by
new services — never add one. A hook blocks `git checkout` in the primary
worktree; use `git show rev:path > path`.

## Ordered next actions

1. Launch the installed 0.1.7 and accept the 0.1.8 update (proves the updater
   end to end); then sign in to the Maru account from the real app.
2. I3 and I4 as the console items land; A9 once Nick decides; dossier
   "frozen build" fields now name 0.1.8 (Nick).
3. **I2 polish merged** (`8a5c15e`…`e74cb8e`): recipient chips with one
   state machine shared with the desktop `ChipInput`, recipients read from
   the compose store, correspondent suggestions from one hook, native
   semantics instead of promised ARIA widgets, one live region, a type
   scale on `font: -apple-system-body` with `*-large-text-light.png`
   captures. Owed: a VoiceOver pass on a physical iPhone (the Inspector
   audit does not complete against the WebView; queued for Nick).
4. **I3 client side merged** (`a15c876`…`2839c74`): a Tauri iOS plugin
   wrapping `ASWebAuthenticationSession`, one auth strategy chosen before
   the flow (loopback on desktop, auth session on iOS), the `ios` credential
   family threaded from one seam, no cross-family erasure on push (found by
   review, fixed with tests), the iOS client id as a build input
   (`VITE_MARU_IOS_GOOGLE_CLIENT_ID`, placeholder keeps the phone in demo),
   the URL scheme derived from it in one module. Proven on the simulator:
   the sheet presents on accounts.google.com (Google's invalid_client page
   with the placeholder), cancel reads "Sign-in cancelled", no crash. 685
   tests. **What I3 still needs from Nick: the iOS OAuth client id.** Then
   set the variable, rebuild, and the phone signs in to Gmail.
5. **I8 lanes 1–3 merged**: the native shell. `maru-shell` (iOS-only Tauri
   plugin) hosts the WebView in a `UITabBarController`: Liquid Glass tab
   bar, scroll-minimize (the phone now document-scrolls), Inbox badge,
   haptics on archive/Later/send/pull through one `cue()` policy; the web
   tab bar remains only for the `?mobile=1` browser preview. Real Gmail
   client id is live on the phone (Google's sign-in sheet reaches "to
   continue to Maru Mail"). Six simulator-only defects fixed (viewport-fit,
   hit-testing of empty hosts, bar z-order, StrictMode channel, bar inset to
   CSS, drag-vs-long-press). Deferred: keep `InboxScreen` mounted across a
   thread push. Captures `native-tabbar-*.png`, `ios-auth-real-client-light.png`.
6. **I4 merged**: push on the phone. `maru-push` (iOS-only plugin: APNs
   registration through a forwarding delegate proxy — `class_addMethod` on
   Tauri's live AppDelegate is silently ignored by UIKit — background push
   with a 25 s cap, badge, local notification with thread tap), iOS keychain
   items at `AfterFirstUnlock`, `src/core/push/*` (watch renewal decision,
   arrival composition, `onRelayAvailable`), Gmail `users.watch`, Settings →
   Notifications. Proven on the simulator up to token registration and the
   permission flow; **the silent-push wake cannot be exercised on a simulator**
   (queued as a physical-device run). The completion handler now waits for
   the notification to post (found by review). 727 tests.
7. **Store screenshots retaken natively** (`wayfinder/captures/store/`), glass
   bar visible; `scripts/store-screenshots.mjs --from-dir`. FlowDeck capture
   trap recorded in the I6 ticket.
8. **Owner items done in Nick's accounts 2026-09-01/02** (agent-driven Chrome
   with his go-ahead): Google Cloud (Pub/Sub, service account, OIDC
   subscription, iOS OAuth client, Owner invite sent), Apple (App ID with
   Push, APNs key T89G5MWVBQ production topic-specific, App Store Connect
   "Maru Mail" 6807633550), GoDaddy DNS; `sync.getmaru.app` live; the relay
   holds the APNs secret. See `wayfinder/NICK-QUEUE.md` for what remains.
9. **A9 shipped** (Nick ruled yes 2026-09-02): Later deferrals travel in the
   encrypted vault as `{accountEmail, threadId, until|null, at}` with
   tombstones, a 30-day prune, batched apply, one merge rule in `vault.ts`,
   and the fail-safe property asserted by a test whose Gmail client throws on
   every method. Spec §1 now reads "no ids the service can read". 756 tests.
10. **Owner items 2026-09-02**: second Owner accepted; App Store Connect Admin
   key `G52RSWR37N` ("Maru release") created and downloaded for cloud-managed
   distribution signing; Stripe product, prices and webhook created by Nick
   via the setup script (price ids on Railway and in IaC; the two secrets go
   in through `server/scripts/stripe-secrets.sh`).
11. **Executor outage**: Codex (`gpt-5.6-sol`) hit its usage limit at the end
   of the day (resets 2026-09-06 19:28 PT). Two lanes died mid-run; both
   were sealed from the orchestrator after re-running the gates, and the
   simulator proofs ran on Claude Opus subagents. Memory
   `codex-usage-limit-2026-09` records it.

## Opener for the next session

```
Resume wren from handoffs/2026-09-01-grill-4-account-iphone.md. Main is at
bd4303a, pushed; the sync service is live and proven; v0.1.8 is published.
Maps 4 and 5 are code-complete except: TestFlight upload (I6; needs the
distribution profile and an archive from this Mac), the physical-device push
wake (Nick's iPhone), Stripe (Nick), A9 (Nick's decision), the second Owner
acceptance (Nick), and the deferred I8 item (keep InboxScreen mounted across a
thread push). Start with the TestFlight archive path in docs/APP-STORE.md §6.
Codex is out of credits until 2026-09-06; lanes run on Opus subagents. Owner items stay in wayfinder/NICK-QUEUE.md. Standing
order: work autonomously.
```
