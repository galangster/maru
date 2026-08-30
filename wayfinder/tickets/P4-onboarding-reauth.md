# P4 — The stranger's first hour  `wayfinder:task`

status: open · claimed: — · blocked by: R3a shapes half of it

## Question → work

Everything between "downloaded the DMG" and "living the triage morning":

- OAuth setup: today's Google-Cloud-console safari, either replaced by a
  shared client id (R3a's outcome) or made as painless as documentation
  and in-app guidance can make it.
- The 7-day re-auth dies: Nick flips the consent screen to production
  when this ticket's support work lands; the app's re-auth UX handles
  whatever verification state Google leaves us in.
- Onboarding's agent half: creating an agent + `claude mcp add` (npx form
  once P6 lands) walked through in-app, not only in docs.
- The "nothing feels unfinished" sweep of the first-run surfaces.

## Progress — app-side half, overnight 2026-08-30

Shipped everything console-independent; the ticket stays open for Nick's
half (R3a decision, consent-screen production flip, and the shared-client
work that follows).

- **Re-auth is "Add account".** Signing in with an address Wren already
  holds re-links it: fresh tokens under the existing account id, engine
  restart, no duplicate, no error. Pinned by test. This is the recovery
  for Google's 7-day testing-mode token death *and* for revocation.
- **The dead grant is typed, not guessed.** `OAuthError.needsReauth`
  now rides `SyncStatus.needsReauth` through the engine's `failed()`,
  so the UI never regexes an error message. Pinned by test.
- **The row says so.** A failed account row shows the error ("Signed
  out by Google — sign in again to reconnect." when typed; the raw
  error otherwise) and a "Sign in again" button that runs the section's
  one add flow (same busy guard, same relink-aware toast).
- **The agent half of onboarding is in-app.** Settings → Agents with no
  agents shows a three-step walkthrough — create, register (copyable
  `claude mcp add wren -- npx wren-mcp --token <credential>`), grant —
  with a link to CONNECT-AN-AGENT for other clients.

/simplify ran (two agents, four angles). Applied: addAccount collapsed
to one shared tail; typed needsReauth replacing the UI regex; one
useSyncStatus subscription in the section (was per-row); "Sign in
again" routed through the section's add() (busy guard + honest copy);
both row buttons on the kit's textButtonClass (rounded-md kept
deliberately — row context); command const hoisted. Skipped: a typed
relink signal on the MailService contract (UI-side before/after check
is honest enough in-dialog; interface churn not yet earned — recorded).
Pre-existing hand-rolled doneClass in agents-settings noted as outside
this diff.

Still Nick-gated: R3a read + shared-client console work, the Google
production flip, and re-testing the 7-day path against a production
consent screen.

## Decisions — Nick, 2026-08-30 (gates N1–N4 of the shared-client plan)

Per docs/research/shared-client-implementation-plan.md (Sol's adversarial
audit, accepted):

- **N1: agent data path = position 1, fallback 2.** Shared OAuth supports
  hosted agent clients, fully disclosed, requesting Google's written
  assessment determination. If Google requires CASA, fall back to
  position 2 (shared OAuth for the human client only; agents require
  BYO) rather than paying for CASA unprompted.
- **N2: name + domain.** Consent-screen name **"Wren Mail"**, domain
  **wren.so** (Nick registers it). Same name everywhere: homepage,
  consent screen, submission, demo.
- **N3: scope.** `gmail.modify` only. `gmail.send`, `openid`, `email`
  all dropped — profile comes from users.getProfile.
- **N4: data controls.** App-level encryption of mail/approvals/audit
  content, real deletion semantics (per-account field keys, key
  destruction on removal), and time-bounded agent-session consent —
  approved as product work.

Workstreams now unblocked: OAuth corrections (plan §2), restricted-data
gaps (plan §3), brand/site (plan §5, after domain registration).

## Progress — OAuth corrections workstream (plan §2), 2026-08-30

Implemented by a Sol delegate (high effort), reviewed, /simplify'd and
sealed by the orchestrating session. 462 tests.

- One scope: `GOOGLE_SCOPES` = `gmail.modify` only; `gmail.send`,
  `openid`, `email` dropped. Partial grants refused, derived from
  GOOGLE_SCOPES (one source of truth).
- Desktop clients are public clients: `client_secret` optional
  everywhere, omitted when empty.
- `src/core/auth/client-config.ts`: resolution order stored issuer →
  BYO settings → build-time official id (WREN_OFFICIAL_GOOGLE_CLIENT_ID,
  release-workflow-injected, never in Git). Source builds stay BYO-only.
- Provenance: `StoredAccountTokens.source` ('official'|'custom');
  legacy records migrate as 'custom'. Refresh binds to the ISSUING
  client id — a settings change never silently rebinds a token.
- `OAuthClientError` (invalid_client / deleted_client /
  unauthorized_client) typed apart from account invalid_grant; neutral
  copy that fits BYO and official clients alike.
- Settings transfer never exports an official client id.
- Orchestrator review added: per-account startup failure isolation
  (one unreadable token record no longer aborts every account), and
  last-sync-status retention with replay to late subscribers (the
  startup error fired before the UI could listen). Both pinned.

/simplify (two agents, four angles) applied: explicit-field token-store
load (no unknown-key passthrough), IssuingClient as Omit of the config
type, scope-literal dedup in tests, MissingOAuthClientError wording fit
for both throw sites, envPrefix warning comment. Skips with reasons:
TokenManager resolver seam (the issuer-secret rule spelled twice is
defense in depth; a full resolver interface not yet earned), double
keychain read at startup (lazy, promptless, one extra IPC), sequential
account attach (concurrent keychain prompts are worse UX), minor
form/constant dedups. Also kept: `clientFailure` discriminant
(survives serialization boundaries).

Remaining product work before submission: plan §3 (encryption at rest,
deletion semantics, agent-session consent, prompt-injection tests) and
the client-failure UI surfacing (Settings row offering BYO when
OAuthClientError is the cause).

## Progress — restricted-data gaps workstream (plan §3), 2026-08-30

Two Sol delegates (high effort), reviewed, /simplify'd (fixes applied by
a third), and sealed by the orchestrating session. 476 tests.

- **Encryption at rest** (§3 items 1–2): AES-256-GCM, one key per
  account in the OS keychain (`wren:key:account:<id>`), AAD-bound to the
  account id. Encrypted columns: thread subject/snippet/participants,
  all 13 message content columns, label names, approval payloads, and
  the audit log's summary + thread key. Structural columns (ids, labels,
  dates, flags) stay plaintext so every query still works. Legacy rows
  are swept once at open (`meta` marker, keyset-paged); demo mode and
  keyring-less tests pass through unchanged.
- **Deletion semantics** (§3 items 5–6): account removal expires that
  account's pending approvals, deletes its rows, then destroys its key —
  which cryptographically erases the mail-derived audit fields while the
  append-only structure (who/when/tool/outcome) survives. Erased rows
  read back as "Content erased when its account was removed."
- **Agent-session consent** (§3 item 7; Part 1 §2): grants stay durable;
  a time-bounded in-memory session (15 m / 1 h / 8 h, restart = closed)
  gates all nine mail-touching tools before the grant check. The consent
  surface in Settings → Agents shows identity, live capabilities, data
  classes, and the provider-path disclosure; a refused agent raises one
  throttled `sessionRequested` OS notification. Session start/end/expiry
  are audit rows; wren_ping reports session state.
- **Prompt-injection defenses + tests** (§3 item 8): bodies, snippets
  and attachment results marked untrusted (note + spoof-neutralized
  markers); tests/injection.test.ts pins wrapping, marker spoofing,
  and that hostile content never moves authorization.
- Key lifecycle documented in SECURITY.md (§3 item 3).

/simplify (two agents, four angles; fixes by Sol). Applied: one-time
sweep marker (was re-scanning the mailbox every launch), keyset paging +
parallel encrypts in the sweep, base64 dedup onto mime.ts, module-level
encoders + AAD cache, parseThreadKey reuse, shared encrypted-column
lists (killed the positional decrypt remap), humanDuration/minutesLeft
shared, stripUntrustedMarkers split, updateColumnByKey rename, required
`now` on deleteAccount, dataClasses ternary flattened, session polling
gated. Skips with reasons: attachments `'[]'` sentinel (NOT NULL column;
merge rule depends on it), accountId on AuditDraft (parseThreadKey is
now the one canonical parse), approval expiry stays in Store.deleteAccount
(service holds no gateway), multi-column sweep UPDATE (one-time code).

**Gate N5 still open**: PERMISSION-MODEL.md untouched. The revised
append-only design (structure forever, content erasable by key
destruction) is written up for Nick's approval before the doc changes.

Remaining §3 items: a user-facing "Delete local Google data" action
beyond account removal (item 4), agent disclosure in the connection
flow itself (item 9; the consent dialog covers half), in-app help links
for deletion/revocation (item 10 — site drafts exist), and the
client-failure UI surfacing carried over from §2.
