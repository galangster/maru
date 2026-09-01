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
