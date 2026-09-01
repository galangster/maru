import { Archive, Clock3, Inbox, Mail, Share, Star, Trash2 } from 'lucide-react'
import type { MailActionType, Thread } from '@/core/types'
import { BottomSheet, SheetAction } from '../components/bottom-sheet'

export function ThreadActionsSheet({ thread, onClose, onAction, onLater, onMove }: { thread: Thread; onClose: () => void; onAction: (action: MailActionType) => void; onLater: () => void; onMove: () => void }) {
  return (
    <BottomSheet title={thread.subject || 'Thread actions'} onClose={onClose}>
      <div className="mobile-action-list">
        <SheetAction icon={<Star size={19} />} label={thread.starred ? 'Unstar' : 'Star'} onClick={() => onAction(thread.starred ? 'unstar' : 'star')} />
        <SheetAction icon={<Mail size={19} />} label={thread.unread ? 'Mark read' : 'Mark unread'} onClick={() => onAction(thread.unread ? 'markRead' : 'markUnread')} />
        <SheetAction icon={<Archive size={19} />} label="Archive" onClick={() => onAction('archive')} />
        <SheetAction icon={<Clock3 size={19} />} label="Later" onClick={onLater} />
        <SheetAction icon={<Inbox size={19} />} label="Move" onClick={onMove} />
        {typeof navigator.share === 'function' && <SheetAction icon={<Share size={19} />} label="Share" onClick={() => void navigator.share({ title: thread.subject, text: thread.snippet })} />}
      </div>
    </BottomSheet>
  )
}

export function MoveSheet({ onClose, onMove }: { onClose: () => void; onMove: (action: MailActionType) => void }) {
  return <BottomSheet title="Move thread" onClose={onClose}><div className="mobile-action-list"><SheetAction icon={<Inbox size={19} />} label="Inbox" onClick={() => onMove('unarchive')} /><SheetAction icon={<Trash2 size={19} />} label="Trash" destructive onClick={() => onMove('trash')} /></div></BottomSheet>
}
