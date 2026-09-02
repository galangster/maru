# A5 — Deploy to Railway  `wayfinder:task`

status: **open, agent** · map 4

Railway project `maru-sync`: the service from the Dockerfile, a Postgres
plugin, `MARU_ALLOWLIST` with Nick's addresses, health check on `/healthz`,
daily backups. The domain `sync.getmaru.app` is a CNAME Nick adds (queue);
until then the Railway domain is the beta base URL.
Acceptance: `curl /healthz` from outside; signup from the desktop app against
it; **a restore drill** — restore a backup into a scratch database and read
the vault row back.

## Provisioned 2026-09-01 (orchestrator, Railway CLI)

- Project `maru-sync` (382ec503-79c6-4095-8379-b6ac84e88c95), environment
  `production`. Linked from the repo root (`railway status`).
- `Postgres` managed service deployed. `sync` service created, empty, with
  `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `MARU_ALLOWLIST` (Nick's three
  addresses), `NODE_ENV`, `PORT=8787`. Service domain: https://sync-production-c0b0.up.railway.app.
- The Railway MCP server is denied on this project; use the CLI.
- Deploy: `cd server && railway up --service sync` once lane A merges.

## Live 2026-09-01 (`65d7647`)

Managed by `.railway/railway.ts` (GitHub source `galangster/maru`, branch
`main`, root `server/`; healthcheck `/healthz`; the custom domain; one
Postgres and its volume; the stray second Postgres from a double `railway add`
was removed by the apply). Three lessons, each cost a failed deploy:
`railway.json` is deprecated and ignored by new services; `railway up`
uploads the linked root whatever path it is given; Railway's builder wants
cache-mount ids prefixed with a service cache key, so the Dockerfile uses a
plain `npm ci`. Healthy: `{"ok":true,"version":"0.1.7"}`. Restore drill:
not yet run.

## Restore drill — done 2026-09-01T21:33Z (orchestrator)

Method: logical dump and restore inside the Railway Postgres container over
`railway ssh --service Postgres`, into a scratch database on the same
instance, with a real vault row present (created by the live test in
`setup` mode, deleted afterwards in `teardown` mode).

| Step | Result |
| --- | --- |
| `pg_dump -Fc` of the live database | 17,678 bytes |
| `CREATE DATABASE maru_drill` + `pg_restore --no-owner` | 1 second |
| users / vaults / vault_history counts, live vs drill | 1 / 1 / 1 on both |
| vault row `19b2e1b0…`, version 1, ciphertext prefix `m1.4T5fED7Blcg` | identical on both |
| scratch database and dump file removed | confirmed |

Recovery point age: seconds (a fresh dump). Recovery time: about one
minute end to end including the ssh sessions. What this proves: the schema
and data restore cleanly and a vault row survives as ciphertext. What it
does not rehearse: Railway's dashboard volume-backup restore (documented in
`ops/INCIDENT-RUNBOOK.md`, provider-controlled, not scriptable from the CLI);
rehearse it once real user data exists and a maintenance window is
announced.

Repeatable command (from the repo root, drill account first):

```bash
MARU_LIVE_MODE=setup MARU_LIVE_SYNC_URL=… MARU_LIVE_EMAIL=… MARU_LIVE_PASSWORD=… npx vitest run tests/live
railway ssh --service Postgres -- sh -c 'U="$DATABASE_URL"; D="${U%/*}/maru_drill"; pg_dump -Fc "$U" -f /tmp/maru.dump && psql -q "$U" -c "CREATE DATABASE maru_drill" && pg_restore --no-owner -d "$D" /tmp/maru.dump && psql -At "$D" -c "SELECT user_id, version, left(ciphertext,14) FROM vaults"; psql -q "$U" -c "DROP DATABASE maru_drill"; rm -f /tmp/maru.dump'
MARU_LIVE_MODE=teardown … npx vitest run tests/live
```

## Custom domain live — 2026-09-02 (UTC)

`sync.getmaru.app` resolves, Railway issued the certificate, `/healthz`
answers over it. The Pub/Sub push subscription now targets
`https://sync.getmaru.app/v1/push/gmail` (a delivery after the switch got
204). The relay redeployed with `APNS_KEY_P8` and logs pushes as relayed.
The Railway domain keeps working; the desktop 0.1.8 was built against it
and the next desktop release drops the `VITE_MARU_SYNC_URL` override.
