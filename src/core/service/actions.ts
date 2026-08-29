// The label arithmetic behind every mail action, shared by the real and demo
// services so an optimistic local update and a Gmail modify agree exactly.

import type { MailActionType, Message, Thread } from '../types'

export interface LabelDelta {
  add: string[]
  remove: string[]
}

export function labelDelta(type: MailActionType): LabelDelta {
  switch (type) {
    case 'archive':
      return { add: [], remove: ['INBOX'] }
    case 'unarchive':
      return { add: ['INBOX'], remove: [] }
    case 'trash':
      return { add: ['TRASH'], remove: ['INBOX'] }
    case 'untrash':
      return { add: ['INBOX'], remove: ['TRASH'] }
    case 'star':
      return { add: ['STARRED'], remove: [] }
    case 'unstar':
      return { add: [], remove: ['STARRED'] }
    case 'markRead':
      return { add: [], remove: ['UNREAD'] }
    case 'markUnread':
      return { add: ['UNREAD'], remove: [] }
  }
}

function applyDelta(labelIds: string[], delta: LabelDelta): string[] {
  const set = new Set(labelIds)
  for (const id of delta.remove) set.delete(id)
  for (const id of delta.add) set.add(id)
  return [...set]
}

export function applyActionToThread(thread: Thread, type: MailActionType): Thread {
  const labelIds = applyDelta(thread.labelIds, labelDelta(type))
  return { ...thread, labelIds, unread: labelIds.includes('UNREAD'), starred: labelIds.includes('STARRED') }
}

export function applyActionToMessage(message: Message, type: MailActionType): Message {
  const labelIds = applyDelta(message.labelIds, labelDelta(type))
  return { ...message, labelIds, unread: labelIds.includes('UNREAD'), starred: labelIds.includes('STARRED') }
}

/** Gmail has dedicated trash/untrash endpoints; the rest are label modifies. */
export function isTrashAction(type: MailActionType): boolean {
  return type === 'trash' || type === 'untrash'
}

/**
 * The action that puts a thread back the way it was — what UNDO sends once the
 * held mutation has already flushed and there is nothing left to cancel.
 *
 * It lives here, beside `labelDelta`, because it is the same arithmetic read
 * backwards: `labelDelta(reverseAction(t))` is `labelDelta(t)` with `add` and
 * `remove` swapped, for every one of the eight. A pairing kept in the UI layer
 * would be a second table free to disagree with this one.
 *
 * It is an involution — `reverseAction(reverseAction(t)) === t` — which is the
 * property the test pins, and the reason redo needs no separate mapping.
 *
 * Not a perfect restoration in one case, and honestly so: undoing an archive
 * puts INBOX back, but a thread that carried no INBOX label before the archive
 * (already archived, archived again) gains one. The alternative is a snapshot
 * of every label per action, which is a bigger machine than the 10 s window it
 * would serve.
 */
export function reverseAction(type: MailActionType): MailActionType {
  switch (type) {
    case 'archive':
      return 'unarchive'
    case 'unarchive':
      return 'archive'
    case 'trash':
      return 'untrash'
    case 'untrash':
      return 'trash'
    case 'star':
      return 'unstar'
    case 'unstar':
      return 'star'
    case 'markRead':
      return 'markUnread'
    case 'markUnread':
      return 'markRead'
  }
}
