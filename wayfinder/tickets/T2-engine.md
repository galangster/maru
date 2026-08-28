# T2 — Engine: store, Gmail client, sync, auth  `wayfinder:task` (AFK)

status: open · claimed: — · blocked by: T1

## Work

TypeScript core in `src/core/`: typed Gmail REST client (batch, backoff,
quota discipline), OAuth PKCE + loopback flow, SQLite store behind an
interface, sync engine (90-day backfill, history incremental, resync path),
MiniSearch index, demo provider with fixtures. TDD with vitest: threading,
sync reducer, MIME build, quota batching against fixtures. Gate: suite
green + typecheck.
