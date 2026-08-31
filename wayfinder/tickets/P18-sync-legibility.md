# P18 — Which account isn't syncing  `wayfinder:task`

status: DONE (2026-08-31) · owner report → six defects → shipped

**P4 owns the recovery mechanism and its copy. P18 owns only the pointer to
it, and the honesty of the status the app prints.** P4's two shipped strings
are reused verbatim; only the no-credentials sentence is new.

## The ask

Nick, 2026-08-31: "none of the emails are syncing (or at least some aren't i
can't tell via the UI which ones aren't syncing)."

## What was actually wrong, in two halves

### Half one: the immediate cause was not a bug

Mail had genuinely stopped, and for a reason the app was right about but could
not explain. `src-tauri/src/lib.rs` gives dev and release builds **different
keychain services** on purpose — `dev.wren.app.dev` and `dev.wren.app` — so a
differently-signed dev build can never damage the ACLs on real tokens. But
`tauri.conf.json` gives both builds the **same bundle identifier**, so they
share one database.

A dev build therefore reads four real accounts out of a keychain holding none
of their tokens. Measured that afternoon: 8 items under `dev.wren.app`, zero
under `dev.wren.app.dev`. Nick had been looking at a dev window since 13:33;
the last mail had landed at 11:01.

Quitting it and launching `/Applications/Maru.app` restored sync in under a
minute — all four accounts, every `history_id` advancing. Nothing was broken.

**That is the whole problem.** The app knew it had no credentials. It said
"Sync failed", which reads as *Google is having trouble*, and offered
"Maru is retrying", which was a promise it could not keep.

### Half two: five real defects the report uncovered

1. **`useSyncStatus` is a partial record** (`queries.ts`) — filled only by
   events, so an account that has not reported is *absent*, not idle. The
   footer read it with `.some(s => s.state === 'error')`, so **four accounts
   with one status rendered "Up to date"** — a positive claim about three
   accounts the app had heard nothing from. This is the reported symptom,
   produced by the UI itself.
2. **`lastSyncAt` was written and never read.** The engine sets it on every
   success; nothing in the UI touched it, and the reducer replaced each
   account's object wholesale so the first error erased it. "Last synced 40
   seconds ago" versus "six days ago" is exactly the discrimination Nick could
   not make.
3. **Two emitters disagreed.** `SyncEngine.failed()` typed `needsReauth` and
   `clientFailure`; `RealMailService.start()` emitted a bare
   `{state:'error', error}` with neither. The same dead grant rendered
   differently depending on which fired first.
4. **A failed archive painted the account failed.** `performAction` and
   `modifyLabels` each emitted `state:'error'` on rejection — untyped, so it
   read as a network problem — and held it until the next poll tick. The
   rollback and the rethrow were already the recovery.
5. **`MissingOAuthClientError` had no `clientFailure` discriminant**, so "no
   OAuth client is configured" landed untyped and the footer said it was
   retrying, forever, for a state no retry can reach.
6. **Settings sent every untyped error to "Sign in again"** — an OAuth
   browser round trip offered for a rate limit it cannot touch.

## Shipped

**Model.** `SyncStatus.noCredentials` — no token record on *this machine*.
`needsReauth` stays true alongside it because the remedy is the same sign-in
flow; only the sentence changes, since Google did nothing. New
`src/core/sync/failure.ts` is the one place an error becomes a status, used by
both emitters. `MissingOAuthClientError` gained the discriminant. The two
action-failure emissions are deleted, and `tests/real.test.ts` now asserts
their *absence* — those tests had been pinning the defect.

**Footer.** `src/features/sidebar/sync-summary.ts` is a pure function, so the
copy is tested as data rather than by rendering four accounts in five states.
Precedence worst-first: demo → client rejected → signed out → transient →
never heard → syncing → idle. It filters against the real account list in both
directions. It reports the **oldest** last-sync, not the newest, so "last
synced 2m ago" is true of every account and not just the luckiest.

Three tiers, not two: `short` at `@[13rem]` (budgeted to 11 characters and
tested), `full` at `@[17rem]`, the sentence in the tooltip and the
screen-reader line. Only the address truncates — the verb phrase never does,
so the worst case is `Sign in again — nick@metad…` with the instruction
intact.

The line is a **button only when there is somewhere to go**, which is the same
argument `ApprovalsBadge` makes about being absent at zero.

**Collapsed rail.** The status line was dropped entirely at 68px, so a dead
grant was invisible and mail silently stopped. One destructive `IconButton`,
only for the two actionable states, carrying the whole sentence as its label.
New `alert` tone — the only one that rests coloured, because `danger` rests
grey for a trash button you *might* press and this is a standing alert you
*must*. Account rows are untouched: no badge, no ring, no second dot.

**Settings.** The status line renders in every state, not just failure — a
healthy account saying when it last synced is what makes a silent one legible.
Three recovery buttons instead of two: "Use your own client", "Sign in again",
and a new "Try again" for untyped errors.

**List pane.** `SyncNotice` — the one new element, and a strip rather than a
card, reusing the search-count strip's recipe plus the settings notice's wash.
Fires **only** for `needsReauth`/`clientFailure`. A transient error never
escalates past the footer glyph. Dismissal is session-scoped and never
persisted: a permanently dismissed notice would recreate exactly the silence it
exists to end.

## Rejected, and why

- **Per-account marks on sidebar rows.** A permanent 16px slot on every row,
  every day, costing address width at the 200px sidebar floor, to answer a
  question asked a handful of times a year — and it puts a second coloured mark
  beside the identity hue dot, degrading the multi-account scanning that dot
  exists for. Words say which account *and* why *and* what to do; a mark says
  only which.
- **A corner badge on the collapsed rail glyph.** Puts a status colour on the
  one element identifying which account a row is, and composites wrong over
  `bg-fill-selected` / `bg-fill-hover`.
- **A 3-consecutive-errors streak counter** to suppress action-failure noise.
  That noise was a bug in the emitter; deleting the two writes is smaller,
  removes code instead of adding a reducer, and fixes every reader at once.
- **A manual retry button in the sidebar** for the transient state. Waiting is
  the fix; `refresh()` is already on the palette and the list header, and a
  retry button in a nav during an outage gets mashed.
- **A new panel for account health.** Settings → Accounts already carries the
  avatar, address, typed message and recovery buttons.

## The simplify pass caught two more, and one was mine

Run on the finished diff, before sealing. Both applied.

1. **I reintroduced the exact bug I was fixing.** Giving
   `MissingOAuthClientError` a `clientFailure` discriminant routed its remedy
   correctly (Settings → Google) but made three surfaces say *"Google rejected
   Maru's OAuth client"* for a state Google has never seen — it is thrown
   before any network call. Same false-sentence class as "signed out by
   Google" for an empty keychain, which this ticket exists to delete. Fixed
   with a second discriminant, `noClientConfigured`, and its own copy:
   "Maru has no Google OAuth client configured on this Mac… Nothing at Google
   is wrong."
2. **`healthy = accounts.length - errored.length`** counted accounts the app
   had heard nothing from as up to date, so `rest()` printed *"The other 3
   accounts are up to date"* about three accounts that had never reported.
   The top-level branch guarded against this; the sentence a person actually
   reads did not. Now counts confirmed-idle accounts only, with a test.

Also applied: one `syncKind()` discriminant shared by the footer, the notice
and the Settings row (they had already drifted — the Settings row's
`signedOut` was true for a rejected client, and survived only because a
ternary happened to test the other case first); `urgent` derived from the kind
rather than from `action !== null`, which had let a Wi-Fi blip take the
destructive glyph; the `lastSyncAt` merge moved from the subscriber to the
emitter, so a late-mounting component and the sidebar cannot hold different
values for one account; `refresh()` now brings up accounts that never
attached, which is what made "Try again" a control that did nothing; the
seven-deep ternary in the Settings row flattened to a switch.

Skipped, with reason: a shared `spokenList()` helper (three near-variants
exist across the app — a real cleanup, but outside this diff's blast radius);
exporting `StripButton` for the notice (its geometry differs on purpose — the
notice wraps and the sibling strips do not); making `short` optional (four
literals saved, no behaviour change); and having `useSyncStatus` return a
complete record keyed by real accounts. That last one is the deepest fix and
worth doing later — it would make the partial-record mistake unrepresentable
rather than documented — but it needs the hook to take a dependency on the
account list, and `describeSync` needs the `Account` objects anyway for their
addresses, so the deletion is smaller than it first looks.

## Reviewable without breaking an account

`?sync=signedout|nocreds|client|noclient|transient|partial` makes the demo
service report a failure, following `?onboarding=1`'s precedent. These are the
states a person is most likely to meet on a bad day and least likely to see on
purpose, and the only other way to reach one was to break real mail.
`partial` signs out ONE account of several — the case the old footer could not
express at all.

## Known gap, deliberately deferred

"Starting…" has no timeout, so an engine that never emits shows it
indefinitely. Strictly better than the false "Up to date" it replaces. The
follow-up is escalating to "Not synced yet" after ~30s, which needs a timer and
new state.

## For the dev build specifically

A dev launch with an empty dev keychain now reads "Sign in" in the footer,
"Maru has no saved sign-in for any account on this Mac, so no mail is
arriving" in the tooltip, a red glyph on the collapsed rail, and "Not signed in
on this Mac — sign in to connect it. Nothing at Google changed." on each
Settings row. Which is the truth, and is one click from the flow that fixes it.
