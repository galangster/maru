# Security

## Reporting

Email [security@getmaru.app](mailto:security@getmaru.app) or open a GitHub
security advisory on this repository. Do not open a public issue for an
exploitable report. The security address delivers to a human. Maru does not
offer a bounty program.

## What Maru trusts, in one page

Maru is local-first. Mail traffic goes directly to Google's APIs. Optional
Maru Sync stores an end-to-end encrypted account vault. There is no telemetry
or network listener in the app. The full
model is specified in [docs/PERMISSION-MODEL.md](docs/PERMISSION-MODEL.md);
the load-bearing facts:

- **The agent gateway** listens on a unix domain socket (`0600`, in a
  `0700` directory) or an owner-ACL named pipe — never a TCP port. Any
  process running as your user can reach the socket; that is the trust
  boundary, and it is the same one your keychain already lives behind.
- **Agent credentials** are bearer tokens. Maru stores only SHA-256
  digests; the token itself exists in your agent's config. Anything that
  can read that config can act as that agent — revoke the agent in
  Settings → Agents the moment you suspect a leak (it bites on the next
  call, no restart).
- **No grant lets an agent send mail.** The widest grant queues a message
  for your approval; a human taps every send in Maru's own UI.
- **Every call and every refusal is audited**, append-only, per agent.
- **OAuth tokens** live in the OS keychain, never in the database or settings
  exports. Optional Maru Sync copies refresh tokens inside a vault encrypted
  with an account key that the service never receives. Access tokens never sync.
- **Mail content is encrypted at rest.** Message bodies, subjects,
  snippets, addresses, attachment metadata, label names, queued agent
  send drafts, and the mail-derived fields of the audit log are
  AES-256-GCM ciphertext in the local database, keyed per account.

## Encryption keys

One 256-bit key per Gmail account, held in the OS keychain (entry
`wren:key:account:<account-id>`, same keychain service as the OAuth
tokens) and never written to the database or to exports.

- **Creation** — generated from the OS random source the first time an
  account is stored. Adding an account creates its key; nothing else
  does.
- **Rotation** — removing an account and signing in again issues a fresh
  key; old ciphertext is gone with the removal. There is no in-place
  rotation, because the durable copy of your mail is Gmail itself, not
  Maru's cache.
- **Recovery** — there is none, on purpose. If the keychain entry is
  lost, the local cache is unreadable and Maru re-syncs the mailbox from
  Gmail. Anything only the key could unlock stays locked.
- **Deletion** — removing an account deletes its rows, then destroys its
  key. Key destruction is what erases the mail-derived fields of that
  account's audit history: the append-only rows keep their structure
  (who, when, which tool, outcome) while their content fields become
  undecryptable ciphertext.

## Scope notes for researchers

The interesting surfaces are the gateway frame protocol
(`src/core/gateway-server/`, `src-tauri/src/gateway.rs`), the grant
evaluator (`src/core/agents/grants.ts` — nine rules, pure), and the HTML
mail sandbox (`src/features/reading/message-body.tsx`). Demo mode
(`?demo=1`) reaches no real data and is safe to attack freely.
