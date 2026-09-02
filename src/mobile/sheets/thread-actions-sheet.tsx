import type { MailActionType, Thread } from '@/core/types'
import { BottomSheet, SheetAction } from '../components/bottom-sheet'
import { MobileIcon } from '../components/mobile-icon'
import { REMOVE_ACTION_CHROME, threadActions } from '../thread-actions'

/**
 * Every verb a conversation accepts, from a long press or from More.
 *
 * The three that depend on where the conversation is come from
 * `threadActions`, and a verb that would do nothing is not drawn at all. The
 * sheet used to offer Archive, Later and Move → Trash on a conversation in the
 * trash, and all three reported success (issue 48).
 */
export function ThreadActionsSheet({ thread, onClose, onAction, onLater, onMove }: { thread: Thread; onClose: () => void; onAction: (action: MailActionType) => void; onLater: () => void; onMove: () => void }) {
  const actions = threadActions(thread)
  const remove = actions.remove
  const removeChrome = remove ? REMOVE_ACTION_CHROME[remove] : null
  return (
    <BottomSheet title={thread.subject || 'Thread actions'} onClose={onClose}>
      <div className="mobile-action-list">
        <SheetAction icon={<MobileIcon name="star" scale="action" />} label={thread.starred ? 'Unstar' : 'Star'} onClick={() => onAction(thread.starred ? 'unstar' : 'star')} />
        <SheetAction icon={<MobileIcon name={thread.unread ? 'read' : 'unread'} scale="action" />} label={thread.unread ? 'Mark read' : 'Mark unread'} onClick={() => onAction(thread.unread ? 'markRead' : 'markUnread')} />
        {remove && removeChrome && <SheetAction icon={<MobileIcon name={removeChrome.icon} scale="action" />} label={removeChrome.label} onClick={() => onAction(remove)} />}
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
  const actions = threadActions(thread)
  // The restore is `untrash` out of the trash and `unarchive` everywhere else,
  // which is the same two-line rule `threadActions` answers `remove` with —
  // read here as "where does Inbox mean something", not "how is it put away".
  const toInbox: MailActionType = actions.remove === 'untrash' ? 'untrash' : 'unarchive'
  const inboxOffered = actions.remove !== 'archive'
  return (
    <BottomSheet title="Move thread" onClose={onClose}>
      <div className="mobile-action-list">
        {inboxOffered && <SheetAction icon={<MobileIcon name="inbox" scale="action" />} label="Inbox" onClick={() => onMove(toInbox)} />}
        {actions.trash && <SheetAction icon={<MobileIcon name="trash" scale="action" />} label="Trash" destructive onClick={() => onMove('trash')} />}
      </div>
    </BottomSheet>
  )
}
