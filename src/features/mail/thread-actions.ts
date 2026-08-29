// What you can do to a thread, described once.
//
// Four surfaces offer the same four actions — the row's hover cluster, the
// reading pane's toolbar, the command palette and the keymap — and each used
// to decide for itself whether `#` means trash or untrash, whether the star
// glyph is filled, and what the button should be called. They disagreed: the
// palette's trash row carried no shortcut hint, and the row's archive button
// was the only one that knew archiving a trashed thread does nothing.
//
// The descriptor answers all of that from the thread. Surfaces still choose
// their own order, because the reading toolbar's is not the row's.

import type { IconName } from '@/components/ui/icon'
import type { MailActionType, Thread } from '@/core/types'

export type ThreadActionId = 'archive' | 'trash' | 'read' | 'star'

export interface ThreadActionSpec {
  id: ThreadActionId
  /** The action to send to performAction, already resolved against the thread. */
  type: MailActionType
  label: string
  icon: IconName
  tone: 'default' | 'danger' | 'star'
  /** Draw the glyph filled — the star, when it is on. */
  filled: boolean
  /** Give the glyph its 200 ms press pop. Reserved for the star. */
  pop: boolean
  /** The key that does the same thing, for a hint. */
  hint: string
  disabled: boolean
}

/** The order the thread row and the palette use. */
export const THREAD_ACTION_ORDER: ThreadActionId[] = ['archive', 'trash', 'read', 'star']

/** The subset of a Thread the descriptor reads. */
export type ThreadActionSource = Pick<Thread, 'labelIds' | 'unread' | 'starred'>

export function threadActions(thread: ThreadActionSource): Record<ThreadActionId, ThreadActionSpec> {
  const inTrash = thread.labelIds.includes('TRASH')
  return {
    archive: {
      id: 'archive',
      type: 'archive',
      label: 'Archive',
      icon: 'archive',
      tone: 'default',
      filled: false,
      pop: false,
      hint: 'E',
      // Archiving something already out of the inbox is a no-op with a toast.
      disabled: inTrash,
    },
    trash: {
      id: 'trash',
      type: inTrash ? 'untrash' : 'trash',
      label: inTrash ? 'Restore from trash' : 'Move to trash',
      icon: 'trash',
      tone: 'danger',
      filled: false,
      pop: false,
      hint: '#',
      disabled: false,
    },
    read: {
      id: 'read',
      type: thread.unread ? 'markRead' : 'markUnread',
      label: thread.unread ? 'Mark as read' : 'Mark as unread',
      icon: thread.unread ? 'read' : 'unread',
      tone: 'default',
      filled: false,
      pop: false,
      hint: 'U',
      disabled: false,
    },
    star: {
      id: 'star',
      type: thread.starred ? 'unstar' : 'star',
      label: thread.starred ? 'Unstar' : 'Star',
      icon: 'star',
      tone: thread.starred ? 'star' : 'default',
      filled: thread.starred,
      pop: true,
      hint: 'S',
      disabled: false,
    },
  }
}
