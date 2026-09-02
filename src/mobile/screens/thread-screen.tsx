import { useEffect, useState } from 'react'

import type { Message, Thread } from '@/core/types'
import { useLabels, usePerformAction, useSettings, useThread } from '@/features/mail/queries'
import { useUi } from '@/features/mail/ui-store'
import { expandedIds, toggleExpanded } from '@/features/reading/conversation'
import type { ReplyMode } from '@/lib/compose'
import { useNow } from '@/lib/use-now'
import { MobileMessageCard } from '../components/message-card'
import { MobileIcon } from '../components/mobile-icon'
import { MobileListSkeleton } from '../components/placeholders'
import { useEdgeBack } from '../use-edge-back'
import './thread-screen.css'

export function ThreadScreen({
  threadKey,
  backLabel,
  onBack,
  onReply,
  onArchive,
  onLater,
  onMore,
  onLabels,
}: {
  threadKey: string
  /** The screen underneath — a mailbox name, or the tab this was opened from. */
  backLabel: string
  onBack: () => void
  onReply: (detail: { thread: Thread; messages: Message[] }, mode: ReplyMode) => void
  onArchive: (key: string) => void
  onLater: (key: string) => void
  onMore: (thread: Thread) => void
  onLabels: (thread: Thread) => void
}) {
  const detail = useThread(threadKey)
  const settings = useSettings()
  const perform = usePerformAction()
  const now = useNow()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const labels = useLabels(detail.data?.thread.accountId)
  // The desktop's session-scoped override, not a phone-only copy of it: the
  // Set can only OPEN what `imagePolicy` closed, never the other way round.
  const imagesAllowed = useUi((state) => state.imagesAllowed)
  const allowImages = useUi((state) => state.allowImages)
  const edge = useEdgeBack(onBack)

  useEffect(() => {
    if (detail.data?.messages) setExpanded(expandedIds(detail.data.messages, 'default'))
  }, [detail.data?.thread.key, detail.data?.messages])
  useEffect(() => {
    if (detail.data?.thread.unread) perform.mutate({ threadKey, type: 'markRead' })
  }, [detail.data?.thread.unread, threadKey])

  if (!detail.data) return <MobileListSkeleton />
  const { thread, messages } = detail.data
  // `?? 'block'` is fail-closed and is NOT a second copy of the default. It
  // answers "may I fetch, not yet knowing what was chosen?", and being wrong
  // the other way fetches remote images for someone who blocked them, once,
  // unrecoverably. Same reading as the desktop pane.
  const showImages = (settings.data?.imagePolicy ?? 'block') === 'allow' || imagesAllowed.has(thread.key)
  const userLabels = (labels.data ?? []).filter((label) => label.type === 'user')
  const applied = userLabels.filter((label) => thread.labelIds.includes(label.id))
  const allOpen = messages.length > 0 && messages.every((message) => expanded.has(message.id))
  return (
    <section
      className={`mobile-screen mobile-thread-screen${edge.settling ? ' is-settling' : ''}`}
      style={{ transform: `translateX(${edge.offset}px)` }}
      {...edge.handlers}
      aria-label={`Thread: ${thread.subject}`}
    >
      <header className="mobile-nav mobile-thread-nav">
        <button className="mobile-nav-back" type="button" onClick={onBack} aria-label={`Back to ${backLabel}`}><MobileIcon name="chevronRight" className="mobile-icon-back" scale="large" /><span>{backLabel}</span></button>
        <div className="mobile-nav-actions">
          <button type="button" aria-label="Archive" onClick={() => onArchive(thread.key)}><MobileIcon name="archive" scale="action" /></button>
          <button type="button" aria-label="Save for later" onClick={() => onLater(thread.key)}><MobileIcon name="calendar" scale="action" /></button>
          <button
            type="button"
            aria-label={allOpen ? 'Collapse all messages' : 'Expand all messages'}
            aria-expanded={allOpen}
            onClick={() => setExpanded(expandedIds(messages, allOpen ? 'none' : 'all'))}
          >
            <MobileIcon name={allOpen ? 'chevronUp' : 'chevronDown'} scale="action" />
          </button>
          <button type="button" aria-label="More actions" onClick={() => onMore(thread)}><MobileIcon name="sliders" scale="action" /></button>
        </div>
      </header>
      <div className="mobile-scroll mobile-thread-scroll">
        <div className="mobile-thread-heading">
          <h1>{thread.subject || '(No subject)'}</h1>
          <p>{messages.length} message{messages.length === 1 ? '' : 's'}</p>
          {userLabels.length > 0 && (
            <div className="mobile-thread-labels">
              {applied.map((label) => <span key={label.id}>{label.name}</span>)}
              <button type="button" onClick={() => onLabels(thread)} aria-haspopup="dialog">+ Label</button>
            </div>
          )}
        </div>
        <div className="mobile-message-list">
          {messages.map((message, index) => (
            <MobileMessageCard
              key={message.id}
              threadKey={thread.key}
              message={message}
              expanded={expanded.has(message.id)}
              newest={index === messages.length - 1}
              allowRemoteImages={showImages}
              now={now}
              onToggle={() => setExpanded((current) => toggleExpanded(current, message.id))}
              onAllowImages={() => allowImages(thread.key)}
            />
          ))}
        </div>
      </div>
      <div className="mobile-thread-toolbar" role="toolbar" aria-label="Thread actions">
        <ToolbarButton label="Reply" icon={<MobileIcon name="reply" scale="action" />} onClick={() => onReply(detail.data, 'reply')} />
        <ToolbarButton label="Reply all" icon={<MobileIcon name="replyAll" scale="action" />} onClick={() => onReply(detail.data, 'replyAll')} />
        <ToolbarButton label="Forward" icon={<MobileIcon name="forward" scale="action" />} onClick={() => onReply(detail.data, 'forward')} />
        <ToolbarButton label="Archive" icon={<MobileIcon name="archive" scale="action" />} onClick={() => onArchive(thread.key)} />
        <ToolbarButton label="Later" icon={<MobileIcon name="calendar" scale="action" />} onClick={() => onLater(thread.key)} />
        <ToolbarButton label="More" icon={<MobileIcon name="sliders" scale="action" />} onClick={() => onMore(thread)} />
      </div>
    </section>
  )
}

function ToolbarButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label}>{icon}</button>
}
