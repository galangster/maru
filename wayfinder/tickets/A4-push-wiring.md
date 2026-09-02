# A4 — Push relay wiring  `wayfinder:task`

status: **owner-gated** · map 4 · spec §9

Owner (queue, exact steps there): Pub/Sub topic `gmail-push` in
`maru-mail-prod`, grant `gmail-api-push@system.gserviceaccount.com` Publisher,
a push subscription to `https://sync.getmaru.app/v1/push/gmail` with an OIDC
token from a service account, an APNs auth key (.p8) for team 2M8UE59WH7.
Agent: set `PUBSUB_AUDIENCE`, `PUBSUB_SERVICE_ACCOUNT`, `APNS_*` on Railway,
send one test push, record the first delivery.

## Google side done 2026-09-01 (orchestrator, gcloud as project owner, Nick's go-ahead in chat)

- Pub/Sub API enabled on `maru-mail-prod`. Topic `gmail-push` with
  `gmail-api-push@system.gserviceaccount.com` as Publisher.
- Service account `maru-push@maru-mail-prod.iam.gserviceaccount.com`; the
  Pub/Sub service agent holds Token Creator on it.
- Push subscription `gmail-push-relay` → `https://sync-production-c0b0.up.railway.app/v1/push/gmail`
  with an OIDC token, audience `maru-sync`, ack deadline 30 s, retention 1 h,
  never expires. **Switch the endpoint to `https://sync.getmaru.app/...` once
  DNS lands** (`gcloud pubsub subscriptions modify-push-config`).
- Railway `sync`: `PUBSUB_AUDIENCE`, `PUBSUB_SERVICE_ACCOUNT` set and in IaC.
- **Live proof**: a published `{"emailAddress":"probe@example.com","historyId":"1"}`
  was delivered by Pub/Sub with a real OIDC token and the relay answered
  `204` in 48 ms (no device matched, as designed).
- Still owner-only: the APNs key (Apple), and the second Owner, which the
  API refuses for a consumer Gmail address outside an organisation
  (`INVALID_ARGUMENT`); the console's Grant access sends the invitation.
