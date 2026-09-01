# A4 — Push relay wiring  `wayfinder:task`

status: **owner-gated** · map 4 · spec §9

Owner (queue, exact steps there): Pub/Sub topic `gmail-push` in
`maru-mail-prod`, grant `gmail-api-push@system.gserviceaccount.com` Publisher,
a push subscription to `https://sync.getmaru.app/v1/push/gmail` with an OIDC
token from a service account, an APNs auth key (.p8) for team 2M8UE59WH7.
Agent: set `PUBSUB_AUDIENCE`, `PUBSUB_SERVICE_ACCOUNT`, `APNS_*` on Railway,
send one test push, record the first delivery.
