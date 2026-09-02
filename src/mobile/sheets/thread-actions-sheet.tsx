import type { MailActionType, Thread } from '@/core/types'
import { BottomSheet, SheetAction } from '../components/bottom-sheet'
import { MobileIcon } from '../components/mobile-icon'
import { moveTargets, removeChrome, rowActions } from '../thread-actions'

/**
 * Every verb a conversation accepts, from a long press or from More.
 *
 * The three that depend on where the conversation is come from `rowActions`,
 * and a verb that would do nothing is not drawn at all. The sheet used to
 * offer Archive, Later and Move → Trash on a conversation in the trash, and
 * all three reported success (issue 48).
 */
export function ThreadActionsSheet({ thread, onClose, onAction, onLater, onMove }: { thread: Thread; onClose: () => void; onAction: (action: MailActionType) => void; onLater: () => void; onMove: () => void }) {
  const actions = rowActions(thread)
  const remove = actions.remove
  const chrome = removeChrome(remove)
  return (
    <BottomSheet title={thread.subject || 'Thread actions'} onClose={onClose}>
      <div className="mobile-action-list">
        <SheetAction icon={<MobileIcon name="star" scale="action" />} label={thread.starred ? 'Unstar' : 'Star'} onClick={() => onAction(thread.starred ? 'unstar' : 'star')} />
        <SheetAction icon={<MobileIcon name={thread.unread ? 'read' : 'unread'} scale="action" />} label={thread.unread ? 'Mark read' : 'Mark unread'} onClick={() => onAction(thread.unread ? 'markRead' : 'markUnread')} />
        {remove && <SheetAction icon={<MobileIcon name={chrome.icon} scale="action" />} label={chrome.label} onClick={() => onAction(remove)} />}
        {actions.defer && <SheetAction icon={<MobileIcon name="calendar" scale="action" />} label="Later" onClick={onLater} />}
        <SheetAction icon={<MobileIcon name="inbox" scale="action" />} label="Move" onClick={onMove} />
        {typeof navigator.share === 'function' && <SheetAction icon={<MobileIcon name="external" scale="action" />} label="Share" onClick={() => void navigator.share({ title: thread.subject, text: thread.snippet })} />}
      </div>
    </BottomSheet>
  )
}

/**
 * Where a conversation can be moved TO, which is never where it already is.
 *
 * Trash's own long-press menu offered "Move to Trash" on a conversation
 * already in the trash and reported "Moved to trash" (issue 48). And Inbox
 * used to send `unarchive` whatever the conversation was: on a trashed one
 * that adds INBOX and leaves TRASH, and `threadMatchesView` gives TRASH the
 * precedence — so the conversation stayed exactly where it was, in the trash,
 * now carrying a label that says otherwise.
 */
export function MoveSheet({ thread, onClose, onMove }: { thread: Thread; onClose: () => void; onMove: (action: MailActionType) => void }) {
  // Asked as a question about position, which is what a Move sheet is for.
  // Decoding it back out of `remove` — "is the way it is put away `archive`?"
  // — answered the same thing through the wrong noun.
  const { trashed, inboxed } = moveTargets(thread)
  // The restore is `untrash` out of the trash and `unarchive` everywhere else:
  // out of the trash, adding INBOX alone leaves TRASH in place and
  // `threadMatchesView` gives TRASH the precedence.
  const toInbox: MailActionType = trashed ? 'untrash' : 'unarchive'
  return (
    <BottomSheet title="Move thread" onClose={onClose}>
      <div className="mobile-action-list">
        {!inboxed && <SheetAction icon={<MobileIcon name="inbox" scale="action" />} label="Inbox" onClick={() => onMove(toInbox)} />}
        {!trashed && <SheetAction icon={<MobileIcon name="trash" scale="action" />} label="Trash" destructive onClick={() => onMove('trash')} />}
      </div>
    </BottomSheet>
  )
}
