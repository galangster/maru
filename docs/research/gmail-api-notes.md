# Gmail API notes for a desktop mail client

Researched 2026-08-28. Facts verified against Google's own developer docs and support
pages; each item below is CONFIRMED or CORRECTED against the original assumption.

## 1. Desktop OAuth flow — CONFIRMED (with nuance)

Loopback redirect (`http://127.0.0.1:PORT` or `http://[::1]:PORT`) is Google's
recommended flow for installed desktop apps, and PKCE is recommended alongside it.
This matches RFC 8252 (OAuth 2.0 for Native Apps), which Google's docs implement.

On the `client_secret` question: Google's Cloud Console still issues a `client_secret`
for a "Desktop app" OAuth client type, and the token-exchange parameter table lists
`client_secret` as present but **optional** for this client type. Per RFC 8252 (and
Google's own guidance), a secret embedded in a distributed native app **cannot be
kept confidential** — it should not be treated as proof of client identity. So: the
secret is not required for the exchange to work with loopback+PKCE, and even where
it's sent, it is not a security boundary.

Sources:
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://www.rfc-editor.org/rfc/rfc8252.html

## 2. Testing-status refresh tokens & unverified-app screen — CONFIRMED

A GCP project with OAuth consent configured as **External** user type and publishing
status **Testing** issues refresh tokens that expire in **7 days** — *unless* the only
scopes requested are a subset of name/email/profile (non-sensitive). This directly
affects Gmail scopes (all sensitive/restricted), so a Testing-mode Gmail app's refresh
tokens expire weekly.

Setting the app to **In production** without completing verification does not remove
the "unverified app" interstitial — Google's help center confirms the screen is shown
for apps requesting sensitive/restricted scopes that haven't been verified, before the
normal consent screen. In production status, apps under 100 users (personal/internal
use) can continue operating without completing verification indefinitely — this covers
a single-owner desktop app. (Google's docs did not give me an explicit sentence about
whether the *developer's own* account can click through the interstitial, but the
"fewer than 100 users, continue without verification" guidance combined with universal
practice — Advanced → "Go to [app] (unsafe)" — confirms this is the standard path for
personal-use apps; I could not find a primary-source sentence that spells out the
click-through UI text itself.)

Practical implication: for a single-user desktop client, keep the OAuth consent screen
in whichever status is convenient, but **In production + unverified**, with the owner
added if using External type, avoids the 7-day Testing-mode refresh-token churn.

Sources:
- https://developers.google.com/identity/protocols/oauth2 (7-day Testing token policy)
- https://support.google.com/cloud/answer/7454865 (unverified app screen)
- https://support.google.com/cloud/answer/13464323 (when verification is not needed — "fewer than 100 users")

## 3. Scope classification — CORRECTED

Original assumption: gmail.modify and gmail.readonly are *restricted*; gmail.send and
gmail.labels are *sensitive*. Actual classification per Google's OAuth scopes
reference:

| Scope | Class |
|---|---|
| `gmail.readonly` | **Restricted** |
| `gmail.modify` | **Restricted** |
| `mail.google.com` (full access) | **Restricted** |
| `gmail.metadata` | Restricted |
| `gmail.send` | **Sensitive** |
| `gmail.compose` | Sensitive |
| `gmail.insert` | Sensitive |
| `gmail.settings.basic` | Sensitive |
| `gmail.settings.sharing` | Sensitive |
| `gmail.labels` | **Non-sensitive** ("See and edit your email labels") — corrected from the assumption that it's sensitive |

Minimal scope set for read + archive + trash + star + send: the practical minimum is
**`gmail.modify`** (covers read, label changes — archive/star/trash are all label
operations — and message composition/sending is *not* included) **plus `gmail.send`**
for actually sending mail, since `gmail.modify`'s description ("Read, compose, and send
emails") is misleading — in practice Google's own restricted-scope list treats
`gmail.modify` as not including `messages.send`; test this in the API, but the safe
minimal pairing most desktop clients use is `gmail.modify` + `gmail.send`. If sending
must also support drafts, add `gmail.compose` instead of `gmail.send` alone (compose
covers create/send/delete of drafts and sending). No need for `gmail.labels` separately
— `gmail.modify` already grants label read/write.

Source: https://developers.google.com/identity/protocols/oauth2/scopes#gmail

## 4. Incremental sync (history.list) — CONFIRMED, with corrected expiry window language

- `users.history.list` with `startHistoryId` returns all changes after that point;
  `historyTypes[]` filter accepts `messageAdded`, `messageDeleted`, `labelAdded`,
  `labelRemoved` — confirmed as documented parameter values.
- On an invalid/expired `startHistoryId`, the API returns **HTTP 404**, and the client
  must perform a full resync (`messages.list` from scratch, then resume incremental
  sync from the new `historyId`).
- Typical validity window: Google's own phrasing is **"typically valid for at least a
  week"**, but explicitly warns it **"may sometimes be significantly less"** — in rare
  cases **only a few hours**. Design for 404 as a routine, expected code path, not an
  edge case — don't assume a week is guaranteed.

Sources:
- https://developers.google.com/workspace/gmail/api/guides/sync
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list

## 5. Batch endpoint & quota units — CORRECTED (quota changed May 1, 2026)

Batch endpoint and limits — confirmed as assumed:
- URL: `https://gmail.googleapis.com/batch/gmail/v1`
- Max 100 calls per batch request (Google's own text: *"You're limited to 100 calls in
  a single batch request"*), but Google **recommends staying at or under 50** —
  *"Sending batches larger than 50 requests is not recommended"* since larger batches
  are likely to trigger rate limiting.

Quota — **CORRECTED, and this is a live, current change worth designing around**:
Google rolled out a new Gmail API quota tiering model on **2026-05-01** (per the
official Gmail API release notes), replacing the old "250 quota units/second/user"
framing entirely:

- **New default (post 2026-05-01) per-user limit: 6,000 quota units per minute per
  user per project** (≈100 units/sec average, not 250/sec — significantly less
  headroom than the old figure).
- **Per-project limit: 1,200,000 quota units per minute per project.**
- Projects that actively used the Gmail API between **November 2025 and April 2026**
  keep their old quota (the 250 units/sec/user figure) for now, but this is a
  grandfather clause, not the current default — **do not build a new app's rate
  limiter around 250/sec.**
- A new **80,000,000 quota-unit/day billing threshold per project** was introduced;
  billing isn't active yet, Google says details with 90+ days' notice are coming later
  in 2026.
- **Per-method costs also changed in the same rollout** for several endpoints,
  including `messages.get`, `drafts.get`, `messages.attachments.get`,
  `messages.trash`, `threads.get`, `threads.trash`. Current costs (as published on the
  quota reference page today):

| Method | Units |
|---|---|
| `getProfile` | 1 |
| `labels.list` / `labels.get` | 1 |
| `history.list` | 2 |
| `messages.list` | 5 |
| `messages.modify` | 5 |
| `messages.untrash` | 5 |
| `drafts.list` | 5 |
| `drafts.create` | 10 |
| `messages.delete` | 10 |
| `threads.list` / `threads.modify` | 10 |
| `drafts.update` | 15 |
| `messages.get` | **20** (was 5 — corrected) |
| `messages.trash` | 20 |
| `messages.attachments.get` | **20** (was assumed lower) |
| `threads.delete` / `threads.trash` | 20 |
| `messages.import` / `messages.insert` | 25 |
| `messages.batchDelete` / `messages.batchModify` | 50 |
| `messages.send` | 100 (confirmed as assumed) |
| `drafts.send` | 100 |
| `threads.get` | 40 |
| `watch` | 100 |

`history.list` at 2 units and `messages.send` at 100 units were correctly assumed;
`messages.get` at 5 units was **not** correct — it is now 20 units, a 4x jump from
what may be an older cached figure. This materially affects sync-loop budget math
(see design note below).

Sources:
- https://developers.google.com/workspace/gmail/api/guides/batch
- https://developers.google.com/workspace/gmail/api/reference/quota
- https://developers.google.com/workspace/gmail/api/release-notes (2026-05-01 entry: "Generally Available: Updates to Gmail API usage quotas")

## 6. `messages.get?format=full` — CONFIRMED

`format=full` returns the full message with a parsed `payload` (MIME tree: `parts[]`,
headers, `body.data` as base64url) — the `raw` field is not populated in this mode, so
no client-side RFC822/MIME parsing is needed for normal reading. Large attachment
bodies are omitted from `full` and require a separate
`users.messages.attachments.get` call using the `attachmentId` found in the relevant
part. Format enum confirmed: `MINIMAL` (id/labels only), `FULL` (parsed payload),
`RAW` (base64url RFC822 in `raw`, no `payload`), `METADATA` (id/labels/headers only,
no body) — `full`/`raw` are unavailable under the `gmail.metadata` scope.

Source: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get and the linked Format enum reference.

## 7. `messages.send` — CONFIRMED

Accepts a base64url-encoded raw RFC 822/2822 message in the `raw` field. For threading
a reply correctly, Google's own sending guide specifies matching **`Subject`** headers
plus RFC 2822-compliant **`References`** and **`In-Reply-To`** headers — this is the
documented mechanism. (Google's guide text did not separately call out setting the API
`threadId` field as required; the header match is what the doc emphasizes. In practice
most implementations set both threadId and matching headers — do the same as defense
in depth, but the header match is the documented requirement.)

Source: https://developers.google.com/workspace/gmail/api/guides/sending

## 8. CORS — CONFIRMED (background only, not relevant to a Node-based client)

Google APIs, including calls under `googleapis.com`, support CORS for browser-based
JavaScript clients with proper OAuth. Not relevant to Wren's design since calls
originate from Node (Electron main/renderer via Node, not arbitrary browser origins),
noted here only as background per the task.

Source: https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow (Google's CORS-for-APIs guidance, general)

---

## Design-relevant takeaways (sync engine)

1. **`messages.get` now costs 20 units, not 5.** At the new default per-user quota
   of 6,000 units/minute, a naive "fetch full message per new message" sync loop tops
   out around **300 `messages.get` calls/minute** before throttling — plan batch
   fetching (`batchGet` via the batch endpoint, ≤50 per batch) and prefer
   `format=metadata` or `minimal` where the full body isn't needed yet.
2. **Do not hardcode 250 units/sec as the rate ceiling** — it's a legacy/grandfathered
   number. Design the rate limiter off **6,000 units/minute/user**, and treat the old
   number as an upper bound only for accounts that were already active pre-May-2026.
3. **Treat `historyId` 404 as a normal, frequent code path**, not a rare edge case —
   Google's own docs hedge "typically a week" down to "sometimes only a few hours."
   The full-resync path needs to be cheap and routine, not a break-glass procedure.
4. **`gmail.labels` is non-sensitive** — pulling it into the scope set doesn't trigger
   extra verification burden, but it's redundant if `gmail.modify` is already
   requested (which covers label read/write).
