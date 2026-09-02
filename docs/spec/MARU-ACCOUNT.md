# Maru account — protocol v1

Status: **ratified 2026-09-01** (grill 4, `wayfinder/GRILL-4-AGENDA.md`).
This is the contract between the Maru client (desktop, iOS) and the Maru sync
service (`server/`). Both are built against this file. Change the file before
you change either side.

## 1. What it is, and what it is not

A Maru account is one email and one master password. Signing in on any device
restores the user's settings, their Gmail account list, and — under the owner
ruling of 2026-08-31 (G2, option b) — the Gmail refresh tokens themselves, so
mail is simply there. The service is a **custodian of ciphertext only**: it
stores blobs it cannot read, and it holds no key that opens them.

Hard constraints, unchanged from grill 3 and re-ratified in grill 4:

- **Mail never syncs.** Each device fetches mail from Gmail with its own copy of
  the tokens. No message bytes, no headers, and **no ids the service can read**.
  Amended 2026-09-02 by the A9 owner ruling: Later deferrals name a Gmail
  thread id, and they travel — inside the vault ciphertext, under a key the
  service does not hold. The letter of the constraint moves from "no ids reach
  the service" to "no ids the service can read"; the promise it was written to
  make is unchanged.
- **Agent grants never sync.** A grant is a trust decision made on one machine.
- **The audit log does not sync in v1.**
- **Push is content-free.** The relay says "something changed for this
  address"; the device fetches from Gmail.

Ruled out permanently (from the G2 design verdict; do not build these):
a server that can read refresh tokens; per-user encryption with a server-held
key; a server-side token broker; HSM/KMS wrapping presented as the answer;
any "only for sixty seconds" variant; `prompt=none`; adding `openid`;
a relay that calls `users.watch` with a server-held token.

## 2. Terms

| Term | Meaning |
| --- | --- |
| **email** | Account username, lowercased and trimmed. Not verified in the beta. |
| **masterKey** | 32 bytes derived on the client from the password. Never leaves the client. |
| **authKey** | 32 bytes derived from masterKey. Sent to the server as the login proof. |
| **encKey** | 32 bytes derived from masterKey. Wraps accountKey. Never leaves the client. |
| **accountKey** | 32 random bytes, made once at signup. Encrypts the vault. Never leaves the client unwrapped. |
| **recoveryKey** | 12 words (128 bits, BIP39 English wordlist, last word carries the checksum). Shown once at signup. |
| **vault** | One JSON document (§4), encrypted with accountKey, stored on the server as an opaque blob with a version number. |
| **device** | One signed-in installation. Holds a session token and, locally, the unwrapped accountKey in the OS keychain. |
| **platform family** | `desktop` (macOS, Windows, Linux — one Google Desktop client id) or `ios` (Google iOS client id). Refresh tokens are bound to the client id that issued them, so credentials are stored per family. |

## 3. Keys

All derivation runs on the client. Byte encodings on the wire are base64url
without padding unless stated.

```
salt        = SHA-256("maru-account-v1:" + email)          # 32 bytes
masterKey   = Argon2id(password, salt, m = 65536 KiB, t = 3, p = 4, len = 32)
authKey     = HKDF-SHA256(masterKey, salt = "", info = "maru-auth-v1",  len = 32)
encKey      = HKDF-SHA256(masterKey, salt = "", info = "maru-enc-v1",   len = 32)
accountKey  = random(32)
recoveryKey = 12 BIP39 words   -> entropy(16 bytes)
recEncKey   = HKDF-SHA256(entropy, "", "maru-recovery-enc-v1",  32)
recAuthKey  = HKDF-SHA256(entropy, "", "maru-recovery-auth-v1", 32)
```

Wrapping and sealing use AES-256-GCM with a fresh 12-byte nonce per operation.
A sealed value is encoded as one string: `m1.<nonce b64url>.<ciphertext+tag b64url>`.

```
wrappedByPassword = seal(encKey,    accountKey, aad = "maru-wrap-password-v1")
wrappedByRecovery = seal(recEncKey, accountKey, aad = "maru-wrap-recovery-v1")
vaultCiphertext   = seal(accountKey, utf8(json(vault)), aad = "maru-vault-v1:" + version)
```

The KDF parameters are stored server-side per user and returned by
`prelogin`, so they can be raised later without a migration. The server stores
`authKey` and `recAuthKey` only as slow hashes (Argon2id, server-side random
salt, **server parameters m = 19456 KiB, t = 2, p = 1** — the input is already
32 uniformly random bytes, so the client's password-stretching cost buys
nothing here and would only throttle logins). It never sees masterKey, encKey, accountKey, or
recEncKey.

Password change: derive the new encKey, re-wrap accountKey, send the new
`authKey` and `wrappedByPassword` with the old `authKey` as proof. The vault
does not change.

Recovery: unwrap accountKey with recEncKey, choose a new password, send
`recAuthKey` as proof plus the new `authKey` and `wrappedByPassword`. The
server revokes every device. A new recovery key is generated and shown; the
old one stops working.

## 4. Vault document

```jsonc
{
  "v": 1,
  "updatedAt": 1756700000000,            // ms epoch, writer's clock, informational
  "settings": { /* TransferSettings from src/features/settings/transfer.ts — never googleClientSecret */ },
  "accounts": [                          // the address list; order is display order
    { "email": "nick@example.com", "label": "Nick" }
  ],
  "credentials": {                       // per platform family, per address
    "desktop": {
      "nick@example.com": {
        "clientId": "…apps.googleusercontent.com",
        "refreshToken": "1//…",
        "scope": "https://www.googleapis.com/auth/gmail.modify",
        "issuedAt": 1756700000000
      }
    },
    "ios": {}
  },
  "deferrals": [                         // Later, across devices (A9)
    { "threadId": "18f2c…", "accountEmail": "nick@example.com", "until": 1756900000000, "setAt": 1756800000000 },
    { "threadId": "18f2d…", "accountEmail": "nick@example.com", "until": null, "clearedAt": 1756850000000 }
  ]
}
```

Rules:

- `settings` carries exactly the P5 transfer field set. The bring-your-own
  `googleClientSecret` stays out; the official client needs none and a fork's
  secret is per-install.
- `accounts` is the union across devices. Removing an account on one device
  removes it from the list and from `credentials`; other devices drop it on
  the next pull.
- `credentials[family][email]` is written by a device of that family after a
  successful Google consent, and read by another device of the same family
  at sign-in to file the tokens under the account without a consent screen.
  A device of a different family shows the address in the "From your other
  device" directed-consent list instead (P5/G2 v1 behaviour).
- Access tokens are never stored. Devices mint their own from the refresh token.
- `deferrals` is the Later list (**added 2026-09-02, owner ruling A9: yes**).
  One entry per saved thread, identified by `accountEmail` plus the **Gmail
  thread id**. This is the only place a Gmail id appears in the protocol, and it
  appears as ciphertext only — see the amended constraint in §1.
  - `until` is the ms epoch the thread returns to the inbox. `until: null`
    marks a **tombstone**: a deferral that was cleared on some device.
  - `setAt` is when the deferral was saved; `clearedAt` is when it was cleared.
    Exactly one of the two is present, and it is what §6 compares. A payload
    with neither is treated as stamped at 0, so a tombstone beats it.
  - Deferral is still a **local predicate** (`wake_at > now`) on every device.
    Nothing in this section asks a device to act at a moment in time, and
    nothing here reaches Google. P21's fail-safe property is unchanged: a
    device that never runs simply never hides the mail.
- The document is capped at 256 KiB plaintext. The server rejects a blob over
  384 KiB ciphertext. `deferrals` is bounded by the pruning rule in §6 and by
  `MAX_DEFER_DAYS` (30), so it cannot grow without limit.

## 5. Wire API

Base URL: `https://sync.getmaru.app` in production, a Railway domain in the
beta, `http://127.0.0.1:8787` in development. JSON bodies. Errors are
`{ "error": "<code>", "message": "<text>" }` with an HTTP status.

| Method, path | Auth | Body → Response |
| --- | --- | --- |
| `POST /v1/auth/prelogin` | none | `{email}` → `{kdf:{algo:"argon2id",m,t,p}, salt}` (salt = the client-side rule in §3 echoed; unknown email returns the same shape with default kdf so nothing leaks) |
| `POST /v1/auth/signup` | none | `{email, authKey, recAuthKey, kdf, wrappedByPassword, wrappedByRecovery, device:{name, platform, family}}` → `{token, deviceId, accountId}`. **403 `not_allowed`** if email is not on the allowlist. 409 `exists`. |
| `POST /v1/auth/login` | none | `{email, authKey, device}` → `{token, deviceId, accountId, kdf, wrappedByPassword}`. 401 `bad_credentials`. Rate limited per email and per IP. |
| `POST /v1/auth/recover-start` | none | `{email, recAuthKey}` → `{wrappedByRecovery, kdf}`. Proof-gated and rate limited, so a recovery-wrapped key is never handed to someone who only knows the email. (Added 2026-09-01: the client needs this *before* it can produce the new wrappings below.) |
| `POST /v1/auth/recover` | none | `{email, recAuthKey, newAuthKey, newWrappedByPassword, newRecAuthKey, newWrappedByRecovery, device}` → `{token, deviceId, accountId}`. Revokes all other devices. |
| `POST /v1/auth/password` | bearer | `{authKey, newAuthKey, newWrappedByPassword}` → `{ok:true}` |
| `POST /v1/auth/logout` | bearer | → `{ok:true}` (revokes this device's token) |
| `GET /v1/vault` | bearer | → `{version, ciphertext, updatedAt}` or 204 when empty |
| `PUT /v1/vault` | bearer | `{baseVersion, ciphertext}` → `{version}`; **409 `conflict`** with the current `{version, ciphertext}` when baseVersion ≠ current |
| `GET /v1/devices` | bearer | → `{devices:[{id, name, platform, family, createdAt, lastSeenAt, current}]}` |
| `PATCH /v1/devices/:id` | bearer | `{name}` → `{ok:true}` — rename; own devices only. (Added 2026-09-01.) |
| `DELETE /v1/devices/:id` | bearer | → `{ok:true}` (revokes; that device's next call gets 401 `revoked`) |
| `DELETE /v1/account` | bearer | `{authKey}` → `{ok:true}`. Deletes user, devices, vault, push registrations. Irreversible. |
| `POST /v1/push/register` | bearer | `{apnsToken}` or `{apnsToken:null}` → `{ok:true}` |
| `POST /v1/push/watch` | bearer | `{email, expiration}` → `{ok:true}` — the device tells the relay it has called `users.watch` itself for this address; the relay maps address → devices |
| `POST /v1/push/gmail` | Pub/Sub OIDC | Google Pub/Sub push body → 204. Content-free APNs to every registered device of the account(s) watching that address. |
| `GET /healthz` | none | → `{ok:true, version}` |

Session tokens: 32 random bytes, base64url, stored server-side as SHA-256.
`Authorization: Bearer <token>`. Every authenticated call updates the
device's `lastSeenAt`.

## 6. Sync algorithm (client)

- **Pull** at launch, on foreground, and every 5 minutes. `GET /v1/vault`; if
  the version is newer than the local copy, open, merge, apply.
- **Push** after any local change to settings, the account list, a credential,
  or a **deferral** — saving a thread for later, bringing one back, and the
  engine's reply-wake all schedule one (debounced 2 s). `PUT` with the last-seen version. On 409, open
  the returned blob, merge, re-seal, `PUT` again with its version. Give up
  after 3 rounds and surface a "sync paused" state.
- **Merge** is per section: `settings` = the copy with the newer `updatedAt`;
  `accounts` = union by email, order from the newer copy; `credentials` =
  union per family and email, newer `issuedAt` wins.
- **Merge `deferrals`** = union by `(accountEmail, threadId)`. Within one key:
  - two live entries — the **later `until` wins**. A deferral is an absolute
    time, not a delta, so the later answer is the later decision.
  - two tombstones — the later `clearedAt` wins.
  - a live entry against a tombstone — the **tombstone beats an older `until`**:
    it wins unless the live entry's `setAt` is after the tombstone's
    `clearedAt`, which is a re-save made after the clear.
  - **Pruning, at build time and after every merge:** an entry whose stamp is
    more than **30 days** in the past is dropped — a tombstone by `clearedAt`,
    a live entry by `until`. Tombstones cannot accumulate, and a deferral that
    expired a month ago stops travelling.
- **Apply** on a device: settings replace local settings (except device-local
  fields, if any are later declared); accounts absent locally are added —
  with tokens if this family has them, otherwise into the directed-consent
  list; accounts absent remotely are removed locally, their tokens deleted
  from the keychain.
- **Apply `deferrals`:** a device writes the merged list into its own
  `thread_defer` table, **for the accounts it actually has** — an entry naming
  an address this device has not signed into is ignored, not queued. A live
  entry becomes a deferral row; a tombstone removes one. The device re-runs the
  merge rule above against its own rows first, so a pull can never undo a
  deferral this device set more recently. **No Gmail method is called on this
  path, by construction** — the OAuth method-scope matrix is untouched.
- A device never writes tokens for a family other than its own.

## 7. Devices

Every sign-in registers a device: a user-editable name (default from the OS
hostname or the iOS device name), platform, family. The account screen lists
devices with last-seen time and offers **Sign out** for any other device.
Remote sign-out revokes the token; the device learns on its next call, clears
its keychain copy of accountKey, and returns to the sign-in screen. Local
Gmail tokens on that device are NOT deleted by remote sign-out (they were
issued to that device by Google); "Delete local data" remains the local wipe.

## 8. Beta gating

`allowed_emails` on the server is the only door. It is a door, not a plan: signup never sets `comped`. Beta testers are comped explicitly (`allow.ts comp <email>`, or the `MARU_COMPED` env list at boot). Signup returns 403
otherwise. Seeded from `MARU_ALLOWLIST` at boot (comma-separated) and
editable with `server/scripts/allow.ts`. Opening the beta = clearing the
table's enforcement flag, not a deploy.

## 9. Push relay

Gmail → Pub/Sub → Maru relay → APNs. The **client** calls
`users.watch` with its own token against topic
`projects/maru-mail-prod/topics/gmail-push` (owner creates it; queue). The
relay receives Pub/Sub push at `/v1/push/gmail`, verifies the OIDC token's
audience and issuer, reads `emailAddress` from the decoded message, and sends
a background APNs push (`content-available: 1`, empty payload) to each device
registered for an account that has reported a watch on that address. The
relay logs counts, never addresses.

Desktop consumers of the relay come after iOS ships (grill 4, Q23).

## 10. Server data model

```
users            (id, email unique, auth_hash, rec_auth_hash, kdf_json, wrapped_by_password, wrapped_by_recovery, created_at, deleted_at)
devices          (id, user_id, name, platform, family, token_hash unique, apns_token null, created_at, last_seen_at, revoked_at)
vaults           (user_id pk, version int, ciphertext text, updated_at)
watches          (user_id, email_address, expires_at)         -- from POST /v1/push/watch
allowed_emails   (email pk, added_at)
```

## 11. Threat notes

- The service can withhold or serve a stale vault. It cannot read one.
- A compromised build is the real attack. Reproducible builds (map 4 launch
  gate) are what let anyone check the client does what this file says.
- Deleting the Google OAuth client invalidates every refresh token in every
  vault. The blast-radius answer is: never delete, only add clients; rotation
  is a new family key, not a client swap.
- Password strength is the user's key strength. Minimum 12 characters,
  strength meter, no maximum, no composition rules.

## 12. Billing (added 2026-09-01, owner ruling "make it happen")

**Price: $5 a month or $50 a year.** Fourteen-day trial from signup, no card
up front. The app stays free and AGPL; the account (sync, credentials vault,
push, the phone) is what is paid for. Billing runs on Stripe on the web only.
The iOS app never shows a purchase, so Apple's in-app-purchase rule does not
apply; it shows "Manage on getmaru.app".

Entitlement states, stored on the user, computed server-side:

| state | meaning |
| --- | --- |
| `trialing` | `trial_ends_at` in the future, no subscription |
| `active` | Stripe subscription `active` or `trialing` |
| `past_due` | Stripe `past_due`; **7-day grace** from the first failed invoice |
| `expired` | trial over with no subscription, or subscription ended, or grace over |
| `comped` | `comped = true` on the user; set by `server/scripts/allow.ts comp <email>`; beta testers are comped |

Enforcement: **reading is never locked.** `GET /v1/vault`, `GET /v1/devices`,
`GET /v1/me`, logout and account deletion always work. `PUT /v1/vault`,
`POST /v1/push/register` and `POST /v1/push/watch` return **402
`payment_required`** when the state is `expired`.

Endpoints (bearer):

| Method, path | Body → Response |
| --- | --- |
| `GET /v1/me` | → `{email, accountId, entitlement:{state, plan, trialEndsAt, periodEndsAt, cancelAtPeriodEnd}}` |
| `POST /v1/billing/checkout` | `{plan:"monthly"\|"yearly"}` → `{url}` — Stripe Checkout, subscription mode, `automatic_tax`, `client_reference_id = accountId`, customer created lazily and stored as `stripe_customer_id`; success and cancel URLs `https://getmaru.app/account?checkout=success` and `…=cancel` |
| `POST /v1/billing/portal` | → `{url}` — Stripe Customer Portal (cancel, update card, switch plan) |
| `POST /v1/billing/webhook` | Stripe-signed. Handles `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Idempotent by event id (`stripe_events` table). |

Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`,
`STRIPE_PRICE_YEARLY`. When absent, `/v1/billing/*` returns 503
`billing_unavailable`; trials and comps still work, so the beta needs no
Stripe. `server/scripts/stripe-setup.ts` creates the product "Maru Sync" and
both prices idempotently (Stripe `lookup_key`s `maru_sync_monthly`,
`maru_sync_yearly`) and prints the env lines to paste.

Data: `users` gains `trial_ends_at, comped, stripe_customer_id`;
`subscriptions (user_id pk, stripe_subscription_id, status, plan,
current_period_end, cancel_at_period_end, past_due_since)`;
`stripe_events (id pk, received_at)`.

## 13. Vault history and session expiry (added 2026-09-01)

The server keeps the last **10** vault versions in `vault_history (user_id,
version, ciphertext, updated_at)`. `GET /v1/vault/history` lists versions;
`POST /v1/vault/restore {version}` copies that ciphertext forward as a new
current version. This is the answer to "a bad sync overwrote my settings"
without the server ever reading a byte.

Session tokens expire after 365 days idle (`last_seen_at`). The client treats
that 401 exactly like `revoked`.
