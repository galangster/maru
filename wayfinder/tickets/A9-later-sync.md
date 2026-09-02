# A9 — Later across devices  `wayfinder:grilling`

status: **SHIPPED (2026-09-02)** · map 4

P21 keeps deferrals local so a shut laptop can never hide mail on every
device (fails safe). With a phone, local-only is the bug: a thread saved for
Monday on the Mac stays in the phone's inbox. Proposal: carry
`deferrals: [{threadId, until}]` inside the encrypted vault. The server
sees ciphertext; the letter of spec §1 ("no ids reach the service") moves
to "no ids the service can read". Failure mode stays safe: a deferral is a
local predicate on every device that has the vault; nothing at Google moves.
Recommendation: yes. Decision is Nick's; queued.

## The ruling

**Nick, 2026-09-02: YES.** Later deferrals sync across devices inside the
encrypted vault.

What that costs, stated plainly: a Gmail thread id now leaves the machine. It
leaves as ciphertext, under a key the service never holds, and it is the only
Gmail id in the whole protocol. The letter of MARU-ACCOUNT.md §1 moves from
"no ids reach the service" to "**no ids the service can read**"; the promise
the constraint was written to make is unchanged, and the spec now says so at
the point of the change rather than in a ticket nobody rereads.

What it does not cost: the failure mode. P21 chose local-only because a
label-based snooze fails UNSAFE — it removes INBOX at Google and needs a
network write at wake time that only happens if a particular machine runs.
None of that changes. A deferral is still `wake_at > now`, a local predicate
evaluated when the query runs, on every device that has the vault. Nothing in
this lane asks any device to act at a moment in time, and nothing in it reaches
Google. A device that never runs simply never hides the mail.

## Build log — 2026-09-02

Four commits on `lane/a9`, one per part.

**Spec** — `docs/spec/MARU-ACCOUNT.md` §1, §4, §6. The `deferrals` array, the
merge rule, the apply rule, and the amended constraint wording.

**Code.**

- `src/core/service/vault-port.ts` — `VaultDeferral`, and `listDeferrals` /
  `applyDeferrals` on `VaultLocal`. Both optional, like the two hooks already
  there, so a partial port stays valid and simply syncs no deferrals.
- `src/core/account/vault.ts` — `mergeDeferrals` implements §6. `buildVault`
  includes this device's live rows and tombstones. `applyVault` re-runs the
  merge against this device's own rows before writing anything.
- `src/core/account/sync.ts` — `carryRemoteCredentials` became `carryRemote`
  and now folds the last remote document's deferrals into a clean push.
  Without that half, two signed-in devices erase each other's Later list on
  every push that does not 409.
- `src/core/store/db.ts` — migration **7**, `thread_defer_cleared`.
  `clearDeferral` writes a tombstone for each row it actually removes and
  returns the count. `sweepDeferrals` prunes tombstones at 30 days, on the
  same lazy sweep that wakes deferrals — no new timer.
- `src/core/service/real.ts`, `demo.ts` — the port, over `thread_defer` and
  over two in-memory maps respectively.
- New `MailEvent` `deferralsChanged`, and `schedulesPush()` in
  `account-store.ts` consumes it.

**Tests** — `tests/later-sync.test.ts`, 28 cases. `tests/later.test.ts` passes
unchanged. `tests/agents.test.ts` migration count 6 → 7.

**Copy** — `LATER_DISCLOSURE`, one constant, four consumers.

Gates: `npm run typecheck && npm test && npm run build` — 755 passed, 3
skipped, 44 files; build clean.

## Three decisions inside the build, worth reading

**1. The payload carries a stamp, and the ticket's shape did not.** The brief
said `[{ threadId, until, accountEmail }]`. A live entry also carries `setAt`,
and it is load-bearing rather than decoration.

The rule "a tombstone beats an older `until`" needs something to compare the
clear against. Compare `clearedAt` to `until` and this sequence breaks: saved
for Monday on the Mac, brought back by hand on Sunday from the phone. The
tombstone's Sunday is *earlier* than the Monday it cancels, so the stale
deferral wins, and the thread the person deliberately brought back hides
itself again with nothing on screen to explain it. Comparing `clearedAt` to
`setAt` asks the only question that settles it: which act happened later.
Two live entries still compare by `until`, exactly as the brief says, because
a deferral names an absolute time and the later time is the later decision.
Both orders are tested.

**2. The tombstone needed its own table.** `thread_defer` is deleted from by
`sweepDeferrals`, `deleteThreads` and `clearDeferral`; a tombstone living
there would have to survive all three. `thread_defer_cleared` is migration 6's
argument applied a second time — a separate table cannot be clobbered by a
method that does not know it exists.

**3. `deferralsChanged` is its own event.** Folding it into `threadsChanged`
would have pushed the vault on every poll tick, because that event fires on
every sync pass. It is emitted only when a row actually moved, which is what
keeps the engine's reply-wake quiet: that path offers every newly-arrived
thread to `clearDeferral` and clears almost none of them.

## The property that must not regress

**Later touches no Gmail method.** It is now asserted rather than described:
the two-device round trip in `tests/later-sync.test.ts` runs against a
`MailGmailClient` whose every method throws. A Gmail call added anywhere under
`defer`, the vault port, or the store fails that test by name.
`docs/security/google-oauth-method-scope-matrix.md` is untouched, and so is
the open verification submission.

## Not built, on purpose

- **No server-side anything.** The service still stores one opaque blob. No
  deferral endpoint, no wake relay, no push on a deferral. Adding one would
  re-introduce the timer P21 refused.
- **No cross-device wake notification.** A deferral coming due is not an
  event anywhere; it is a predicate turning false. That is the whole design.
- **No migration of existing local deferrals into someone else's vault.** They
  travel on the next push like any other local state, because they already are
  local state.

## Lane 2 — cleanup, 2026-09-01

Twelve items, applied in full. Behaviour is unchanged except where an item
names a change.

**Defect class.**

1. `applyVault` no longer calls `refreshAfterApply` for a deferral-only apply.
   A deferral reaches no Gmail method, and the port already emits
   `threadsChanged` for the rows it wrote. The `noGmail` round trip now counts
   the refresh through a wrapper on the real port, so the assertion fails if
   the condition ever gets `deferrals` back — verified by putting it back.
2. `Store.applyDeferralRecords` partitions live rows from tombstones and runs
   one multi-row `INSERT OR REPLACE` and one `DELETE … WHERE thread_key IN (…)`
   per side, on the file's `chunkRows`/`placeholderList` convention. A hundred
   deferrals cost four statements instead of two hundred. New test covers the
   multi-row placeholder run on both sides.

**Shape.**

3. `VaultDeferral` is `{ accountEmail, threadId, until, at }`. `setAt`,
   `clearedAt`, `deferralStamp` and every `?? 0` fallback are gone. The merge
   narrows with `!== null`, so TypeScript proves the live/live comparison.
   Spec §4 and §6 carry the unified shape; the rule is stated in §6 and §4
   links to it.
4. `toVaultDeferral` / `fromVaultDeferral` in `vault-port.ts`. Both ports use
   them and supply only their own account table. `RealMailService` reads that
   table once through a private `accountTables()` instead of calling
   `listAccounts()` in each method.
5. `defer(key, null)` emits `deferralsChanged` only when the clear reported a
   removed row — real service and demo alike.
6. `pruneDeferrals(entries, now)` is extracted. `mergeDeferrals` ends by
   calling it; `buildVault` calls it directly, and the build-time prune stays
   for the 256 KiB byte cap. The two tests that used merge-against-empty as a
   prune assertion are replaced by direct prune tests.
7. The `normalizeEmail` and `DEFERRAL_TTL_MS` pass-through re-exports are gone
   from `vault.ts`. Consumers (`crypto.ts`, `account-store.ts`, `danger.tsx`,
   `account-screen.tsx`, the tests) import from the owning module.
8. `restoredSummary` surfaces the count: "N saved-for-later restored", beside
   the accounts and sign-ins it already showed.
9. The 30-day rule is stated once, on `DEFERRAL_TTL_MS` in `defaults.ts`. The
   five other sites are one-line pointers.

**Copy.**

10. Settings keeps `LATER_DISCLOSURE` plus only the sentence that is specific
    to Settings — the inbox-count disagreement. The restated promise is gone.
11. The "site N of 4" ordinals and the 150-character note are gone from the
    picker, the thread list, Settings and DECISIONS. The rule — every Later
    surface carries the sentence verbatim, none paraphrases — is stated once,
    on the constant.
12. `settings`, `vaultDocument(patch)`, `FakeVaultLocal` and `FakeDeferralLocal`
    live in `tests/fixtures/domain.ts`. `later-sync`, `account-vault` and
    `account-sync` all use them.

Gates: `npm run typecheck && npm test && npm run build` — 756 passed, 3
skipped, 44 files; build clean.
