# A1 — The sync service  `wayfinder:task`

status: **in flight (lane A, 2026-09-01)** · map 4 · spec: docs/spec/MARU-ACCOUNT.md §5, §8–§13

`server/`: Hono on Node 22, Postgres, Argon2id proofs, opaque vault with
optimistic versions and ten-deep history, devices with remote revoke and
365-day idle expiry, allowlist, Pub/Sub → APNs content-free relay, Stripe
Checkout/Portal/webhooks with server-computed entitlement, pglite tests.

Acceptance: every §5 and §12 endpoint tested; boots with no APNs, Pub/Sub or
Stripe env; Dockerfile builds; root typecheck and tests untouched.
The executor appends its build log below.

## Merged to main 2026-09-01 (`000e8ef`); first deploy started

Lane A (`8197bd4`, `75ad3e9`, `ba22810`) plus A2 (`23fcabd`: recover-start,
device rename, server hash parameters, allowlist-is-a-door, all 22 simplify
findings). Server: 34 tests, typecheck, build. Root: 654 tests. Deployed
from `server/` with `railway up --service sync`; `MARU_ALLOWLIST` and
`MARU_COMPED` carry Nick's three addresses. Beta base URL
`https://sync-production-c0b0.up.railway.app`; `sync.getmaru.app` attached
on Railway, DNS is Nick's (queue).

## Proven live 2026-09-01 (`bd4303a`)

`tests/live/account-live.test.ts` passes against the deployed service. Three
defects found only by the live run, all fixed: comps now live in a standing
`comped_emails` table consulted at signup; the KDF column is parsed at every
read; proofs are hashed as base64url text because the argon2 binding treats a
Buffer as UTF-8. Internal errors now log their cause. The purge path when a
proof leaves an account behind: `railway ssh --service sync -- node -e '…'`
with the `postgres` package (SSH key `maru-mac` registered).
