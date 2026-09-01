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
