# A5 — Deploy to Railway  `wayfinder:task`

status: **open, agent** · map 4

Railway project `maru-sync`: the service from the Dockerfile, a Postgres
plugin, `MARU_ALLOWLIST` with Nick's addresses, health check on `/healthz`,
daily backups. The domain `sync.getmaru.app` is a CNAME Nick adds (queue);
until then the Railway domain is the beta base URL.
Acceptance: `curl /healthz` from outside; signup from the desktop app against
it; **a restore drill** — restore a backup into a scratch database and read
the vault row back.
