// The undo registry's rules, with no store and no React around them.
//
// Maru promises UNDO in two places — the send toast and the archive toast —
// and ⌘Z is the third door onto the same thing. All three ask the same two
// questions: *is there something to undo*, and *is it still recent enough to
// mean it*. Those two answers are pure functions of an entry and a clock, so
// they live here and the store below them only holds the entry.
//
// One slot, not a stack. A ten-second window is a safety net for the action
// you just took, not an edit history: a second undoable replaces the first,
// and ⌘Z twice in a row does not walk backwards through the morning.

import type { MailActionType } from '@/core/types'

/**
 * How long an action stays undoable. Longer than the 4 s the composer holds a
 * send, because the reverse path does not need the mutation to still be held —
 * an archive that has already reached Gmail is undone by sending `unarchive`.
 */
export const UNDO_WINDOW_MS = 10_000

/**
 * The sonner id every undo toast shares, so there is only ever one on screen.
 *
 * Not cosmetic. The toast's button runs *the registry's* pending undo, not a
 * closure over the action that raised it — so two undo toasts alive at once
 * would mean a button that says "Archived: Book club" quietly reversing
 * whatever was done after it. One id, one toast, one meaning.
 */
export const UNDO_TOAST_ID = 'wren-undo'

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
 * The actions that have to say out loud what they did.
 *
 * All four take the thread out of the list it was in, so there is no row left
 * to stand in for the confirmation — and each one is a move between mailboxes
 * rather than a flag on a row you can still see. Star and read/unread are not
 * here: the row is still there, wearing the change.
 *
 * A set rather than a condition at each call site, because the call sites are
 * the keyboard, the row cluster, the reading toolbar and the palette, and
 * hardcoding `archive || trash` at each of them is what left restore-from-trash
 * silent (issue 5).
 */
const ANNOUNCED_ACTIONS = new Set<MailActionType>(['archive', 'unarchive', 'trash', 'untrash'])

export function announcesItself(type: MailActionType): boolean {
  return ANNOUNCED_ACTIONS.has(type)
}

export interface Undoable {
  /**
   * Identity of the thing that was done, so a late `clear` from a mutation
   * that has since been superseded cannot wipe a newer entry.
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
   */
  run: () => void
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
 * The registry after `id` reports that it is no longer undoable — the composer
 * saying its held send has gone out, for instance.
 *
 * Clearing is by identity on purpose. The send that flushes at 4 s is often
 * *not* the newest undoable any more (the user archived something at 2 s), and
 * a blind clear there would silently take ⌘Z away from the archive.
 */
export function clearedUndoable(current: Undoable | null, id: string): Undoable | null {
  return current?.id === id ? null : current
}
