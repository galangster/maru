// What the phone's triage verbs MEAN for one conversation.
//
// The phone used to send `archive` from every list it drew. In the inbox that
// is right; in Sent it removes an INBOX label the conversation does not carry,
// and in Trash it removes one the trash flag outranks — so both reported
// "Archived", offered an Undo, and changed nothing anywhere (issue 48). Saving
// for later was the same shape of wrong: `threadMatchesView` says deferral is
// about the INBOX and nothing else, so a deferred conversation that is not in
// the inbox never appears in Later and never comes back from it.
//
// A confirmation for an action that did not happen is worse than no action, so
// the verb is resolved from the conversation rather than assumed from the
// surface, and a verb that would do nothing is not offered at all.
//
// Resolved from the CONVERSATION and not from the mailbox on screen, because
// the two disagree: Sent holds conversations that are also in the inbox — a
// thread you replied to carries SENT and INBOX at once — and archiving those
// is a real action with a real effect. A rule written against the view would
// have to refuse them along with the rest.
//
// Pure, and tested as data in tests/mobile-state.test.ts.

import type { IconName } from '@/components/ui/icon'
import type { MailActionType, Thread } from '@/core/types'

/**
 * The two ways a conversation leaves the list it is in, on the phone.
 *
 * `untrash` is the desktop's own action type, with its own reverse and its own
 * past-tense label ("Moved to Inbox") already in `UNDO_LABELS` — so routing
 * Trash's right swipe through it costs nothing and the confirmation, the undo
 * and the Gmail call all come out right without a phone-only branch anywhere.
 */
export type RemoveAction = Extract<MailActionType, 'archive' | 'untrash'>

/** Which of the three triage verbs mean anything for a conversation. */
export interface MobileThreadActions {
  /** How this conversation is put away, or `null` where it cannot be. */
  remove: RemoveAction | null
  /** Whether saving it for later would actually save it for later. */
  defer: boolean
  /** Whether moving it to the trash would move it anywhere. */
  trash: boolean
}

/** Nothing is offered: an empty batch, and the shape every field falls back to. */
const NOTHING: MobileThreadActions = { remove: null, defer: false, trash: false }

/**
 * What the three verbs do to this conversation.
 *
 * Trash first, exactly as `FOLDER_PRECEDENCE` orders it: a trashed thread
 * lives in the trash whatever else it is labelled, so putting it away means
 * restoring it and there is nothing to defer — it is not in the inbox to be
 * taken out of.
 */
export function threadActions(thread: Thread): MobileThreadActions {
  const trashed = thread.labelIds.includes('TRASH')
  const inboxed = !trashed && thread.labelIds.includes('INBOX')
  return {
    remove: trashed ? 'untrash' : inboxed ? 'archive' : null,
    defer: inboxed,
    trash: !trashed,
  }
}

/**
 * What a whole batch will accept — the intersection, never the majority.
 *
 * One batch is one action, one confirmation and one undo (bulk.ts), so a verb
 * is offered only when it is the same verb for every conversation checked. A
 * mixed selection that ran `archive` over the ones it fits and `untrash` over
 * the rest would be two batches wearing one toast, which is the shape of the
 * defect this file exists to remove.
 */
export function batchActions(threads: readonly Thread[]): MobileThreadActions {
  if (threads.length === 0) return NOTHING
  const each = threads.map(threadActions)
  const remove = each[0].remove
  return {
    remove: each.every((one) => one.remove === remove) ? remove : null,
    defer: each.every((one) => one.defer),
    trash: each.every((one) => one.trash),
  }
}

/**
 * What each removing verb is called and drawn with.
 *
 * Two names for one action on purpose. `label` is the sentence a control says
 * — a sheet row, the Edit bar — and `swipe` is what fits in the strip behind a
 * row, which is about six characters wide before the glyph starts to crowd.
 */
export const REMOVE_ACTION_CHROME: Record<RemoveAction, { label: string; swipe: string; icon: IconName }> = {
  archive: { label: 'Archive', swipe: 'Archive', icon: 'archive' },
  untrash: { label: 'Move to Inbox', swipe: 'Inbox', icon: 'inbox' },
}

/**
 * How far a row may follow a finger in each direction.
 *
 * A direction with nothing behind it does not move at all, rather than moving
 * and then refusing at the end: the strip that appears under a row IS the
 * promise, and a row that slides open over an action it will not take is the
 * same lie as the toast, told a second earlier.
 */
export function swipeRange(actions: MobileThreadActions, limit: number): { min: number; max: number } {
  return { min: actions.defer ? -limit : 0, max: actions.remove ? limit : 0 }
}
