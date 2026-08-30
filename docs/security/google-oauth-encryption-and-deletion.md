# Google OAuth encryption and deletion

## Encryption design

Maru encrypts mail-content fields with AES-256-GCM. Each Gmail account has one random 256-bit key. Each encryption operation uses a random 12-byte IV. The stored value contains the `wrenc1:` prefix, the IV, and the ciphertext. Sources: `src/core/crypto/keyring.ts:4-9` and `src/core/crypto/keyring.ts:91-103`.

The account id is additional authenticated data. Ciphertext created for one account cannot decrypt under another account. The encryption tests prove that binding. Sources: `src/core/crypto/keyring.ts:54-63`, `src/core/crypto/keyring.ts:105-124`, and `tests/crypto.test.ts:43-56`.

The operating-system keychain stores each account key under `wren:key:account:<account-id>`. OAuth tokens use the separate logical entry `wren:account:<account-id>`. Neither value is stored in SQLite or exported. Sources: `src/core/crypto/keyring.ts:16-18`, `src/core/auth/oauth.ts:256-301`, and `SECURITY.md:29-40`.

SQLite encrypts these content fields:

- Thread subject, snippet, and participants.
- Message sender and recipient fields, subject, snippet, HTML body, text body, attachment metadata, RFC message id, references, and reply reference.
- Label names.
- Agent approval payloads.
- Account-bound audit summary and thread reference.

Sources: `src/core/store/db.ts:253-269`, `src/core/store/db.ts:616-620`, `src/core/store/db.ts:675-717`, `src/core/store/db.ts:809-900`, and `src/core/agents/store.ts:252-329`.

SQLite keeps routing and query fields in plaintext. These include account and Gmail identifiers, label identifiers, message dates, unread and starred flags, sync history ids, account email addresses, approval status, and audit structure. The store uses them for joins, account routing, sorting, state filters, incremental sync, and the preserved audit record. Sources: `src/core/store/db.ts:41-185` and `src/core/store/db.ts:253-269`.

> NOTE: Part 2 §3 of `docs/research/shared-client-implementation-plan.md` requires encryption for restricted data at rest. The plaintext Google-derived identifiers and profile address are a plan-versus-code gap. Resolve it or obtain written acceptance before submission.

> NOTE: `site/security.html:57` says keys are created per install. Current code and `SECURITY.md:36-48` use one key per Gmail account. The public page must use the per-account description before submission.

## Key lifecycle

**Creation.** Maru generates a key from the operating-system random source when it first stores an account. `Store.upsertAccount` ensures that the account key exists. Sources: `src/core/crypto/keyring.ts:54-63`, `src/core/store/db.ts:625-639`, and `SECURITY.md:42-44`.

**Rotation.** Maru has no in-place key rotation. Removing an account deletes its cache and destroys its key. Adding the account again creates a fresh key. Gmail remains the durable mailbox copy. Source: `SECURITY.md:45-48`.

**Recovery.** Maru has no key recovery path. If the keychain entry is lost, the cache cannot decrypt. Maru must sync the mailbox again from Gmail. Content that only the lost key could decrypt remains unreadable. Source: `SECURITY.md:49-51`.

**Deletion.** Account removal first deletes cached rows and then destroys the per-account key. It also deletes the OAuth token entry and removes the account's search-index documents. Sources: `src/core/store/db.ts:658-669`, `src/core/service/real.ts:305-313`, and `SECURITY.md:52-56`.

## Account removal and full local deletion

For one account, Maru performs these operations:

1. Stop that account's sync engine.
2. Expire its pending approval rows.
3. Delete its messages, thread-label rows, threads, labels, sync state, and account row.
4. Destroy `wren:key:account:<account-id>`.
5. Delete `wren:account:<account-id>` from the keychain.
6. Remove the account's thread documents from the in-memory search index.

Sources: `src/core/store/db.ts:658-669` and `src/core/service/real.ts:305-313`.

Settings exposes **Delete local Google data**. The action calls the same account-removal path for every connected account. The confirmation states that cached mail, tokens, and encryption keys leave the device. Nothing at Google changes. Source: `src/features/settings/settings-dialog.tsx:309-324` and `src/features/settings/settings-dialog.tsx:365-405`.

Google revocation is separate. The public guide directs the user to Google's account-permissions page, then instructs the user to remove the account in Maru to clear its local copy. Source: `site/support/google-data.html:29-49`.

## Audit erasure semantics

The following paragraph is quoted from `docs/PERMISSION-MODEL.md` §8.1:

> The log is append-only in structure forever; the mail-derived content of
> its rows is encrypted per account and is erased — cryptographically, not
> by deletion — when that account is removed. Precisely: no row is ever
> deleted or rewritten, and who acted, when, with which tool, and the
> outcome survive account removal unconditionally. The summary and thread
> reference of a row that touched a mailbox are ciphertext under that
> account's key; removing the account destroys the key, those two fields
> become permanently unreadable, and the timeline says so in place
> ("Content erased when its account was removed."). There is no selective
> edit — erasure is all-or-nothing per account, and only account removal
> can do it. Rows that touch no mailbox — grants, revocations,
> connections, sessions, denials without a thread — stay readable forever:
> what *the person and the agent did* is never erased, only what *the
> mailbox's data said*.

Source: `docs/PERMISSION-MODEL.md:258-271`.

## Proof artifacts

`tests/crypto.test.ts` contains these named cases:

- `round-trips, binds ciphertext to its account, passes plaintext through, and destroys keys`
- `shares one keyring per Platform instance`
- `encrypts content columns at rest and restores values with label ordering`
- `sweeps legacy mail and agent rows once`
- `encrypts account content and erases only the removed account`

The last case proves that account removal deletes the key, expires the removed account's approval, preserves another account, and renders the removed audit content as erased. Source: `tests/crypto.test.ts:43-63`, `tests/crypto.test.ts:65-207`, and `tests/crypto.test.ts:209-323`.

The tests are implementation proof. They are not proof of Google Cloud Console configuration or an external security assessment.
