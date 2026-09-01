# Handoff — 2026-09-01, grill 4: the account, the phone, and production

Baseline `395608e` → **`e737e70`** on `main`, pushed to `galangster/maru`.
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
| `sync.getmaru.app` | attached on Railway; DNS records in Nick's queue |
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
   captures. 674 tests. Owed: a VoiceOver pass on a physical iPhone (the
   Inspector audit does not complete against the WebView; queued for Nick).

## Opener for the next session

```
Resume wren from handoffs/2026-09-01-grill-4-account-iphone.md. Main is at
bd4303a, pushed; the sync service is live and proven; v0.1.8 is published.
I5, the A5 drill and the I2 polish are done. Next: the I3 client side that
needs no client id (the ASWebAuthenticationSession plugin and the ios OAuth
seam, placeholder id), then whatever console item has landed. Owner items stay in wayfinder/NICK-QUEUE.md. Standing
order: work autonomously.
```
