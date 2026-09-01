# Service status operations

## Status sources

The sync service exposes `GET /healthz`. A healthy response is HTTP 200 with
`{"ok":true,"version":"..."}`.

Check the production endpoint with:

```bash
curl --fail --silent --show-error https://sync.getmaru.app/healthz
```

Railway uses `/healthz` for service health. Railway logs and metrics provide
the operator view. The public record is the static page at
`https://getmaru.app/status/`.

## Public states

- **No active incident:** `/healthz` succeeds and no known shared function is
  impaired.
- **Degraded:** The ciphertext store is available only part of the time, is
  stale, or cannot reliably accept changes. Device management, push notices,
  or billing state can also be impaired. Local mail and direct Gmail access
  can continue.
- **Outage:** The account service cannot complete normal authenticated reads.
  Users cannot restore or update their encrypted vaults on another device.

Do not describe a local cache problem as a service incident. Do not describe
a Maru account incident as a Gmail outage.

## Publish an incident

`site/status/index.html` is a hand-maintained incident page. It must not make a
live request to Railway.

During an incident:

1. Replace the current badge and summary with the incident state.
2. State the affected functions and the first known time in UTC.
3. State whether local mail and Gmail access still work.
4. Add the next update time. Publish an update at least every 60 minutes.
5. Commit the page and publish `site/` through the normal Pages workflow.
6. Add a dated resolution and move the event to **Past incidents**.

Do not publish email addresses, device names, Stripe ids, ciphertext, secrets,
or unverified causes. Link a GitHub security advisory only after it is public.
