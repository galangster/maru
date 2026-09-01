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
  the tokens. No message bytes, headers, or ids reach the service.
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
salt, same parameters). It never sees masterKey, encKey, accountKey, or
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
  }
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
- The document is capped at 256 KiB plaintext. The server rejects a blob over
  384 KiB ciphertext.

## 5. Wire API

Base URL: `https://sync.getmaru.app` in production, a Railway domain in the
beta, `http://127.0.0.1:8787` in development. JSON bodies. Errors are
`{ "error": "<code>", "message": "<text>" }` with an HTTP status.

| Method, path | Auth | Body → Response |
| --- | --- | --- |
| `POST /v1/auth/prelogin` | none | `{email}` → `{kdf:{algo:"argon2id",m,t,p}, salt}` (salt = the client-side rule in §3 echoed; unknown email returns the same shape with default kdf so nothing leaks) |
| `POST /v1/auth/signup` | none | `{email, authKey, recAuthKey, kdf, wrappedByPassword, wrappedByRecovery, device:{name, platform, family}}` → `{token, deviceId, accountId}`. **403 `not_allowed`** if email is not on the allowlist. 409 `exists`. |
| `POST /v1/auth/login` | none | `{email, authKey, device}` → `{token, deviceId, accountId, kdf, wrappedByPassword}`. 401 `bad_credentials`. Rate limited per email and per IP. |
| `POST /v1/auth/recover` | none | `{email, recAuthKey, newAuthKey, newWrappedByPassword, newRecAuthKey, newWrappedByRecovery, device}` → `{token, deviceId, accountId, wrappedByRecovery(old)}`. Revokes all other devices. |
| `POST /v1/auth/password` | bearer | `{authKey, newAuthKey, newWrappedByPassword}` → `{ok:true}` |
| `POST /v1/auth/logout` | bearer | → `{ok:true}` (revokes this device's token) |
| `GET /v1/vault` | bearer | → `{version, ciphertext, updatedAt}` or 204 when empty |
| `PUT /v1/vault` | bearer | `{baseVersion, ciphertext}` → `{version}`; **409 `conflict`** with the current `{version, ciphertext}` when baseVersion ≠ current |
| `GET /v1/devices` | bearer | → `{devices:[{id, name, platform, family, createdAt, lastSeenAt, current}]}` |
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
- **Push** after any local change to settings, the account list, or a
  credential (debounced 2 s). `PUT` with the last-seen version. On 409, open
  the returned blob, merge, re-seal, `PUT` again with its version. Give up
  after 3 rounds and surface a "sync paused" state.
- **Merge** is per section: `settings` = the copy with the newer `updatedAt`;
  `accounts` = union by email, order from the newer copy; `credentials` =
  union per family and email, newer `issuedAt` wins.
- **Apply** on a device: settings replace local settings (except device-local
  fields, if any are later declared); accounts absent locally are added —
  with tokens if this family has them, otherwise into the directed-consent
  list; accounts absent remotely are removed locally, their tokens deleted
  from the keychain.
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

`allowed_emails` on the server is the only door. Signup returns 403
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
