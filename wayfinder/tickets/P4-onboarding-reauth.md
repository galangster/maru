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
  **Amended 2026-08-30**: wren.so was already taken. Nick chose
  **wrenmail.io** (name-matching, .io available; .dev/.org also free).
  All live surfaces swept to wrenmail.io; the name "Wren Mail" stands.
  **Amended again, same day**: before the wrenmail.io purchase closed,
  Nick renamed the product — **Wren → Maru**, consent name **"Maru
  Mail"**, domain **getmaru.app** (already his; no purchase). Bird logo
  stays. User- and agent-visible surfaces swept (maru_ping, maru-mcp);
  state-carrying internals deliberately keep `wren` — see ticket
  [P12](P12-internal-rename-migration.md). "Maru" is a busier name than
  Wren, so the brand-verification name-collision check gains weight.
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

**Gate N5: approved — Nick, 2026-08-30** ("Do what you recommend", on
the presented design). Append-only means: structure forever (no row
deleted or rewritten; who/when/tool/outcome survive account removal);
mail-derived content fields erasable only by destroying that account's
key on removal, all-or-nothing per account; non-mailbox rows (grants,
sessions, connections) readable forever. PERMISSION-MODEL.md §8.1 and
summary item 7 amended to match.

## Progress — §3 stragglers + client-failure UI, 2026-08-30 (autonomous)

Under Nick's standing order ("keep going autonomously"). One Sol
delegate, reviewed, /simplify'd, sealed here. 477 tests. Plan §3 is now
fully closed; owner-only work lives in wayfinder/NICK-QUEUE.md.

- **Client failure surfaces in the row** (§2 remainder):
  `SyncStatus.clientFailure` typed end-to-end via `isClientFailure`
  (the serialization-safe discriminant guard, exported from oauth.ts);
  the row says the account is fine and offers "Use your own client",
  which routes to Settings → Google.
- **"Delete local Google data"** (§3 item 4): confirm-gated action in
  Settings → Accounts; iterates removeAccount, so rows, tokens, keys,
  and pending approvals all go through the one tested path.
- **Agent disclosure in the connection flow** (§3 item 9): one shared
  AGENT_DISCLOSURE constant rendered in onboarding's choose step and
  beside the Add-account button.
- **In-app help** (§3 item 10): deletion guide (wren.so), Google
  permissions revocation, and a Manage-agents section link.

/simplify (two agents, four angles; fixes applied directly — too small
to delegate): isClientFailure guard replacing the inline duck-type,
disclosure copy deduped into features/agents/disclosure.ts, the
two-recovery button split into two plain buttons, confirm copy aligned
with the section copy. Skips: sequential removeAccount loop kept
deliberately (shared-store mutation ordering; N ≤ 3), onNeedsClient
rename (churn-only).

## Progress — submission dossier (plan §6–§7), 2026-08-30 (autonomous)

One Sol delegate wrote the ten dossier artifacts (`docs/security/`,
`ops/google-oauth/`): data flow (with the hosted-model hop), restricted-
data inventory, an eleven-method scope matrix cited to api.ts lines,
encryption/deletion (quoting PERMISSION-MODEL §8.1's erasure paragraph),
agent consent + injection coverage, verification answers with §7's
wording verbatim, and the incident/quota/reverification/contacts
runbooks. Console-only facts are `«NICK»` placeholders (indexed in
NICK-QUEUE.md).

Its cross-check surfaced five gaps; fixed four in the same seal:
`list_pending` is now session-gated (queued reply drafts quote mail),
the consent dialog names off-device processing explicitly, the site
drafts' key claims corrected (per-account, attachment bytes not
cached), SETUP-GOOGLE-OAUTH now says one scope and README says signed/
notarized macOS + unsigned Windows. Skipped with reason: widening
generic Gmail 403s to the "Use your own client" recovery would
misclassify rate limits — recorded as a dossier NOTE instead.
477 tests.

## Progress — Wren → Maru rename, 2026-08-30 (autonomous)

One Sol delegate swept every user- and agent-visible surface; the
orchestrator verified the keep-list, renamed the shim package
(npm/maru-mcp, bin/maru-mcp.mjs, MARU_* env vars with WREN_* honored
for existing configs), updated repo URLs after renaming the GitHub repo
(galangster/wren -> galangster/maru; the old private maru project moved
to maru-legacy), and relabeled CI artifacts. 477 tests.

Verified untouched (state-carrying, ticket P12): keychain service
dev.wren.app + dev.wren.app.dev, key prefixes wren:account:* and
wren:key:account:*, ciphertext prefix wrenc1:, bundle identifier
dev.wren.app, socket paths, CSS/design tokens.

/simplify skipped with reason: a rename sweep is mechanical string and
copy work with no new structure; the orchestrator exemption applies.

## Progress — production Google project, 2026-08-30 (driven live with Nick)

Console built end-to-end in Nick's Chrome with the agent driving and
Nick supplying the two owner moments (project Create under the
permission classifier, the User Data Policy agreement) and the
production push confirm. Result: project `maru-mail-prod` (number
537601059334), Gmail API enabled, consent screen "Maru Mail" External
with getmaru.app branding and authorized domain, `gmail.modify` as the
only scope, Desktop client "Maru Mail Desktop"
(537601059334-su62jrimhnfg3lg5ql21uet30135mdll.apps.googleusercontent.com;
secret never stored — public client), **publishing status In
production**. Client id wired into macos-release.yml via the
`WREN_OFFICIAL_GOOGLE_CLIENT_ID` repo variable with a fail-loud guard;
dossier ids filled. Same sitting: getmaru.app went live on GitHub
Pages with cert + enforced HTTPS after the GoDaddy DNS swap (also
driven in his Chrome). Remaining console work moved to NICK-QUEUE
item 3 (verification submission after the demo, second owner, quota
alerts).
