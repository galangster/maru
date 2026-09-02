// The undo registry's rules, with no store and no React around them.
//
// Maru promises UNDO in two places — the send toast and the archive toast —
// and ⌘Z is the third door onto the same thing. All three ask the same two
// questions: *is there something to undo*, and *is it still recent enough to
// mean it*. Those two answers are pure functions of an entry and a clock, so
// they live here and the store below them only holds the entries.
//
// A bounded stack, newest first, not one slot. One slot meant two archives
// and one recoverable thread: the second registration overwrote the first,
// and the second ⌘Z answered with silence (issue 40). Depth is still a safety
// net over a triage burst rather than an edit history — see UNDO_DEPTH — and
// every entry keeps expiring on its own ten-second window, so a deeper stack
// never hands back something older than the window allows.

import type { MailActionType } from '@/core/types'

/**
 * How long an action stays undoable. Longer than the 4 s the composer holds a
 * send, because the reverse path does not need the mutation to still be held —
 * an archive that has already reached Gmail is undone by sending `unarchive`.
 */
export const UNDO_WINDOW_MS = 10_000

/**
 * How many actions ⌘Z walks back, newest first.
 *
 * Ten, and bounded on purpose. What undo is for here is the triage burst — the
 * e, e, e, e run that clears a screenful, where the mistake is noticed three
 * rows later — and ten covers that with room to spare. It is not an edit
 * history: every entry holds a closure over a mutation and over the row state
 * it means to put back, and an unbounded stack would keep all of it alive for
 * the whole session for a promise nobody makes. Depth never overrides
 * recency either — the eleventh press still has to be inside UNDO_WINDOW_MS.
 *
 * Session scoped, like everything else about what a person is looking at, and
 * dropped outright on sign-out and on a mailbox reset: an undo that survives
 * either would reverse an action against mail that is no longer there.
 */
export const UNDO_DEPTH = 10

/**
 * The id the *answers* share — "Undone", "Nothing to undo".
 *
 * One id for the answer, so a run of ⌘Z rewrites one line instead of stacking
 * a column of confirmations behind the offers.
 */
export const UNDO_TOAST_ID = 'wren-undo'

/**
 * The toast id for one entry's own offer. Per entry, not shared.
 *
 * The shared id used to be load-bearing: the button ran *the registry's*
 * pending undo rather than the action that raised it, so two offers alive at
 * once would have meant a toast reading "Archived: Book club" quietly
 * reversing whatever was done after it. Entries are identified now and each
 * button runs its own, which is what lets the first archive's Undo stay on
 * screen for its own four seconds instead of being withdrawn by the second
 * archive (issue 40).
 */
export function undoToastId(entryId: string): string {
  return `${UNDO_TOAST_ID}:${entryId}`
}

/** What ⌘Z says with nothing live to undo. The silence was the bug (issue 40). */
export const NOTHING_TO_UNDO = 'Nothing to undo'

/** Past tense, because it is what the confirmation says happened. */
export const UNDO_LABELS: Record<MailActionType, string> = {
  archive: 'Archived',
  unarchive: 'Moved to Inbox',
  // Restoring puts INBOX back, so it says where the thread went rather than
  // where it came from — the mirror of "Moved to trash", which is the whole
  // point of the confirmation (issue 5).
  untrash: 'Moved to Inbox',
  trash: 'Moved to trash',
  star: 'Starred',
  unstar: 'Unstarred',
  markRead: 'Marked read',
  markUnread: 'Marked unread',
}

/**
 * The actions that take the thread out of the list it was in.
 *
 * All four are a move between mailboxes rather than a flag on a row you can
 * still see. Star and read/unread are not here: the row is still there,
 * wearing the change.
 *
 * Two rules read this one set, because they are the same question asked twice.
 * The row is gone, so the selection has to advance to the next one; and the row
 * is gone, so there is nothing left to stand in for the confirmation and the
 * action has to say out loud what it did.
 *
 * A set rather than a condition at each call site, because the call sites are
 * the keyboard, the row cluster, the reading toolbar, the bulk bar and the
 * palette, and hardcoding `archive || trash` at each of them is what left
 * restore-from-trash silent (issue 5).
 */
export const LEAVES_THE_LIST: ReadonlySet<MailActionType> = new Set<MailActionType>([
  'archive',
  'unarchive',
  'trash',
  'untrash',
])

export function announcesItself(type: MailActionType): boolean {
  return LEAVES_THE_LIST.has(type)
}

export interface Undoable {
  /**
   * Identity of the thing that was done.
   *
   * Three rules turn on it, and none of them can use position. A late `clear`
   * from a mutation that has since been superseded must withdraw its own entry
   * and no other; a toast's Undo button must reverse the action that raised
   * that toast even when three newer ones sit above it; and re-registering the
   * same id replaces rather than duplicates.
   */
  id: string
  /** What the confirmation calls it: "Archived", "Send". */
  label: string
  /** `Date.now()` at registration. */
  at: number
  /**
   * Put it back. Either cancels a mutation still being held, or sends the
   * reverse action — the caller decides which, because only the caller knows
   * whether its hold is still live.
   *
   * Captured at registration, so an entry stays correct however the threads it
   * names have changed since: what it replays is the reversal that was true
   * when the action was taken.
   */
  run: () => void
}

/** The stack, newest first. Empty means there is nothing to undo. */
export type UndoStack = readonly Undoable[]

/**
 * The stack after `entry` is registered.
 *
 * Newest first, capped at `depth` — the oldest falls off the bottom, silently,
 * because an entry that far back is past its window anyway.
 *
 * An id the stack already holds is REPLACED rather than added beside. Identity
 * is what the toast button and a late `clear` navigate by, so two entries
 * under one name would make both of them ambiguous: a second archive of the
 * same thread is one offer to undo, not two.
 */
export function pushUndoable(
  stack: UndoStack,
  entry: Undoable,
  depth: number = UNDO_DEPTH,
): UndoStack {
  return [entry, ...stack.filter((held) => held.id !== entry.id)].slice(0, depth)
}

/**
 * The entry a ⌘Z at `now` should run, or null.
 *
 * A negative age is treated as expired rather than as fresh: a clock that has
 * gone backwards (a system time change, a suspended laptop) must not hand back
 * an entry the user has long since forgotten about.
 */
export function liveUndoable(
  entry: Undoable | null,
  now: number,
  windowMs: number = UNDO_WINDOW_MS,
): Undoable | null {
  if (!entry) return null
  const age = now - entry.at
  return age >= 0 && age <= windowMs ? entry : null
}

/**
 * The newest entry still inside its window — what ⌘Z runs, or null.
 *
 * It scans rather than reading the top slot alone. On a well-behaved clock the
 * two are the same answer, since anything under an expired entry is older
 * still; on one that has jumped forward, a future-stamped entry is skipped by
 * `liveUndoable` and the scan finds the newest genuinely live one underneath
 * it instead of reporting an empty stack.
 */
export function newestUndoable(
  stack: UndoStack,
  now: number,
  windowMs: number = UNDO_WINDOW_MS,
): Undoable | null {
  for (const entry of stack) {
    const live = liveUndoable(entry, now, windowMs)
    if (live) return live
  }
  return null
}

/**
 * One named entry, if it is still live — the toast button's question.
 *
 * By identity and never by position: the toast that offers "Archived: Book
 * club" has to reverse that archive, whatever has been done since. Its window
 * is the same as ⌘Z's, so a button left on screen past ten seconds answers the
 * same way the keyboard does rather than reaching back further.
 */
export function findUndoable(
  stack: UndoStack,
  id: string,
  now: number,
  windowMs: number = UNDO_WINDOW_MS,
): Undoable | null {
  return liveUndoable(stack.find((entry) => entry.id === id) ?? null, now, windowMs)
}

/**
 * The stack after `id` reports that it is no longer undoable — the composer
 * saying its held send has gone out, for instance — or after it has been run.
 *
 * Removal is by identity on purpose. The send that flushes at 4 s is often
 * *not* the newest undoable any more (the user archived something at 2 s), and
 * a blind pop there would silently take ⌘Z away from the archive.
 *
 * An id the stack does not hold gives the same array back, so a late clear
 * from a spent entry costs no subscriber a re-render.
 */
export function withoutUndoable(stack: UndoStack, id: string): UndoStack {
  return stack.some((entry) => entry.id === id)
    ? stack.filter((entry) => entry.id !== id)
    : stack
}
