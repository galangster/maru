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
// **A projection of the desktop descriptor, not a second opinion.** Where a
// conversation is, and what that makes of Archive, Later and Trash, is decided
// once in `features/mail/thread-actions.ts` for the row cluster, the reading
// toolbar, the palette and the keymap. This file asks that descriptor and
// reshapes the answer for the two things the phone has and the desktop does
// not: a row that follows a finger, and an Edit bar that acts on a batch. It
// held its own copy of the trash and inbox rules until it was found to have
// drifted — the same two-line rule written twice is two places to fix issue 48.
//
// Pure, and tested as data in tests/mobile-state.test.ts.

import type { IconName } from '@/components/ui/icon'
import type { MailActionType, Thread } from '@/core/types'
import { threadActions, type ThreadActionSource } from '@/features/mail/thread-actions'

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
 * Where the conversation already is — the two facts every phone verb turns on.
 *
 * Read off the desktop descriptor rather than off `labelIds`, so there is one
 * answer in the app to "is this in the trash" and "is the inbox its home":
 *
 * - Trash first, exactly as `FOLDER_PRECEDENCE` orders it. A trashed thread
 *   lives in the trash whatever else it is labelled, which is why the
 *   descriptor's trash verb has already turned itself round into `untrash`.
 * - `later` is disabled precisely where the inbox is not the thread's home —
 *   in the trash, or with no INBOX label — so its negation IS `inboxed`. That
 *   is the rule the phone would otherwise be restating, and Later is the verb
 *   both shells agree it belongs to.
 *
 * The Move sheet asks for these directly, because "where can this go" is a
 * question about position and not about how a row is swiped away.
 */
export interface MoveTargets {
  /** In the trash, whatever else it is labelled. */
  trashed: boolean
  /** In the inbox, and so somewhere Archive and Later mean something. */
  inboxed: boolean
}

export function moveTargets(thread: ThreadActionSource): MoveTargets {
  const specs = threadActions(thread)
  return {
    trashed: specs.trash.type === 'untrash',
    inboxed: !specs.later.disabled,
  }
}

/**
 * What the three verbs do to this conversation, for one row.
 *
 * Named for the row rather than for the thread, because the desktop's
 * `threadActions` is the descriptor this is derived from and two modules
 * exporting one name with two shapes is how the copy drifted in the first
 * place.
 */
export function rowActions(thread: ThreadActionSource): MobileThreadActions {
  const { trashed, inboxed } = moveTargets(thread)
  return {
    // Restoring, not archiving: a trashed thread is put away by being taken
    // back out, and archiving it would strip a label nothing reads.
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
  const each = threads.map(rowActions)
  const remove = each[0].remove
  return {
    remove: each.every((one) => one.remove === remove) ? remove : null,
    defer: each.every((one) => one.defer),
    trash: each.every((one) => one.trash),
  }
}

/**
 * What each removing verb is called and drawn with, on the phone.
 *
 * The one thing here that is NOT the desktop's. Two names for one action on
 * purpose: `label` is the sentence a control says — a sheet row, the Edit bar
 * — and `swipe` is what fits in the strip behind a row, which is about six
 * characters wide before the glyph starts to crowd.
 *
 * `untrash` deliberately reads differently from both of the desktop's words
 * for it. The descriptor calls it "Restore from trash", which is the reading
 * toolbar's sentence and too long for either phone control, and `UNDO_LABELS`
 * calls it "Moved to Inbox", which is the past tense a confirmation speaks in
 * and not something a button can say. Where it goes is the useful half on a
 * phone, so the button says that and the toast still says the other.
 *
 * Private, and reached through `removeChrome`, so the fallback for "nothing to
 * put away" is written once rather than at each control that draws a verb it
 * may not have.
 */
const REMOVE_CHROME: Record<RemoveAction, { label: string; swipe: string; icon: IconName }> = {
  archive: { label: 'Archive', swipe: 'Archive', icon: 'archive' },
  untrash: { label: 'Move to Inbox', swipe: 'Inbox', icon: 'inbox' },
}

/**
 * How to draw the removing verb, including when there is not one.
 *
 * A control still has to be named while it is disabled — the Edit bar with
 * nothing checked, the strip behind a row that will not open — and Archive is
 * the honest word for a bar that is not acting on anything. That fallback is
 * here and nowhere else: four controls each spelling `?? 'archive'` is four
 * places for the phone to disagree with itself about what an empty batch is
 * called.
 */
export function removeChrome(remove: RemoveAction | null): { label: string; swipe: string; icon: IconName } {
  return REMOVE_CHROME[remove ?? 'archive']
}

/**
 * The gesture help a list announces, for the gestures that list actually has.
 *
 * One sentence used to be shared by every mailbox — "Swipe right to archive,
 * or to restore from Trash. Swipe left to save for later. Long press for more
 * actions." — and in Sent and in Later neither swipe does anything, because
 * `rowActions` had correctly stopped offering them. So the only instructions a
 * screen-reader user got in Sent were for two gestures that are not there
 * (issue 63). The visible behaviour was right in both; it was what the list
 * SAID that was wrong.
 *
 * Built from the same resolved verbs the rows are drawn from, and named with
 * the same `REMOVE_CHROME` vocabulary, so the help and the strip behind the
 * row cannot come to describe different gestures. The long press is
 * unconditional: the actions sheet always has something in it, which is the
 * fact that made Sent usable while its swipes did nothing.
 *
 * Given a whole list's `batchActions` — the intersection — so the help
 * promises only what EVERY row in the list will do. Search is the list that
 * needs that: one result set holds inbox mail, sent mail and trashed mail at
 * once, and a promise that holds for some of the rows is the same defect one
 * row further down.
 */
export function gestureHint(actions: MobileThreadActions): string {
  const said: string[] = []
  if (actions.remove) {
    const { label } = removeChrome(actions.remove)
    said.push(`Swipe right to ${label[0].toLowerCase()}${label.slice(1)}.`)
  }
  if (actions.defer) said.push('Swipe left to save for later.')
  said.push('Long press for more actions.')
  return said.join(' ')
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
