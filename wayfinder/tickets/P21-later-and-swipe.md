# P21 — Later (save for later) and the swipe gesture  `wayfinder:task`

status: DESIGNED (2026-08-31) · two lanes · lane 2 gated on a 10-second owner experiment

## The ask

Nick, 2026-08-31: "do you know spark's save for later? where you can save
something for tomorrow or the next day. there's like swipe features like that.
we should implement that + swiping features! Nice, fun little interactions :)"

## The constraint that shaped everything

**Gmail has no snooze API.** Google's own snooze is proprietary and not exposed.
So Maru must implement deferral itself, and the question is whether that state
lives at Gmail (a real label) or only here.

## THE DECISION: local-only, in its own table. And the reason is the failure mode.

Not privacy, not scope — the failure mode. Maru has no server. Google's snooze
works because Google's servers hold the timer; Maru's would be held by a laptop
that is shut on Tuesday morning.

- **Label-based fails UNSAFE.** Snooze removes INBOX at Gmail. Waking is a
  network write that only happens if this Mac runs. Laptop shut Monday to
  Friday means mail the person asked to see on Tuesday is out of the inbox on
  *every* device, past its time, with no timer anywhere that will fix it. That
  is practical data loss dressed as a feature.
- **Local-only fails SAFE.** Deferral is `wake_at > now`, evaluated when the
  query runs. Laptop shut for a week means nothing had to happen; on next
  launch the predicate is false and the thread is simply there. No catch-up, no
  backlog, no missed timer to detect.

This is also already this repo's ratified doctrine, written verbatim at
`src/core/agents/approvals.ts:172-182`: "A timer would be a persistent monitor
for a queue that is usually empty... The lazy sweep cannot be wrong at the
moment it matters."

**And the code enforces it structurally.** `Store.upsertThreads`
(db.ts:757-825) rewrites `threads.label_ids` and deletes and re-inserts
`thread_labels` wholesale on every sync pass — so any local state expressed as
a label is destroyed within one poll interval. But it names those two tables
and nothing else, so a separate table is immune. Two tables, two owners, no
precedence rule to write and no arbitration to get wrong.

**The invariant, to be written above the migration:**
`Maru never disagrees with Gmail about what a thread's labels are. It only
decides what to show you.`

## Call it LATER, not Snooze

"Snooze" is a cross-device promise in Gmail, Spark and Superhuman alike, and
this is not cross-device. The word is what turns an honest local feature into a
lie. The verb and the view are **Later**.

## The four direct answers

### Storage

**Local-only, in its own SQLite table (`thread_defer`). No Gmail label, no `users.labels.create`, no new Gmail method of any kind.**

The defence is the failure mode, not privacy or scope. Maru has no server, so a label-based snooze would remove INBOX at snooze time and need a network write at wake time that only happens if this Mac is running. Google's snooze works because Google's servers hold the timer; Maru's would be held by a laptop that is shut on Tuesday morning. Result: mail the person asked to see on Tuesday is out of the inbox on every device, indefinitely, until they happen to open Maru. That is practical data loss dressed as a feature. Local-only fails the other way and benignly: the deferral is a predicate over a stored timestamp, nothing has to run at wake time, nothing can be missed, and the worst case is that the phone showed the thread the whole time. **Label-based fails unsafe. Local-only fails safe.**

The code backs it up. `Store.upsertThreads` (db.ts:757-825) rewrites `threads.label_ids` and deletes and re-inserts `thread_labels` wholesale on every sync pass, so any local state expressed as a label is destroyed within one poll interval — but `upsertThreads` names those two tables and nothing else, so a separate table is structurally immune. Two tables, two owners, no precedence rule to write and no arbitration to get wrong.

**THE COST I AM ACCEPTING, stated plainly.** Maru's inbox count excludes deferred threads; Gmail's iOS badge includes them. Two numbers for the same mailbox, disagreeing, visibly, every day. There is no mitigation short of a sync service, and the disclosure line is the only honest answer. A second Mac running Maru also shows the thread in the inbox — deferrals live in one local SQLite file. And un-archiving a deferred thread from the phone does not cancel the deferral: acting on it elsewhere never cancels it, only a reply does. That is a one-sentence rule that can never lose mail, which is why I prefer it to a cleverer one.

**WHAT THIS DOES TO THE OPEN VERIFICATION SUBMISSION: nothing, and that is a reason to prefer it, not merely a side effect.** Local-only calls zero new Gmail methods. `docs/security/google-oauth-method-scope-matrix.md` and `google-oauth-verification-answers.md` are untouched, and the verbatim reviewer paragraph — "add or remove thread labels, and move threads to and from Trash" — stays true.

Had the answer been a label: `gmail.modify` does authorize `users.labels.create`, so the **scope** would be unchanged and no re-consent would be needed. But the matrix enumerates every method Maru calls and `users.labels.create` is not in it, the submitted paragraph does not describe creating labels, and a reviewer replaying a demo would watch a new folder appear in a real mailbox. Amending a submission in flight to add a mailbox-write method is a bad trade for a feature that does not need it. **If a label were ever the answer, it would be sequenced after the verification closes.** It is not the answer, so the question does not arise.

Forward-compatible with where this is already going: wayfinder/tickets/G2-cross-device-sync.md records the 2026-08-31 ruling that a hosted Maru account is the destination, map 4, sequenced after the Google submission. `thread_defer` is exactly the shape that syncs on that spine — a thread key and two timestamps, no message content, no tokens, no grants. Building it local-only today is the first correct half of that, not a compromise against it.

### What the phone shows

**The sentence a person would understand: "Your phone still shows it in your inbox — Later only tidies it away on this Mac."**

Concretely, for a thread saved for tomorrow 09:00: Gmail on iOS shows it in the inbox, unread, in its normal position, because INBOX was never removed and Gmail was never told anything. Gmail's iOS badge counts it and Maru's sidebar badge does not. A push notification for a reply fires on the phone, outside Maru's reach. Gmail on the web shows it. A second Mac running Maru shows it.

**Is that a real feature or a lie? It is a real feature, and the name is what decides.** The value is not "this thread is hidden from the world", it is "this thread is out of the surface I triage in". The Mac is where triage happens; the phone is a glance surface, not a place anyone processes an inbox. Removing something from the list you are working *is* the job. And the honest comparison is not against a perfect cross-device snooze — it is against today, where the only way to get something out of the inbox is to archive it, which loses it properly.

It becomes a lie the moment it is called **Snooze**, because that word is a cross-device promise in Gmail, Spark and Superhuman alike. So the verb and the view are **Later**, and one sentence rides permanently with the feature:

> **"Later is on this Mac. Gmail on your phone still shows these in your inbox."**

**Where the UI must say it — three places, all permanent, none dismissible:**
1. The footer line of the time picker, so it is at the point of the action every single time.
2. The Later view's header subtitle, under the word "Later".
3. Settings, beside the Later controls.

**Where it must NOT go:** the confirmation toast. That fires many times a day, and a permanent caveat on a frequent toast is read as chrome inside a week. The toast says what Maru will do — `Back tomorrow, 9:00` — which is a true statement about Maru and the thing you actually want to verify. And not a first-run tip: dismissible means misremembered six months later, which is precisely how a limitation turns into a broken promise.

This is the same move the search empty state already makes with `SEARCH_WINDOW_DAYS` (thread-list.tsx:418) — naming the boundary turns a limitation into information.

### Is the swipe even reachable

**Reachable in principle. Not proven in this repo, and I will not pretend otherwise. There is one hard platform limit that shapes the whole design.**

**WHAT I VERIFIED IN THE REPO (facts, not claims):**
- **Maru has never handled a gesture.** `rg` across all of `src/` for `onWheel`, `addEventListener('wheel'`, `deltaX`, `pointerdown`, `pointermove`, `setPointerCapture`, `touchstart` returns nothing. The only near-hits are two `window.addEventListener('n', ...)` lines in src/lib/sound.ts. Zero prior art. Every number below is a proposal, not a measurement. (Proposal 3 reported this correctly; proposals 1 and 2 asserted WebKit behaviour as if it were repo evidence.)
- **Nothing upstream competes for the gesture.** `src-tauri/src/lib.rs` never calls `with_back_forward_navigation_gestures`, and wry's default is false. The macOS two-finger back/forward page swipe is therefore not enabled and cannot eat the event.
- **The horizontal axis is free to claim.** The list's scroll container is `overflow-x-hidden overflow-y-auto` (thread-list.tsx:400), so horizontal delta has nowhere else to go.
- **The target-resolution hook already exists.** `data-thread-key` is on every row (thread-row.tsx:87) and every search result (thread-list.tsx:437).
- **The one that decides the design: WebKit exposes no gesture phase to JavaScript.** There is no `phase` or `momentumPhase` on a web `WheelEvent` in WebKit or Chromium. Apple Mail's trackpad swipe is a native `NSEvent` gesture reading exactly those fields, so AppKit knows when your fingers lift. The web does not. After you lift, macOS keeps sending decaying momentum `wheel` events that are indistinguishable from real finger movement. **A WKWebView cannot faithfully reproduce Apple Mail's swipe.** Any implementation is a heuristic and must be labelled as one in the code.

**THE ONE-LINE EXPERIMENT THAT SETTLES IT.** Run `npm run tauri dev`, open the devtools console, paste:

`window.addEventListener('wheel', e => console.log(e.deltaX.toFixed(1), e.deltaY.toFixed(1), e.deltaMode, Math.round(performance.now())), {passive: true})`

Then do three things on the trackpad over a thread row: a slow deliberate two-finger swipe right; a fast flick right; and a normal vertical scroll. Read three answers off the log. (1) Does non-zero `deltaX` arrive at all? (2) Is `deltaMode` 0 — pixel deltas, i.e. a trackpad — as opposed to 1? (3) After the fingers lift, how many events keep arriving and how fast does `|deltaX|` decay? Answer 3 is the one that sets the threshold and tells you whether the momentum heuristic is viable. If `deltaX` never arrives, the gesture is dead and nothing else in the plan changes.

**THE HEURISTIC, stated as a heuristic.** Gesture ends after 120 ms with no wheel event (momentum arrives at roughly 60 Hz, so 120 ms clears the inter-event gap and nobody perceives it). Commit is decided on the offset at settle, not on peak, so push-to-100-then-pull-back-to-20-then-lift correctly cancels. Deltas with `|deltaX| < 4` keep the idle timer alive but are excluded from the offset, because momentum decays through small values and a finger does not.

**TWO GUARDS, both cheap, both non-negotiable.** Reject `deltaMode !== 0` — trackpads emit pixel deltas, classic tilt-wheel mice emit line deltas, and without this check a tilt wheel defers mail by accident. And `platformOS === 'mac'` only (src/lib/env.ts:126) — Windows precision touchpads also report pixel deltas, but horizontal wheel there is a scroll convention, so shipping it would break horizontal scrolling to gain a gesture nobody expects.

**THE FALLBACK DOES NOT DEPEND ON THE ANSWER, AND IT IS NOT A FALLBACK — IT IS THE FEATURE.** Later is complete with three doors that need no trackpad: `h` (printed) / `b` (alias) opening the picker with `1`-`5` on the presets; the hover-cluster button; and the command palette, which is the genuinely accessible route since the cluster is `aria-hidden` and `tabIndex={-1}` by design (thread-row.tsx:274-285). Bulk Later is on the strip and on `h` with threads checked. **Every single thing the gesture does has a keyboard path, and the keyboard path is strictly more capable** — the gesture takes the default time, the keyboard chooses.

So the gesture ships behind a flag, after the experiment, and if the momentum heuristic misfires on Nick's actual trackpad it is deleted in one commit and the feature is untouched. It is delight on top of a complete feature, built so it can be dropped without taking anything with it. **A plain wheel mouse gets no swipe at all, and that is fine and stated, not a defect to be worked around.**

### Ship order

**Two lanes. Later first, whole and shippable on its own. The gesture second, gated on one experiment. Do not build them together.**

The owner asked for both, but they are not equally cheap or equally safe, and they are separable by construction: the gesture is a third door onto a feature that is already complete without it.

**LANE 1 — Later. Ship this first, alone.**
Everything in the spec except the four gesture items. Migration 6, `Thread.deferredUntil` / `wokeAt`, `MailView.later`, the `viewClause` predicate, the sort-key change, the `start()` and `useNow` sweeps, the `applyHistory` wake-on-reply, the `resyncWindow` guard, `MailService.defer` on both implementations, the picker, `h`/`b`, the cluster button, the palette entry, the sidebar row with ⌘5, `bulkDefer`, the undo wiring, and the three permanent disclosure sites.

Why first: every acceptance criterion is met by this lane alone. It survives the app being closed for a week (the predicate cannot be missed). It survives action from another client (`applyHistory` already computes the set, and the Later view's `INBOX ∧ ¬TRASH` definition drops an archived thread for free). It fits the existing action and undo machinery rather than growing a parallel one — `HeldMutations`, `registerUndo`, one slot, `nextAfterRemoval`, all reused unchanged. It has a keyboard path for everything. It touches no Gmail method, so the open verification submission is untouched and there is no sequencing question at all. And it is deterministic: no heuristics, no platform unknowns, no hardware needed to validate it.

Riskiest parts of lane 1, in order, so review time goes where it belongs: the `MAX(t.last_message_at, COALESCE(d.woke_at, 0))` sort key applied identically in SQL, in `applyListPrefs`, and in `buildRows`/`dateGroup` — with `opts.before` moved to the same expression (mitigated by the verified fact that nothing passes `before` today, so it is a dormant path); then the DST-safe calendar arithmetic for the presets, which needs a test that runs across a transition rather than a visual check; then `thread_defer` reaching `deleteAccount` and `deleteThreads`, both one-word additions and both data-leak bugs if missed.

**GATE BETWEEN THE LANES: the console experiment.** Ten seconds of Nick's trackpad in a `tauri dev` build, before any gesture code is written. Three answers: does `deltaX` arrive, is `deltaMode` 0, how does `|deltaX|` decay after the fingers lift. The third sets the 64 px threshold or kills it.

**LANE 2 — the gesture.** The `wheel` listener on the scroll container, the rAF transform, the `data-wren-swipe` CSS crossfade, `wren-row-out-right`, and the `?swipe=` capture flag. Behind a flag until it has been felt on real hardware. If the momentum heuristic misfires, delete it — one commit, nothing else changes.

**Why not the reverse order, since the gesture is what the owner asked for by name.** Because a swipe that commits an action the person did not mean, in a mail client, on four real accounts, is worse than no swipe — and until the experiment runs there is no way to know whether that happens. Building Later first also means the gesture, when it arrives, is a two-hundred-line addition to a proven feature rather than the load-bearing member of an unproven one. It is the difference between the gesture being delight and the gesture being a liability.

**One open owner decision that should be made rather than discovered.** Waking a thread when a reply arrives is opinionated: a thread deferred to Monday that returns on Saturday because someone replied will occasionally read as a bug. I judge it clearly the lesser evil against hiding a live conversation you are party to, and it is one line in a set `applyHistory` already holds — but it is a taste call, and it belongs in wayfinder/NICK-QUEUE.md rather than in a commit message.

## The spec

- **MIGRATIONS[5]** in src/core/store/db.ts — the 6th entry, appended after the imagePolicy migration at line 266. `SCHEMA_VERSION` becomes 6. Idempotent, unlike entry 5. Statement: `CREATE TABLE IF NOT EXISTS thread_defer (thread_key TEXT PRIMARY KEY, account_id TEXT NOT NULL, wake_at INTEGER NOT NULL, set_at INTEGER NOT NULL, woke_at INTEGER); CREATE INDEX IF NOT EXISTS idx_thread_defer_wake ON thread_defer (wake_at); CREATE INDEX IF NOT EXISTS idx_thread_defer_account ON thread_defer (account_id);` No ALTER on any existing table, so the encryption sweep and `ENCRYPTED_THREAD_COLUMNS` (db.ts:336) are untouched. No keyring encryption: `thread_key` is already plaintext as `threads.key`, and two timestamps are not message content.

- **The invariant, written as a comment block above that migration, because it is the whole design:** `Maru never disagrees with Gmail about what a thread's labels are. It only decides what to show you.` A deferred thread still carries INBOX in thread_labels; archiving it later still removes INBOX correctly; there is no conflict to arbitrate. The enforcement is structural, not a rule anyone has to remember: `upsertThreads` (db.ts:757-825) names `threads` and `thread_labels` and cannot clobber a table it does not know exists. A column on `threads` would NOT have this property — `upsertThreads` rewrites twelve named columns from a `Thread`, so a stale in-memory Thread round-tripping through a sync pass would erase it.

- **src/core/types.ts — `Thread` gains `deferredUntil?: number` and `wokeAt?: number`.** A contract change; the file header (line 4) says to note it in the lane report. Both are hydrated by a LEFT JOIN in the store's read path and NEVER appear in `upsertThreads`' twelve-column list. `deferredUntil` is what `threadMatchesView` and the Later view's rows read; `wokeAt` is the sort key that stops a woken thread returning buried.

- **src/core/types.ts — `MailView` gains `| { kind: 'later' }`.** NOT a fifth `UnifiedFolder`: `FolderSpec.label` is documented at defaults.ts:27 as "The Gmail system label this folder *is*", and Later is not one — putting a synthetic string there is what forces proposal 3's `MARU_` namespace hack into `upsertThreads`. The ripple is small and enumerable because `viewLabel` has exactly two callers: `viewKey` (ui-store.ts:51), `viewLabel` and `threadMatchesView` (defaults.ts:66,75), `Store.viewClause` (db.ts:853), the list header `title` (thread-list.tsx:252-257), and `emptyCopyFor`/`useInboxZeroTier` (features/list/inbox-zero.ts).

- **src/core/defaults.ts — `viewLabel` stays total and returns `'INBOX'` for `{ kind: 'later' }`.** This is a true statement, not a fiction: a deferred thread is an inbox thread that Maru declines to list. Nothing becomes partial, no caller learns to handle null, and the two SQL/memory twins keep reading the label rule from one place.

- **src/core/defaults.ts — `threadMatchesView(thread, view, now)` takes a third parameter.** After the existing label and TRASH checks: `if (view.kind === 'later') return thread.deferredUntil !== undefined && thread.deferredUntil > now; if (label === 'INBOX' && thread.deferredUntil !== undefined && thread.deferredUntil > now) return false;` Without this the optimistic updater at queries.ts:295-302 puts a deferred row straight back into the list, and the demo service (demo.ts:177-184, which filters on this predicate) never hides anything.

- **src/core/defaults.ts — `deferSortKey(thread) = Math.max(thread.lastMessageAt, thread.wokeAt ?? 0)`,** exported beside `threadMatchesView` as the in-memory twin of the SQL expression, so `applyListPrefs` and `buildRows` cannot drift from `listThreads`.

- **src/core/defaults.ts — presets and the cap.** `MAX_DEFER_DAYS = 30`. `EVENING_HOUR = 18`, `MORNING_HOUR = 9`. `deferPresets(now)` returns, computed with local calendar arithmetic and never `+86400000` (or "tomorrow 9:00" lands at 08:00 twice a year and "this weekend" is worse): `This evening` = today 18:00, offered only before 16:00; `Tomorrow` = 09:00; `This weekend` = Saturday 09:00, offered Mon-Thu only; `Next week` = Monday 09:00; `Pick a date…` capped at +30 days.

- **Why 30 days and why there is no "Someday":** `WINDOW_QUERY` is `newer_than:90d` (engine.ts:42) and `resyncWindow` (engine.ts:319-330) *deletes* local threads absent from that window. A thread deferred six months out whose last message is 89 days old would be evicted with its defer row and the deferral would evaporate silently. Every peer offers Someday; Maru cannot offer it honestly, so it does not.

- **src/core/store/db.ts — `viewClause` (line 853) gains two branches.** For the inbox: `if (label === 'INBOX' && view.kind !== 'later') { params.push(now); where += ` AND t.key NOT IN (SELECT thread_key FROM thread_defer WHERE wake_at > $${params.length})` }`. For the Later view: the same subquery as `IN` instead of `NOT IN`. `INBOX` only — a deferred thread that is also starred still appears in Starred, because deferral is about the inbox, not the mailbox. One clause covers the unified inbox and every per-account inbox, and `countUnread` (db.ts:881) gets the sidebar badge correct for free because it shares `viewClause`.

- **src/core/store/db.ts — `listThreads`, `getThread` and `allThreads` gain `LEFT JOIN thread_defer d ON d.thread_key = t.key` and select `d.wake_at AS defer_wake_at, d.woke_at AS defer_woke_at`.** `ThreadRow` and `rowToThread` (db.ts:296-309, 384-399) map them to `deferredUntil` / `wokeAt`. `allThreads` matters because it feeds the search index.

- **src/core/store/db.ts — `listThreads` ORDER BY (line 876) becomes `MAX(t.last_message_at, COALESCE(d.woke_at, 0)) DESC, t.key ASC`,** and the `opts.before` cursor at line 871-874 must compare against the *same* expression, not `t.last_message_at`. Without the ORDER BY change a thread from three weeks ago deferred to tomorrow returns at list position ~90 and is never seen — the feature would have eaten the mail. Verified mitigating fact: nothing in src/ passes `opts.before` today, so this is a correctness fix on a dormant paging path, not a live break. The Later view orders `d.wake_at ASC` instead — next to return, first.

- **src/core/store/db.ts — four new methods.** `setDeferral(threadKey, accountId, wakeAt, now)` (INSERT OR REPLACE, clears `woke_at`); `clearDeferral(keys: string[])`; `sweepDeferrals(now)` returning `{ woken: number }` — one `UPDATE thread_defer SET woke_at = $now WHERE wake_at <= $now AND woke_at IS NULL` plus one `DELETE FROM thread_defer WHERE woke_at IS NOT NULL AND woke_at <= $now - 86400000` (the 24h garbage collection that ends the "back at the top" treatment); `deferredKeys()` for the resync guard.

- **src/core/store/db.ts — `thread_defer` joins the table loop in `deleteAccount` (line 747) and the delete set in `deleteThreads` (lines 837-845).** Omitting the first leaves rows behind after a "delete my data", against the promise the surrounding `keyring.destroy` is careful to keep; omitting the second orphans a row when a thread falls out of the 90-day window.

- **src/core/sync/engine.ts — `applyHistory` clears the deferral when a reply lands.** The set is already computed at lines 260-265: `newMailThreads` is exactly the threads that gained a message carrying INBOX **and** UNREAD, which excludes the person's own sent replies by construction. One line after `storeThreads` at line 279: `await this.store.clearDeferral([...newMailThreads.keys()].map(id => threadKey(this.accountId, id)))`. You deferred it because "not now"; a new inbound message means the world changed, and hiding a live conversation you are party to is worse than the mild surprise of it returning early.

- **src/core/sync/engine.ts — `resyncWindow` (line 325) excludes threads holding a live defer row from `removeThreads`.** `const deferred = new Set(await this.store.deferredKeys()); await this.removeThreads(localKeys.filter(k => !remoteKeys.has(k) && !deferred.has(k)))`. Belt and braces with the 30-day cap: a thread whose last message is already 60 days old, deferred 30 days out, would otherwise be evicted at day 90 and the deferral lost. This is a *retention* divergence from Gmail, not a label divergence — the invariant is intact.

- **src/core/service/real.ts — `start()` (line 149) runs one `await this.store.sweepDeferrals(Date.now())` before the account loop.** This is the launch pass, and it must be here rather than only in React: a laptop closed for a week has `wake_at` a week in the past, and if the first list render happens before the sweep stamps `woke_at`, the thread renders at position 90 and then visibly jumps to the top. It is one indexed UPDATE, not the `allThreads()` mistake this method's own comment block records.

- **src/core/service/real.ts — `performAction` (line 474) clears the defer row whenever `labelDelta(action.type).remove` includes `'INBOX'`** (archive, trash). Otherwise an archived-then-unarchived thread mysteriously hides. Do it after the successful Gmail call, not in the optimistic block, and re-set it in the catch alongside the existing `upsertThreads([before])` rollback.

- **src/core/service/real.ts — `send()` clears the defer row for `draft.reply?.threadKey`.** Replying is the loudest possible statement that you are done deferring.

- **src/core/types.ts — `MailService` gains `defer(threadKey: string, wakeAt: number | null): Promise<void>`,** a sibling seam beside `modifyLabels` (types.ts:268). Deliberately NOT a new `MailActionType`: actions.ts exists so "an optimistic local update and a Gmail modify agree exactly" (line 1-2), and `labelDelta('later')` returning `{add:[],remove:[]}` would assert "this action changes no labels" when the truth is "this is not a label action"; it would also break `reverseAction`'s stated involution property (actions.ts:76-77) and force a branch in `performAction` that skips the network. `null` un-defers. Both implementations satisfy it — real.ts and demo.ts, and demo mode is what every screenshot capture and the website run on.

- **src/features/mail/queries.ts — `useDefer()`,** modelled on `usePerformAction`'s `onMutate` (lines 279-317) but patching `deferredUntil` and filtering through `threadMatchesView(t, view, Date.now())`. No `playSound` — deferring is not a completion (sound-policy reserves `complete` for archive and trash). **And `useWakeSweep()`**, which rides the existing 60-second `useNow` interval (src/lib/use-now.ts) rather than adding a timer: on each tick call `store.sweepDeferrals(now)` and invalidate `['threads']` and `['unread']` only when it reports `woken > 0`. Frozen under `?screenshot=1` for free, because `useNow` is.

- **src/features/list/thread-list.tsx — `buildRows` (line 64) groups on `dateGroup(deferSortKey(thread), now)` instead of `thread.lastMessageAt`,** and `applyListPrefs` (src/features/list/list-prefs.ts:43) sorts on the same helper. A woken thread lands at the top of **Today** with its timestamp column still honestly reading "Mon". That grouping IS the wake cue: no toast (threads wake in batches at 09:00 when nobody is looking, and a toast for something you scheduled yourself is nagging) and no row decoration (DIRECTION §10.2). **No synthetic "Back" group** — `dateGroup` returns a closed set, and a group header that appears and expires on a 24-hour timer is a second thing to reason about for a signal position already delivers.

- **src/features/list/thread-list.tsx — `onDefer(thread, wakeAt)` beside `onAction` (line 187),** reusing the archive machinery verbatim: `nextAfterRemoval` advance when the deferred thread is selected; `held.hold(thread.key, ..., TICK_MS)` so the row survives its own exit animation and the flushAll-on-unmount guarantee holds; `useUi.getState().registerUndo({ id: `later:${thread.key}`, label, run })` with the same two halves as archive at lines 226-237 — inside the tick, `cancel()` and nothing ever left; after it flushes, `defer(key, null)`. **Nothing in src/lib/undo.ts changes**; it is one slot and Later takes it like any other action.

- **Copy, exact strings.** Toast title states what Maru will do, which is the honest and the useful thing: `Back tomorrow, 9:00` / `Back this evening, 18:00` / `Back Monday, 9:00`, with `thread.subject || '(no subject)'` as the description — the same `showUndoToast(label, description)` shape archive uses at thread-list.tsx:242. Bulk: `3 threads saved for later`. Keymap label: `Save for later`. Sidebar row: `Later`. Later view empty state: title `Nothing waiting`, subtitle `Threads you save for later come back here, then to your inbox.` (DIRECTION §2 Family 2 requires the one-line why).

- **The disclosure, and where it must live.** One sentence, verbatim: **"Later is on this Mac. Gmail on your phone still shows these in your inbox."** It appears permanently in three places — the footer line of the time picker, the Later view's header subtitle, and Settings. Not in the toast: that fires many times a day and a permanent caveat there is nagging and gets read as chrome within a week. Not a first-run tip, not a tooltip, not anything dismissible. It is at the point of choice, every time.

- **src/features/keyboard/keymap.ts — one row, printed key `H`, unprinted alias `b`.** `{ id: 'later', keys: ['H'], label: 'Save for later', group: 'Triage', key: 'h', aliases: ['b'] }`. `h` because AMIE-STUDY.md:406 already wrote `Snooze H` into this repo's own bulk-bar spec, so `b` would create a contradiction someone has to reconcile later. `b` as an alias because it is Gmail's snooze key and this file's stated doctrine is Gmail-school — using the exact precedent already written at lines 81-83 for `z`: "Gmail's muscle memory... one canonical chord, one muscle-memory alias." Both are free: taken are j k o x e # s u z c r a f / w ? and the chords. Adding the row here is the only way to add a shortcut, so the "?" sheet documents it automatically. `folders` label becomes `⌘1 … ⌘5`.

- **`h` opens the picker; the gesture commits to the default.** This is the correct division and not a consolation prize: the keyboard has digits, so `1`-`5` inside the picker means `h` `2` is two keystrokes; the gesture cannot offer a second stage (see the momentum finding) so it takes `Tomorrow, 9:00` and the toast offers **Change…** beside **Undo**. The hover-cluster button opens the picker too — a mouse has no digits and wants the menu.

- **src/features/mail/thread-actions.ts — `ThreadActionId` gains `'later'`, `ThreadActionSpec` gains `kind: 'mail' | 'later'`, and `type` becomes present only when `kind === 'mail'`.** Required because `ThreadActionSpec.type` is a `MailActionType` today (line 22) and Later is deliberately not one; the discriminator keeps one table and one order for all four surfaces and lets the compiler force each to handle it. `THREAD_ACTION_ORDER` becomes `['archive', 'later', 'trash', 'read', 'star']` — the two get-it-out-of-my-inbox verbs adjacent. Icon `calendar` (icon-glyphs.ts:34); the set has no `clock` and adding one needs an Anron path pulled from Figma, so that is a one-line follow-up swap, not a blocker.

- **src/features/list/bulk.ts — `bulkDefer(defer, visible, wakeAt)` as a sibling of `bulkAction`, not a member.** `BULK_TYPES` is typed off `MailActionType` (line 18) and `bulkAction` reverses through `reverseAction(type)` (line 69), which is total over that union and has no Later case — so routing Later through it would ship an undo that silently does nothing. `bulkDefer` mirrors the shape exactly: `checkedInView`, `nextAfterRemoval` advance, one undoable under `bulk:later` that clears the whole set, `clearChecked()`, one toast. The bulk bar (thread-list.tsx:349-373) gains a `Later` StripButton between `Archive` and `Trash`, and `h` with threads checked routes here.

- **src/features/sidebar/sidebar.tsx — one `NavRow` below the `FOLDERS.map` at line 86, not inside it.** `FOLDERS` is the Gmail-system-label table and Later is not one; a fake entry breaks `viewLabel` and `viewClause`. It carries `view={{ kind: 'later' }}`, the count of currently-deferred threads, and ⌘5. `SYSTEM_ORDER` (line 42) is untouched.

- **The gesture — ownership, because a virtualized row can unmount mid-swipe.** One `wheel` listener with `{ passive: false }` on `scrollRef.current` (thread-list.tsx:397), which never unmounts while the list is up. At gesture start it resolves the row via `event.target.closest('[data-thread-key]')` — the attribute already exists on every row (thread-row.tsx:87) and every search result — and holds that `HTMLElement` plus the key in a ref. Commit resolves the thread from `visibleRef.current` by key; absent means abort silently, no crash. Row unmount mid-momentum is harmless: writes to a detached node do nothing and the settle timer still commits.

- **The gesture — zero React in the hot path.** The offset is written to `el.style.transform` inside one `requestAnimationFrame`, with `transition: none` while tracking. The arm state is a `data-wren-swipe="armed"` attribute on the same element, driving a pure-CSS crossfade between the avatar and a pre-rendered Later chip. React learns about the gesture exactly once, at commit. This is not optimisation for its own sake: thread-row.tsx:44-49 documents that a per-row identity change made `memo(ThreadRow)` a no-op and re-rendered the whole viewport on every keystroke, and a `setState` per wheel event would do it sixty times a second.

- **The gesture — numbers, all on the 4 px grid (DIRECTION §10.1).** Dead zone 0-8 px (`--wren-row-inset-x`), nothing visible, direction lock evaluating. Arms only if `|Σdx| > 8 && |Σdx| > 2 * |Σdy|`; otherwise every delta goes to vertical scroll and the gesture never existed. Locked once, never re-evaluated. 8-64 px: row translates 1:1 minus the dead zone, avatar crossfading to the Later chip. **64 px = ARMED**, chip fully swapped — the visual and the commit point are the same fact, so nothing has to announce it. 64-96 px: rubber band `64 + (d - 64) * 0.35`, hard cap 96. Release ≥ 64 commits; release below springs home over `--wren-dur-base` `--wren-ease-out`. `overscroll-behavior-x: contain` on the scroller plus `preventDefault()` once armed, so the document never rubber-bands sideways.

- **The gesture — commit motion, no new vocabulary and no celebration.** The row continues right and out over `--wren-dur-base` `--wren-ease-in` (one new keyframe, `wren-row-out-right`, which is `wren-row-out` mirrored — the same sentence in the other direction, not an addition). It must never snap back to zero first; reversing direction on commit is the single most common way a swipe is ruined. The `h` and button paths use the existing `wren-row-out` — they have no directional premise. **No `wren-confirm-pop`**, and the reason is already written in this repo above `CheckedChip` (thread-row.tsx:231-233): "in the brand colour and with no pop — checking is an intent, not a completion." Deferring is an intent. DIRECTION §9's celebration table is unchanged.

- **The gesture — the chip is `bg-brand` / `text-primary-foreground`, in `AVATAR_CHIP` geometry.** Not a hue from src/lib/hue.ts: DIRECTION §10.2b binds the eight category hues to Gmail labels and the sender-avatar hash "and to nothing else", and archive's `hueSolid('green')` is grandfathered as "the one fixed hue in the app" (thread-row.tsx:256-258). `--primary` is the sanctioned brand accent (§10.6). The hover cluster gets `opacity-0` while `data-wren-swipe` is set, or it rides 64 px past the row's right edge into the `overflow-x-hidden` clip.

- **Reduced motion: the gesture still tracks, and this is an explicit amendment to DIRECTION §9 that Nick should sign.** §9 says "all transform and size animation is removed", read literally that removes the tracking. A transform driven 1:1 by the user's own fingers is a control's position, not an animation; removing it leaves a hidden control with no feedback, which is an accessibility regression rather than a mitigation, and WCAG 2.3.3 scopes itself to non-essential interaction animation. What degrades is only the commit choreography, and it degrades for free — the tokens file already zeroes `--wren-lift` and the scale variables to turn `wren-row-out` into a 120 ms crossfade, exactly as archive needs no JS branch today (thread-list.tsx:196-199).

- **`?screenshot=1`: the wheel listener does not bind at all** (`isScreenshot` from src/lib/env.ts:48), so captures are deterministic. To review the armed state, add `?swipe=<threadKey>:<px>` to the same capture-flag family as `?sync=` and `?images=`, behind the same `modeFlagsAllowed` gate (env.ts:40) — it writes the same `data-wren-swipe` attribute and transform the gesture would, so the capture poses the state without driving it.

- **Docs that move in the same change.** docs/DECISIONS.md — Q17 (line 129) lists snooze as out of scope for MVP; record the owner's reversal of 2026-08-31 and the local-only ruling with its reason, or the next agent reads Q17 and removes the feature. wayfinder/map.md:53 loses `snooze` from the out-of-scope line. docs/PRD.md:18 same. docs/design/UX-FRICTION-2026-08-29.md item 12 closes. docs/design/DIRECTION.md gets the reduced-motion amendment above. **No change to docs/security/google-oauth-method-scope-matrix.md — which is the point.**

- **Not offered to agents.** `defer` stays out of the MCP tool surface in v1. "An agent hid mail from you" is precisely the trust failure docs/PERMISSION-MODEL.md exists to prevent, and there is no undo affordance for a person who never saw the thread. Record the decision in wayfinder/tickets/M3-tool-surface.md and M5, where it will be read, or it gets "fixed" as a gap by a future agent.

## Explicitly NOT to be built

- **A Gmail label of any kind — `Maru/Later`, `Maru/Snoozed`, or date-bucket children.** It fails unsafe (mail hidden on every device past its wake time whenever the Mac is closed), it needs `users.labels.create` which is absent from docs/security/google-oauth-method-scope-matrix.md during an open review, and it leaves a folder in four real mailboxes that survives uninstalling Maru. Rejecting it also deletes proposals 2 and 3's orphan-sweep machinery, their label GC, and their 409-on-create race handling.

- **Proposal 3's `MARU_` reserved label namespace and the `AND label_id NOT LIKE 'MARU\_%'` exception in `upsertThreads`' DELETE (db.ts:809-813).** It creates the first place in this codebase where local and remote state coexist, in the one method whose correctness is currently trivial. A separate table gets the same result with no exception and no rule for future contributors to learn.

- **A column on `threads` instead of a separate table.** `upsertThreads` rewrites twelve named columns from a `Thread`; a stale in-memory Thread round-tripping through any sync path would silently erase the deferral.

- **A new `MailActionType`, `labelDelta('later')`, or `reverseAction` case.** actions.ts:11 is a pure function of the type with no account or time context, and `reverseAction`'s involution property (documented at lines 76-77) is what the test pins. Later is not a label action and must not claim to be one.

- **A new `MailView` kind that makes `viewLabel` partial or null-returning** (proposal 1's largest self-declared risk). `viewLabel({kind:'later'}) === 'INBOX'` is true, and the function has exactly two callers.

- **A coloured reveal panel, well, or action surface behind the swiping row.** DIRECTION refusals line 30 and §10.2 forbid it outright, and §10.2b forbids spending a category hue on it. All three proposals asked for a ruling on this; the ruling is already written and it is no.

- **A second swipe direction, and archive on a swipe.** Archive already has `e`, Backspace, Delete, the hover cluster, the palette and a celebration. Putting it on an input whose commit is a heuristic doubles the accidental-fire surface to gain a fifth door.

- **A two-stage swipe (Spark's swipe-a-little / swipe-further).** Momentum inflates travel by an unbounded amount after the fingers lift, so a multi-stage threshold is a coin toss on this input.

- **A pop, a particle burst, or a fourth row in DIRECTION §9's celebration table.** Deferring is an intent, not a completion — the repo's own sentence, above `CheckedChip`.

- **A synthetic "Back" date group.** Position under Today is already the signal; a group header that appears and expires on a 24-hour timer is a second thing to reason about.

- **Any timer, scheduler, `setInterval`, or background wake job** (proposals 2 and 3 both build one). Prohibited by standing order, contradicted by this repo's own lazy-sweep doctrine at approvals.ts:172-182, and unnecessary: `wake_at > now` cannot be wrong at the moment somebody looks.

- **Marking a woken thread UNREAD** (proposal 2). Unread is a fact about whether a human read the message. Lying about it to get attention is not available.

- **A "Someday" preset, or any deferral past 30 days.** `resyncWindow` would evict the thread and the deferral with it.

- **The name "Snooze".** In Gmail, Spark and Superhuman it is a cross-device promise. Maru's is not, and borrowing the word borrows a promise the app cannot keep. Also: iOS Gmail already has a system Snoozed folder two rows away.

- **A first-run tip, tooltip, or dismissible banner carrying the disclosure.** Dismissible means misremembered six months later.

- **Swipe on Windows, and swipe from a `deltaMode !== 0` device.** Windows precision touchpads report pixel deltas too, but horizontal wheel there is a scroll convention; and a tilt-wheel mouse emitting line deltas would defer mail by accident.

- **A `defer` MCP tool.**

## The one owner decision

**Should a reply wake a deferred thread early?** A thread deferred to Monday
that returns on Saturday because someone replied will occasionally read as a
bug. The judgement in this design is that it is clearly the lesser evil against
hiding a live conversation you are party to — and it is one line in a set
`applyHistory` already computes. But it is a taste call, so it goes to
`NICK-QUEUE.md` rather than into a commit message.
