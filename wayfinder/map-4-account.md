# Wayfinder map 4 — The Maru account  `wayfinder:map`

Charted 2026-09-01 from grill 4 ([GRILL-4-AGENDA.md](GRILL-4-AGENDA.md)).
Tickets prefixed `A`. Contract: [docs/spec/MARU-ACCOUNT.md](../docs/spec/MARU-ACCOUNT.md).

## Destination

**Sign in to Maru on any desktop and your accounts, settings and mail are
simply there. Pay $5 a month or $50 a year for it, on the web, after a
14-day trial.** The service is a custodian of ciphertext only. The app stays
free and AGPL; so does the server.

## Launch gates (Q3, Q10) — the beta opens to strangers when all pass

- Google's verification verdict, plus a written determination on
  ciphertext-only credential custody.
- Verifiable builds (A7).
- A second operator with real access (queue).
- Backups restored in a drill (A5). Status page and incident runbook (A8).
- Legal pages live (A6). Stripe in live mode with tax (A3).

## Tickets

- [A1 sync service](tickets/A1-sync-service.md) — `server/`: auth, vault,
  devices, allowlist, push relay, billing. **Lane A, in flight.**
- [A2 desktop account](tickets/A2-desktop-account.md) — sign up / in,
  crypto, vault sync, devices, recovery, entitlement surface. **Lane B, in
  flight.**
- [A3 Stripe live](tickets/A3-stripe-live.md) — account, products, webhook,
  tax, refunds text. Owner-gated on the Stripe account.
- [A4 push relay wiring](tickets/A4-push-wiring.md) — Pub/Sub topic, OIDC
  push subscription, APNs key. Owner-gated on the console.
- [A5 deploy](tickets/A5-deploy.md) — Railway service, Postgres, domain
  `sync.getmaru.app`, backups and the restore drill.
- [A6 truth and legal](tickets/A6-truth-and-legal.md) — the four false
  sentences, privacy policy, terms, support macros.
- [A7 verifiable builds](tickets/A7-verifiable-builds.md) — CI-built
  artifacts with GitHub attestations; the honest version of "reproducible".
- [A8 operations](tickets/A8-operations.md) — status page, breach plan,
  incident runbook, two-factor inventory, second operator.
- [A9 Later across devices](tickets/A9-later-sync.md) — owner decision, then
  deferrals in the vault.

## Out of scope

- The phone: map 5. Desktop instant mail via the relay: after map 5 (Q23).
- Grants and the audit log syncing. Mail syncing. Ever, on this map.
- Outlook, IMAP, Android (Android would be a third family when it comes).
