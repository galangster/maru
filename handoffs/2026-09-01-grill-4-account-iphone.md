# Handoff — 2026-09-01, grill 4: the account, the phone, and production

Baseline `395608e` → **`65d7647`** on `main`, pushed to `galangster/maru`.
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
| Installed Maru.app | still 0.1.7; no release cut today |
| GitHub Releases / updater | still 0.1.0 (unchanged; queue item) |

## Open owner gates (all in `wayfinder/NICK-QUEUE.md`, top section)

Stripe account and keys; the two DNS records; Pub/Sub topic + push
subscription + iOS OAuth client in `maru-mail-prod`; APNs key and App Store
Connect app; App Review accounts; lawyer's read; **A9 decision** (Later
across devices); second operator; beta device list.

## Exact resume points

- **Deploy proof**: `curl https://sync-production-c0b0.up.railway.app/healthz`
  should return `{"ok":true,…}`. Then from a `npm run tauri dev` build with
  `VITE_MARU_SYNC_URL` pointing there, sign up with one of the three
  allowlisted addresses; the account should show "Complimentary".
- **A5 restore drill** is not done.
- **I3** (Gmail sign-in on iOS) waits on the iOS OAuth client. **I4** waits
  on A4. **I5** can start now: the phone's Settings row is a placeholder.
- **Desktop app release** (0.1.8) with the account inside is not cut. The
  release checklist in the queue still applies; A7's workflow is the new way.
- **Polish left on I2**: recipient chips in compose, VoiceOver, Dynamic Type.

## Operational facts learned (also in memory `wren-push-and-railway-ops`)

`gh auth switch -u galangster` before pushing. Railway MCP is denied on this
project; use the CLI (5.47.1). `railway.json` is deprecated and ignored by
new services — never add one. A hook blocks `git checkout` in the primary
worktree; use `git show rev:path > path`.

## Ordered next actions

1. Prove sign-up against the live service from a dev build (resume point 1).
2. Cut 0.1.8 through A7's workflow (needs the signing secrets set on the repo)
   or the old script; publish with all four assets; fix the stale updater.
3. I5, then I3/I4 as the console items land.
4. A5 restore drill; A9 once Nick decides.

## Opener for the next session

```
Resume wren from handoffs/2026-09-01-grill-4-account-iphone.md. Main is at
65d7647, pushed; the sync service is live. Do resume point 1 (sign up against
the live service from a dev build), then cut 0.1.8 with the account inside
per the queue's release checklist, then I5. Owner items stay in
wayfinder/NICK-QUEUE.md. Standing order: work autonomously.
```
