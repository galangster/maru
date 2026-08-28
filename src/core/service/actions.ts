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
