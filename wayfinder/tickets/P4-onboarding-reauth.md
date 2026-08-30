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
