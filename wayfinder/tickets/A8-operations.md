# A8 — Operations  `wayfinder:task`

status: **runbooks complete in lane D; access confirmation and restore drill remain owner gates** · map 4 launch gate

- `ops/STATUS.md` → a status page (Railway health + a static page on
  getmaru.app/status).
- `ops/INCIDENT-RUNBOOK.md` extended for the service: outage, data loss,
  and the three breach scenarios (server, build pipeline, operator account)
  with who is told and within what time. A custodian owes this in writing.
- Two-factor inventory: GitHub, Apple, Google Cloud, Railway, Stripe, npm,
  the registrar. Owner confirms each.
- Second operator with real access to Railway, GitHub and the registrar.

## Lane D implementation, 2026-09-01

- `ops/STATUS.md` defines Railway `/healthz`, the hand-maintained status page,
  and operational, degraded, and outage meanings for a ciphertext store.
- `site/status/index.html` names the account-service boundary, defines
  degraded service, and states that an operator updates the page by hand.
- `ops/INCIDENT-RUNBOOK.md` covers an outage, data loss, and Railway backup
  restoration. It also covers server, build-pipeline, and operator-account
  breaches.
- Each breach scenario names exposed data, response steps, recipients,
  channels, and the 72-hour affected-user deadline.
- `ops/ACCESS.md` inventories GitHub, Apple Developer, Google Cloud, Railway,
  Stripe, npm, and the registrar. It requires independent second-operator
  access and quarterly reviews.

The owner must confirm every two-factor row and the second operator's access.
The A5 restore drill must restore a backup into a scratch database and read a
vault row before public launch.
