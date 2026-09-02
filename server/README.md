# Maru sync service

This directory contains the hosted account service defined by
[`docs/spec/MARU-ACCOUNT.md`](../docs/spec/MARU-ACCOUNT.md). It stores encrypted
vault blobs, hashed login proofs, device sessions, Gmail watch mappings, and
billing state. It cannot decrypt a vault. Mail content never reaches this
service.

The service runs on Node 22, Hono, and Postgres. It applies the SQL files in
`migrations/` at startup. `/healthz` reports the version from `package.json`.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection URL. |
| `PORT` | No | HTTP port. Defaults to `8787`. |
| `MARU_ALLOWLIST` | No | Comma-separated emails to add to `allowed_emails` at startup. Existing rows remain. |
| `MARU_COMPED` | No | Comma-separated existing account emails to comp at startup. Repeated seeds are safe. |
| `PUBSUB_AUDIENCE` | For Gmail push | Expected Google OIDC audience. |
| `PUBSUB_SERVICE_ACCOUNT` | For Gmail push | Exact service-account email required in the OIDC `email` claim. |
| `APNS_TEAM_ID` | For APNs | Apple developer team ID. |
| `APNS_KEY_ID` | For APNs | Apple provider key ID. |
| `APNS_KEY_P8` | For APNs | ES256 private key PEM. Literal `\n` sequences are accepted. |
| `APNS_BUNDLE_ID` | No | APNs topic. Defaults to `app.getmaru.ios`. |
| `APNS_ENV` | No | `sandbox` or `production`. Defaults to `sandbox`. |
| `STRIPE_SECRET_KEY` | For billing routes | Stripe secret API key. |
| `STRIPE_WEBHOOK_SECRET` | For Stripe webhooks | Signing secret for `/v1/billing/webhook`. |
| `STRIPE_PRICE_MONTHLY` | For checkout | Stripe price ID for the $5 monthly plan. |
| `STRIPE_PRICE_YEARLY` | For checkout | Stripe price ID for the $50 yearly plan. |

The server starts without Pub/Sub, APNs, or Stripe settings. An unconfigured
APNs sender records a JSON count and sends nothing, and `POST /v1/push/test`
returns `503 push_unavailable`. Unconfigured billing routes
return `503 billing_unavailable`. The Pub/Sub endpoint rejects tokens until its
audience and service account are configured.

Copy `.env.example` into your secret manager or local environment. Do not
commit the populated file.

## Run locally

Use Node 22 and a local Postgres database.

```bash
cd server
npm install
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/maru_sync
npm run dev
```

The service listens on `http://127.0.0.1:8787` unless `PORT` changes it.

## Test and build

Tests use PGlite in process. They do not need Postgres, Stripe, APNs, or a
Google account.

```bash
cd server
npm run typecheck
npm test
npm run build
```

## Allowlist and comps

Run the admin script from `server/` so Node resolves the local `tsx` package.
It normalizes every email to trimmed lowercase.

```bash
cd server
DATABASE_URL=postgres://... node --import tsx scripts/allow.ts add person@example.com
DATABASE_URL=postgres://... node --import tsx scripts/allow.ts remove person@example.com
DATABASE_URL=postgres://... node --import tsx scripts/allow.ts list
DATABASE_URL=postgres://... node --import tsx scripts/allow.ts comp person@example.com
DATABASE_URL=postgres://... node --import tsx scripts/allow.ts uncomp person@example.com
DATABASE_URL=postgres://... node --import tsx scripts/allow.ts enforce on
DATABASE_URL=postgres://... node --import tsx scripts/allow.ts enforce off
```

`list` prints email addresses because it is an explicit administrator command.
The service logger never prints them.

Allowlist enforcement defaults to on. Use `enforce off` to open signup without
a deploy. Use `enforce on` to close signup again.

## Stripe setup

The one-shot path: `server/scripts/stripe-connect.sh` asks for the live key
without echoing it, runs the setup below, and writes the four variables into
the Railway `sync` service. Nothing secret is printed.

Create or find the `Maru Sync` product and its two prices with:

```bash
cd server
STRIPE_SECRET_KEY=sk_... node --import tsx scripts/stripe-setup.ts
```

The script uses the lookup keys `maru_sync_monthly` and
`maru_sync_yearly`. It prints the two price environment lines, and creates
the `/v1/billing/webhook` endpoint with the six §12 events, printing
`STRIPE_WEBHOOK_SECRET` once (Stripe shows a signing secret only at creation;
`MARU_WEBHOOK_URL` overrides the URL for a staging run). Configure the
Stripe webhook to send the events listed in spec section 12 to
`/v1/billing/webhook`.

## Deploy to Railway

Create a Railway service whose root directory is `server/`. Add Postgres and
set `DATABASE_URL` plus the required secrets. Railway reads the project's `.railway/railway.ts`,
builds the Dockerfile, and checks `/healthz`.

You can test the image locally:

```bash
cd server
docker build -t maru-sync .
docker run --rm -p 8787:8787 -e PORT=8787 -e DATABASE_URL=postgres://... maru-sync
```

The container applies pending migrations before it accepts traffic.

## Contract choices

The protocol leaves a few implementation details open. This service makes
these choices:

- Signup always writes `comped = false`. Use `comp`, `uncomp`, or `MARU_COMPED`
  to manage complimentary access independently from the allowlist.
- A trial expires at its `trial_ends_at` instant. Past-due access expires at
  the exact instant seven days after `past_due_since`.
- Vault history contains each successful current version. The history endpoint
  returns the ten newest version numbers and timestamps, without ciphertext.
  Restore copies the selected ciphertext into a new current version.
- Gmail watch expiration accepts an ISO timestamp or milliseconds since the
  Unix epoch. A watch must expire in the future.
- `platform` is an opaque client label. `family` accepts only `desktop` or
  `ios` because credentials are scoped by that boundary.
- `POST /v1/push/test` answers an APNs rejection with `200`, not `502`, so
  the phone can show Apple's reason instead of a generic failure. Shape and
  rate in the spec, section 9.
- Unknown and known prelogin requests both perform one indexed user lookup.
  Both return the same response fields and the deterministic section 3 salt.
