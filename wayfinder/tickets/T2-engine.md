# T2 — Engine: store, Gmail client, sync, auth  `wayfinder:task` (AFK)

status: closed · claimed: fable-orchestrator · blocked by: T1

## Resolution

Closed 2026-08-28, commit 639333c. 186 tests / 10 suites green; typecheck
and build pass. Contract unchanged. Notables: threads.get costs 40 units
under the 2026-05 quota table (backfill hydrates via batched
threads.get?format=metadata); bodies stay lazy (messages.get = 20 units any
format); trash listed separately during backfill/resync so the diff does
not misread trashed threads as deleted; better-sqlite3 pinned ^11 (v13
darwin-arm64 prebuild segfaults). Dev port moved to 1420.

## Work

TypeScript core in `src/core/`: typed Gmail REST client (batch, backoff,
quota discipline), OAuth PKCE + loopback flow, SQLite store behind an
interface, sync engine (90-day backfill, history incremental, resync path),
MiniSearch index, demo provider with fixtures. TDD with vitest: threading,
sync reducer, MIME build, quota batching against fixtures. Gate: suite
green + typecheck.
