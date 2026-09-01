import { useEffect, useState } from 'react'
import { Archive, ArrowLeft, Clock3, Ellipsis, Forward, Reply, ReplyAll } from 'lucide-react'

import type { Message, Thread } from '@/core/types'
import { usePerformAction, useSettings, useThread } from '@/features/mail/queries'
import { expandedIds, toggleExpanded } from '@/features/reading/conversation'
import type { ReplyMode } from '@/lib/compose'
import { useNow } from '@/lib/use-now'
import { MobileMessageCard } from '../components/message-card'
import { MobileListSkeleton } from '../components/placeholders'
import { useEdgeBack } from '../use-edge-back'
import './thread-screen.css'

export function ThreadScreen({
  threadKey,
  onBack,
  onReply,
  onArchive,
  onLater,
  onMore,
}: {
  threadKey: string
  onBack: () => void
  onReply: (detail: { thread: Thread; messages: Message[] }, mode: ReplyMode) => void
  onArchive: (key: string) => void
  onLater: (key: string) => void
  onMore: (thread: Thread) => void
}) {
  const detail = useThread(threadKey)
  const settings = useSettings()
  const perform = usePerformAction()
  const now = useNow()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const edge = useEdgeBack(onBack)

  useEffect(() => {
    if (detail.data?.messages) setExpanded(expandedIds(detail.data.messages, 'default'))
  }, [detail.data?.thread.key, detail.data?.messages])
  useEffect(() => {
    if (detail.data?.thread.unread) perform.mutate({ threadKey, type: 'markRead' })
  }, [detail.data?.thread.unread, threadKey])

  if (!detail.data) return <MobileListSkeleton />
  const { thread, messages } = detail.data
  return (
    <section
      className={`mobile-screen mobile-thread-screen${edge.settling ? ' is-settling' : ''}`}
      style={{ transform: `translateX(${edge.offset}px)` }}
      {...edge.handlers}
      aria-label={`Thread: ${thread.subject}`}
    >
      <header className="mobile-nav mobile-thread-nav">
        <button className="mobile-nav-back" type="button" onClick={onBack} aria-label="Back to inbox"><ArrowLeft size={22} /><span>Inbox</span></button>
        <div className="mobile-nav-actions">
          <button type="button" aria-label="Archive" onClick={() => onArchive(thread.key)}><Archive size={20} /></button>
          <button type="button" aria-label="Save for later" onClick={() => onLater(thread.key)}><Clock3 size={20} /></button>
          <button type="button" aria-label="More actions" onClick={() => onMore(thread)}><Ellipsis size={21} /></button>
        </div>
      </header>
      <div className="mobile-scroll mobile-thread-scroll">
        <div className="mobile-thread-heading"><h1>{thread.subject || '(No subject)'}</h1><p>{messages.length} message{messages.length === 1 ? '' : 's'}</p></div>
        <div className="mobile-message-list">
          {messages.map((message, index) => (
            <MobileMessageCard
              key={message.id}
              threadKey={thread.key}
              message={message}
              expanded={expanded.has(message.id)}
              newest={index === messages.length - 1}
              allowRemoteImages={(settings.data?.imagePolicy ?? 'allow') === 'allow'}
              now={now}
              onToggle={() => setExpanded((current) => toggleExpanded(current, message.id))}
            />
          ))}
        </div>
      </div>
      <div className="mobile-thread-toolbar" aria-label="Thread actions">
        <ToolbarButton label="Reply" icon={<Reply size={20} />} onClick={() => onReply(detail.data, 'reply')} />
        <ToolbarButton label="Reply all" icon={<ReplyAll size={20} />} onClick={() => onReply(detail.data, 'replyAll')} />
        <ToolbarButton label="Forward" icon={<Forward size={20} />} onClick={() => onReply(detail.data, 'forward')} />
        <ToolbarButton label="Archive" icon={<Archive size={20} />} onClick={() => onArchive(thread.key)} />
        <ToolbarButton label="Later" icon={<Clock3 size={20} />} onClick={() => onLater(thread.key)} />
        <ToolbarButton label="More" icon={<Ellipsis size={20} />} onClick={() => onMore(thread)} />
      </div>
    </section>
  )
}

function ToolbarButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label}>{icon}</button>
}
