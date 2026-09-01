import type { MailActionType, Thread } from '@/core/types'
import { BottomSheet, SheetAction } from '../components/bottom-sheet'
import { MobileIcon } from '../components/mobile-icon'

export function ThreadActionsSheet({ thread, onClose, onAction, onLater, onMove }: { thread: Thread; onClose: () => void; onAction: (action: MailActionType) => void; onLater: () => void; onMove: () => void }) {
  return (
    <BottomSheet title={thread.subject || 'Thread actions'} onClose={onClose}>
      <div className="mobile-action-list">
        <SheetAction icon={<MobileIcon name="star" scale="action" />} label={thread.starred ? 'Unstar' : 'Star'} onClick={() => onAction(thread.starred ? 'unstar' : 'star')} />
        <SheetAction icon={<MobileIcon name={thread.unread ? 'read' : 'unread'} scale="action" />} label={thread.unread ? 'Mark read' : 'Mark unread'} onClick={() => onAction(thread.unread ? 'markRead' : 'markUnread')} />
        <SheetAction icon={<MobileIcon name="archive" scale="action" />} label="Archive" onClick={() => onAction('archive')} />
        <SheetAction icon={<MobileIcon name="calendar" scale="action" />} label="Later" onClick={onLater} />
        <SheetAction icon={<MobileIcon name="inbox" scale="action" />} label="Move" onClick={onMove} />
        {typeof navigator.share === 'function' && <SheetAction icon={<MobileIcon name="external" scale="action" />} label="Share" onClick={() => void navigator.share({ title: thread.subject, text: thread.snippet })} />}
      </div>
    </BottomSheet>
  )
}

export function MoveSheet({ onClose, onMove }: { onClose: () => void; onMove: (action: MailActionType) => void }) {
  return <BottomSheet title="Move thread" onClose={onClose}><div className="mobile-action-list"><SheetAction icon={<MobileIcon name="inbox" scale="action" />} label="Inbox" onClick={() => onMove('unarchive')} /><SheetAction icon={<MobileIcon name="trash" scale="action" />} label="Trash" destructive onClick={() => onMove('trash')} /></div></BottomSheet>
}
