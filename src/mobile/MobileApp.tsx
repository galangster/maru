import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Ellipsis,
  Forward,
  Image as ImageIcon,
  Inbox,
  Info,
  Mail,
  Paperclip,
  PenLine,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings as SettingsIcon,
  Share,
  Star,
  Trash2,
  UserRound,
  Volume2,
  X,
} from 'lucide-react'

import { WrenPerched } from '@/components/wren-figure'
import { deferAtDate, deferPresets, MAX_DEFER_DAYS, maxDeferAt } from '@/core/defaults'
import type {
  ComposeDraft,
  MailActionType,
  MailView,
  Message,
  OutgoingAttachment,
  Thread,
} from '@/core/types'
import {
  MIN_SEARCH_LENGTH,
  useAccountsById,
  useDefer,
  useMailEvents,
  usePerformAction,
  useSaveSettings,
  useSearch,
  useSettings,
  useThread,
  useThreads,
  useWakeSweep,
} from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useThemeEffect } from '@/features/shell/use-theme'
import {
  deriveRecipients,
  formatAddress,
  paragraphsToHtml,
  parseAddresses,
  quoteOriginal,
  replySubject,
  type ReplyMode,
} from '@/lib/compose'
import {
  displayName,
  formatBytes,
  fullTimestamp,
  isPreviewableImage,
  relativeTime,
  toDataUrl,
} from '@/lib/format'
import { buildSrcdoc, sanitizeBody } from '@/lib/sanitize'
import { useNow } from '@/lib/use-now'

import {
  buildMobileRowModel,
  mobileNavigationReducer,
  resolveSwipeIntent,
  type MobileRoute,
} from './state'
import './mobile.css'

type MobileTab = 'inbox' | 'search' | 'settings'

interface ComposeSeed {
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  quoteHtml: string
  reply?: ComposeDraft['reply']
}

const SEARCH_OPERATORS = [
  'from:',
  'to:',
  'is:unread',
  'is:starred',
  'has:attachment',
  'label:',
]

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

export function MobileApp() {
  useThemeEffect()
  useMailEvents()
  useWakeSweep()

  const [tab, setTab] = useState<MobileTab>('inbox')
  const [routes, dispatch] = useReducer(mobileNavigationReducer, [{ kind: 'inbox' }])
  const [search, setSearch] = useState('')
  const [compose, setCompose] = useState<ComposeSeed | null>(null)
  const [laterKeys, setLaterKeys] = useState<string[] | null>(null)
  const [contextThread, setContextThread] = useState<Thread | null>(null)
  const [moveThread, setMoveThread] = useState<Thread | null>(null)
  const perform = usePerformAction()
  const defer = useDefer()
  const { accounts, selfEmails } = useAccountsById()
  const route = routes[routes.length - 1] as MobileRoute

  const changeTab = (next: MobileTab) => {
    setTab(next)
    dispatch({ type: 'reset' })
  }

  const act = (threadKey: string, type: MailActionType) => {
    perform.mutate({ threadKey, type })
  }

  const openReply = (
    detail: { thread: Thread; messages: Message[] },
    mode: ReplyMode,
  ) => {
    const message = detail.messages[detail.messages.length - 1]
    if (!message) return
    const recipients = deriveRecipients(message, mode, selfEmails)
    setCompose({
      accountId: detail.thread.accountId,
      to: recipients.to.map(formatAddress).join(', '),
      cc: recipients.cc.map(formatAddress).join(', '),
      bcc: '',
      subject: replySubject(detail.thread.subject, mode),
      body: '',
      quoteHtml: quoteOriginal(message, mode, fullTimestamp),
      reply: { threadKey: detail.thread.key, messageId: message.id, mode },
    })
  }

  const openBlankCompose = () => {
    setCompose({
      accountId: accounts[0]?.id ?? '',
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
      quoteHtml: '',
    })
  }

  return (
    <div className="mobile-app" data-testid="mobile-app">
      <main className="mobile-stage">
        {route.kind === 'thread' ? (
          <ThreadScreen
            threadKey={route.threadKey}
            onBack={() => dispatch({ type: 'pop' })}
            onReply={openReply}
            onArchive={(key) => {
              act(key, 'archive')
              dispatch({ type: 'pop' })
            }}
            onLater={(key) => setLaterKeys([key])}
            onMore={setContextThread}
          />
        ) : tab === 'inbox' ? (
          <InboxScreen
            onOpen={(threadKey) => dispatch({ type: 'pushThread', threadKey })}
            onCompose={openBlankCompose}
            onSearch={() => changeTab('search')}
            onArchive={(keys) => keys.forEach((key) => act(key, 'archive'))}
            onLater={setLaterKeys}
            onContext={setContextThread}
            onStar={(thread) => act(thread.key, thread.starred ? 'unstar' : 'star')}
          />
        ) : tab === 'search' ? (
          <SearchScreen
            query={search}
            onQuery={setSearch}
            onOpen={(threadKey) => dispatch({ type: 'pushThread', threadKey })}
          />
        ) : (
          <SettingsScreen />
        )}
      </main>

      {route.kind === 'inbox' && (
        <TabBar active={tab} onChange={changeTab} />
      )}

      {compose && <ComposeSheet seed={compose} onClose={() => setCompose(null)} />}
      {laterKeys && (
        <LaterSheet
          count={laterKeys.length}
          onClose={() => setLaterKeys(null)}
          onPick={(wakeAt) => {
            laterKeys.forEach((threadKey) => defer.mutate({ threadKey, wakeAt }))
            setLaterKeys(null)
          }}
        />
      )}
      {contextThread && (
        <ThreadActionsSheet
          thread={contextThread}
          onClose={() => setContextThread(null)}
          onAction={(type) => {
            act(contextThread.key, type)
            setContextThread(null)
          }}
          onLater={() => {
            setLaterKeys([contextThread.key])
            setContextThread(null)
          }}
          onMove={() => {
            setMoveThread(contextThread)
            setContextThread(null)
          }}
        />
      )}
      {moveThread && (
        <MoveSheet
          onClose={() => setMoveThread(null)}
          onMove={(type) => {
            act(moveThread.key, type)
            setMoveThread(null)
          }}
        />
      )}
    </div>
  )
}

function InboxScreen({
  onOpen,
  onCompose,
  onSearch,
  onArchive,
  onLater,
  onContext,
  onStar,
}: {
  onOpen: (key: string) => void
  onCompose: () => void
  onSearch: () => void
  onArchive: (keys: string[]) => void
  onLater: (keys: string[]) => void
  onContext: (thread: Thread) => void
  onStar: (thread: Thread) => void
}) {
  const { accounts, selfEmails } = useAccountsById()
  const [accountId, setAccountId] = useState('all')
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const pullStart = useRef<number | null>(null)
  const now = useNow()
  const service = useMailService()
  const view: MailView =
    accountId === 'all'
      ? { kind: 'unified', folder: 'inbox' }
      : { kind: 'account', accountId, labelId: 'INBOX' }
  const query = useThreads(view)
  const threads = query.data ?? []

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const stopEditing = () => {
    setEditing(false)
    setSelected(new Set())
  }

  const handlePullStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scroller.current?.scrollTop !== 0) return
    pullStart.current = event.clientY
  }

  const handlePullMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pullStart.current === null || (scroller.current?.scrollTop ?? 0) > 0) return
    const distance = event.clientY - pullStart.current
    if (distance <= 0) return setPull(0)
    setPull(Math.min(92, distance * 0.52))
  }

  const handlePullEnd = async () => {
    pullStart.current = null
    if (pull < 64) return setPull(0)
    setRefreshing(true)
    setPull(52)
    await service.refresh()
    await query.refetch()
    setRefreshing(false)
    setPull(0)
  }

  const selectedKeys = [...selected]

  return (
    <section className="mobile-screen" aria-label="Inbox">
      <header className="mobile-nav mobile-inbox-nav">
        <div className="mobile-nav-row">
          <label className="mobile-account-lens">
            <span className="sr-only">Account lens</span>
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              aria-label="Account lens"
            >
              <option value="all">All inboxes</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                </option>
              ))}
            </select>
          </label>
          {editing && threads.length > 0 && (
            <button
              className="mobile-nav-text"
              type="button"
              onClick={() => setSelected(new Set(threads.map((thread) => thread.key)))}
            >
              Select All
            </button>
          )}
          <button
            className="mobile-nav-text"
            type="button"
            onClick={() => (editing ? stopEditing() : setEditing(true))}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
        <div className="mobile-title-row">
          <h1>Inbox</h1>
          <button className="mobile-round-button" type="button" onClick={onCompose} aria-label="Compose">
            <PenLine size={20} strokeWidth={2} />
          </button>
        </div>
        <button className="mobile-search-field" type="button" onClick={onSearch}>
          <Search size={17} aria-hidden />
          <span>Search mail</span>
          <kbd>from:</kbd>
        </button>
      </header>

      <div
        ref={scroller}
        className="mobile-scroll mobile-inbox-scroll"
        onPointerDown={handlePullStart}
        onPointerMove={handlePullMove}
        onPointerUp={() => void handlePullEnd()}
        onPointerCancel={() => void handlePullEnd()}
      >
        <div className="mobile-pull-indicator" style={{ height: pull }} aria-live="polite">
          <RefreshCw className={refreshing ? 'is-spinning' : ''} size={20} />
          <span>{refreshing ? 'Refreshing…' : pull >= 64 ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
        {query.isPending ? (
          <MobileListSkeleton />
        ) : threads.length === 0 ? (
          <EmptyInbox />
        ) : (
          <div className="mobile-thread-list" style={{ transform: `translateY(${pull}px)` }}>
            {threads.map((thread) => (
              <SwipeThreadRow
                key={thread.key}
                thread={thread}
                model={buildMobileRowModel(thread, selfEmails, now)}
                editing={editing}
                selected={selected.has(thread.key)}
                onSelect={() => toggle(thread.key)}
                onOpen={() => onOpen(thread.key)}
                onArchive={() => onArchive([thread.key])}
                onLater={() => onLater([thread.key])}
                onContext={() => onContext(thread)}
                onStar={() => onStar(thread)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="mobile-bulk-toolbar" aria-label="Bulk actions">
          <button type="button" disabled={selected.size === 0} onClick={() => onArchive(selectedKeys)}>
            <Archive size={20} />
            <span>Archive</span>
          </button>
          <button type="button" disabled={selected.size === 0} onClick={() => onLater(selectedKeys)}>
            <Clock3 size={20} />
            <span>Later</span>
          </button>
          <button type="button" disabled={selected.size === 0} onClick={() => stopEditing()}>
            <Check size={20} />
            <span>Done</span>
          </button>
        </div>
      )}
    </section>
  )
}

function SwipeThreadRow({
  thread,
  model,
  editing,
  selected,
  onSelect,
  onOpen,
  onArchive,
  onLater,
  onContext,
  onStar,
}: {
  thread: Thread
  model: ReturnType<typeof buildMobileRowModel>
  editing: boolean
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onArchive: () => void
  onLater: () => void
  onContext: () => void
  onStar: () => void
}) {
  const [offset, setOffset] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)

  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
  }

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (editing) return
    start.current = { x: event.clientX, y: event.clientY }
    suppressClick.current = false
    longPress.current = setTimeout(() => {
      suppressClick.current = true
      onContext()
    }, 480)
  }

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || editing) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelLongPress()
    if (Math.abs(dx) <= Math.abs(dy)) return
    setOffset(Math.max(-104, Math.min(104, dx)))
  }

  const pointerUp = () => {
    cancelLongPress()
    if (!start.current) return
    const intent = resolveSwipeIntent(offset, 0)
    if (intent) suppressClick.current = true
    setOffset(0)
    start.current = null
    if (intent === 'archive') onArchive()
    if (intent === 'later') onLater()
  }

  return (
    <div className="mobile-swipe-row">
      <div className="mobile-swipe-action is-archive"><Archive size={21} /><span>Archive</span></div>
      <div className="mobile-swipe-action is-later"><Clock3 size={21} /><span>Later</span></div>
      <div
        className={`mobile-thread-row${model.unread ? ' is-unread' : ''}${selected ? ' is-selected' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onContextMenu={(event) => {
          event.preventDefault()
          onContext()
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          editing ? onSelect() : onOpen()
        }}
        role="button"
        tabIndex={0}
        aria-label={`${model.sender}, ${model.subject}`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') editing ? onSelect() : onOpen()
        }}
      >
        {editing ? (
          <span className={`mobile-select-dot${selected ? ' is-checked' : ''}`} aria-hidden>
            {selected && <Check size={14} />}
          </span>
        ) : (
          <span className="mobile-unread-slot" aria-hidden>{model.unread && <span />}</span>
        )}
        <div className="mobile-row-copy">
          <div className="mobile-row-topline">
            <strong>{model.sender}</strong>
            <time>{model.time}</time>
          </div>
          <div className="mobile-row-subject">
            <span>{model.subject}</span>
            {model.messageCount > 1 && <small>{model.messageCount}</small>}
          </div>
          <p>{model.snippet}</p>
        </div>
        <button
          className={`mobile-star-button${model.starred ? ' is-starred' : ''}`}
          type="button"
          aria-label={model.starred ? 'Unstar thread' : 'Star thread'}
          onClick={(event) => {
            event.stopPropagation()
            onStar()
          }}
        >
          <Star size={17} fill={model.starred ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
}

function ThreadScreen({
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [edgeOffset, setEdgeOffset] = useState(0)
  const edgeStart = useRef<number | null>(null)

  useEffect(() => {
    const messages = detail.data?.messages
    if (!messages?.length) return
    setExpanded(new Set([messages[messages.length - 1].id]))
  }, [detail.data?.thread.key, detail.data?.messages])

  useEffect(() => {
    if (!detail.data?.thread.unread) return
    perform.mutate({ threadKey, type: 'markRead' })
  }, [detail.data?.thread.unread, threadKey])

  const edgeDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.clientX <= 28) edgeStart.current = event.clientX
  }
  const edgeMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (edgeStart.current === null) return
    setEdgeOffset(Math.max(0, Math.min(window.innerWidth, event.clientX - edgeStart.current)))
  }
  const edgeUp = () => {
    if (edgeOffset >= 72) onBack()
    setEdgeOffset(0)
    edgeStart.current = null
  }

  if (!detail.data) return <MobileListSkeleton />
  const { thread, messages } = detail.data

  return (
    <section
      className="mobile-screen mobile-thread-screen"
      style={{ transform: `translateX(${edgeOffset}px)` }}
      onPointerDown={edgeDown}
      onPointerMove={edgeMove}
      onPointerUp={edgeUp}
      onPointerCancel={edgeUp}
      aria-label={`Thread: ${thread.subject}`}
    >
      <header className="mobile-nav mobile-thread-nav">
        <button className="mobile-nav-back" type="button" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeft size={22} />
          <span>Inbox</span>
        </button>
        <div className="mobile-nav-actions">
          <button type="button" aria-label="Archive" onClick={() => onArchive(thread.key)}><Archive size={20} /></button>
          <button type="button" aria-label="Save for later" onClick={() => onLater(thread.key)}><Clock3 size={20} /></button>
          <button type="button" aria-label="More actions" onClick={() => onMore(thread)}><Ellipsis size={21} /></button>
        </div>
      </header>
      <div className="mobile-scroll mobile-thread-scroll">
        <div className="mobile-thread-heading">
          <h1>{thread.subject || '(No subject)'}</h1>
          <p>{messages.length} message{messages.length === 1 ? '' : 's'}</p>
        </div>
        <div className="mobile-message-list">
          {messages.map((message, index) => (
            <MobileMessageCard
              key={message.id}
              threadKey={thread.key}
              message={message}
              expanded={expanded.has(message.id)}
              newest={index === messages.length - 1}
              allowRemoteImages={(settings.data?.imagePolicy ?? 'allow') === 'allow'}
              onToggle={() => {
                setExpanded((current) => {
                  const next = new Set(current)
                  if (next.has(message.id)) next.delete(message.id)
                  else next.add(message.id)
                  return next
                })
              }}
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

function MobileMessageCard({
  threadKey,
  message,
  expanded,
  newest,
  allowRemoteImages,
  onToggle,
}: {
  threadKey: string
  message: Message
  expanded: boolean
  newest: boolean
  allowRemoteImages: boolean
  onToggle: () => void
}) {
  return (
    <article className={`mobile-message-card${expanded ? ' is-expanded' : ''}`}>
      <button className="mobile-message-header" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="mobile-avatar">{displayName(message.from).slice(0, 1).toUpperCase()}</span>
        <span className="mobile-message-meta">
          <strong>{displayName(message.from)}</strong>
          <span>{expanded ? `to ${message.to.map(displayName).join(', ') || 'me'}` : message.snippet}</span>
        </span>
        <time>{relativeTime(message.date, Date.now())}</time>
        <ChevronRight className="mobile-message-chevron" size={17} />
      </button>
      {expanded && (
        <div className="mobile-message-content">
          <SafeMessageBody message={message} allowRemoteImages={allowRemoteImages} />
          {message.attachments.length > 0 && (
            <MobileAttachments threadKey={threadKey} message={message} />
          )}
          {newest && <span className="mobile-newest-label">Newest message</span>}
        </div>
      )}
    </article>
  )
}

function SafeMessageBody({ message, allowRemoteImages }: { message: Message; allowRemoteImages: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(160)
  const raw = message.bodyHtml ?? paragraphsToHtml(message.bodyText ?? '')
  const sanitized = useMemo(
    () => sanitizeBody(raw, { allowRemoteImages }),
    [raw, allowRemoteImages],
  )
  const srcDoc = useMemo(
    () => buildSrcdoc(sanitized.html, { allowRemoteImages: allowRemoteImages && sanitized.remoteImages > 0 }),
    [sanitized, allowRemoteImages],
  )

  useEffect(() => {
    const element = frame.current
    if (!element) return
    let observer: ResizeObserver | null = null
    const measure = () => {
      const doc = element.contentDocument
      if (!doc) return
      setHeight(Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)))
    }
    const load = () => {
      measure()
      const doc = element.contentDocument
      if (!doc?.documentElement) return
      observer = new ResizeObserver(measure)
      observer.observe(doc.documentElement)
      if (doc.body) observer.observe(doc.body)
    }
    element.addEventListener('load', load)
    if (element.contentDocument?.readyState === 'complete') load()
    return () => {
      element.removeEventListener('load', load)
      observer?.disconnect()
    }
  }, [srcDoc])

  return (
    <iframe
      ref={frame}
      className="mobile-message-body"
      title={message.subject || 'Message body'}
      sandbox="allow-same-origin allow-top-navigation-by-user-activation"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      tabIndex={-1}
      style={{ height }}
    />
  )
}

function MobileAttachments({ threadKey, message }: { threadKey: string; message: Message }) {
  const images = message.attachments.filter((attachment) => isPreviewableImage(attachment.mimeType))
  const files = message.attachments.filter((attachment) => !isPreviewableImage(attachment.mimeType))
  return (
    <div className="mobile-attachments">
      {images.length > 0 && (
        <div className="mobile-image-grid">
          {images.map((attachment) => (
            <AttachmentImage key={attachment.id} threadKey={threadKey} message={message} attachmentId={attachment.id} />
          ))}
        </div>
      )}
      {files.map((attachment) => (
        <div className="mobile-attachment-chip" key={attachment.id}>
          <Paperclip size={16} />
          <span>{attachment.filename}</span>
          <small>{formatBytes(attachment.sizeBytes)}</small>
        </div>
      ))}
    </div>
  )
}

function AttachmentImage({
  threadKey,
  message,
  attachmentId,
}: {
  threadKey: string
  message: Message
  attachmentId: string
}) {
  const service = useMailService()
  const [url, setUrl] = useState<string | null>(null)
  const attachment = message.attachments.find((item) => item.id === attachmentId)
  useEffect(() => {
    if (!attachment) return
    let alive = true
    void service.getAttachment(threadKey, message.id, attachment.id).then((bytes) => {
      if (alive) setUrl(toDataUrl(bytes, attachment.mimeType))
    })
    return () => {
      alive = false
    }
  }, [service, threadKey, message.id, attachment])
  return url ? <img src={url} alt={attachment?.filename ?? 'Attachment'} /> : <div className="mobile-image-placeholder" />
}

function SearchScreen({
  query,
  onQuery,
  onOpen,
}: {
  query: string
  onQuery: (query: string) => void
  onOpen: (key: string) => void
}) {
  const results = useSearch(query)
  const { selfEmails } = useAccountsById()
  const now = useNow()
  return (
    <section className="mobile-screen" aria-label="Search">
      <header className="mobile-nav mobile-search-nav">
        <h1>Search</h1>
        <label className="mobile-search-input">
          <Search size={18} aria-hidden />
          <span className="sr-only">Search mail</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search mail"
            spellCheck={false}
            autoComplete="off"
          />
          {query && <button type="button" onClick={() => onQuery('')} aria-label="Clear search"><X size={16} /></button>}
        </label>
        <div className="mobile-operator-strip" aria-label="Search operators">
          {SEARCH_OPERATORS.map((operator) => (
            <button
              key={operator}
              type="button"
              onClick={() => onQuery(`${query}${query && !query.endsWith(' ') ? ' ' : ''}${operator}`)}
            >
              {operator}
            </button>
          ))}
        </div>
      </header>
      <div className="mobile-scroll mobile-search-results">
        {query.trim().length < MIN_SEARCH_LENGTH ? (
          <MobilePrompt icon={<Search size={26} />} title="Find anything" copy="Search people, subjects, words, or use an operator above." />
        ) : results.isPending ? (
          <MobileListSkeleton />
        ) : (results.data?.length ?? 0) === 0 ? (
          <MobilePrompt icon={<Search size={26} />} title="No results" copy="Try fewer words or a different operator." />
        ) : (
          <div className="mobile-thread-list">
            {results.data?.map((thread) => {
              const row = buildMobileRowModel(thread, selfEmails, now)
              return (
                <button className="mobile-search-result" type="button" key={thread.key} onClick={() => onOpen(thread.key)}>
                  <span className="mobile-search-result-copy">
                    <strong>{row.sender}</strong>
                    <span>{row.subject}</span>
                    <small>{row.snippet}</small>
                  </span>
                  <time>{row.time}</time>
                  <ChevronRight size={17} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function SettingsScreen() {
  const { accounts } = useAccountsById()
  const settings = useSettings()
  const save = useSaveSettings()
  const current = settings.data
  return (
    <section className="mobile-screen mobile-settings" aria-label="Settings">
      <header className="mobile-nav mobile-simple-nav"><h1>Settings</h1></header>
      <div className="mobile-scroll mobile-settings-scroll">
        <SettingsGroup title="Accounts">
          {accounts.map((account) => (
            <SettingsRow key={account.id} icon={<UserRound size={19} />} title={account.displayName} detail={account.email} />
          ))}
        </SettingsGroup>
        <SettingsGroup title="Appearance">
          <div className="mobile-theme-picker" role="group" aria-label="Appearance">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                className={current?.theme === theme ? 'is-active' : ''}
                onClick={() => save.mutate({ theme })}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </SettingsGroup>
        <SettingsGroup title="Messages">
          <SettingsToggle
            icon={<ImageIcon size={19} />}
            title="Load images"
            checked={(current?.imagePolicy ?? 'allow') === 'allow'}
            onChange={(checked) => save.mutate({ imagePolicy: checked ? 'allow' : 'block' })}
          />
          <SettingsToggle
            icon={<Volume2 size={19} />}
            title="Sounds"
            checked={current?.sounds ?? false}
            onChange={(sounds) => save.mutate({ sounds })}
          />
        </SettingsGroup>
        <SettingsGroup title="Maru account">
          <SettingsRow icon={<Mail size={19} />} title="Maru account" detail="Coming with sync" />
        </SettingsGroup>
        <SettingsGroup title="About">
          <SettingsRow icon={<Info size={19} />} title="Maru for iPhone" detail="Version 0.1.7 · Demo mode" />
        </SettingsGroup>
      </div>
    </section>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mobile-settings-group"><h2>{title}</h2><div>{children}</div></section>
}

function SettingsRow({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="mobile-settings-row">
      <span className="mobile-settings-icon">{icon}</span>
      <span><strong>{title}</strong><small>{detail}</small></span>
    </div>
  )
}

function SettingsToggle({
  icon,
  title,
  checked,
  onChange,
}: {
  icon: ReactNode
  title: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="mobile-settings-row mobile-toggle-row">
      <span className="mobile-settings-icon">{icon}</span>
      <span><strong>{title}</strong></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="mobile-switch" aria-hidden><span /></span>
    </label>
  )
}

function ComposeSheet({ seed, onClose }: { seed: ComposeSeed; onClose: () => void }) {
  const service = useMailService()
  const { accounts } = useAccountsById()
  const [draft, setDraft] = useState(seed)
  const [showCopies, setShowCopies] = useState(Boolean(seed.cc || seed.bcc))
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const dirty = Boolean(draft.to || draft.cc || draft.bcc || draft.subject || draft.body || attachments.length)

  const close = () => {
    if (dirty && !window.confirm('Discard this draft? Your message will be lost.')) return
    onClose()
  }

  const send = async () => {
    const to = parseAddresses(draft.to)
    const cc = parseAddresses(draft.cc)
    const bcc = parseAddresses(draft.bcc)
    const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid]
    if (invalid.length > 0) return setError(`Check this address: ${invalid[0]}`)
    if (to.addresses.length === 0) return setError('Add at least one recipient.')
    setSending(true)
    setError('')
    try {
      await service.send({
        accountId: draft.accountId || accounts[0]?.id || '',
        to: to.addresses,
        cc: cc.addresses,
        bcc: bcc.addresses,
        subject: draft.subject,
        bodyHtml: `${paragraphsToHtml(draft.body)}${draft.quoteHtml}`,
        attachments,
        reply: draft.reply,
      })
      onClose()
    } catch (cause) {
      setSending(false)
      setError(cause instanceof Error ? cause.message : 'Message could not be sent.')
    }
  }

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const next = await Promise.all([...files].map(fileToAttachment))
    setAttachments((current) => [...current, ...next])
  }

  return (
    <div className="mobile-sheet-layer" role="presentation">
      <section className="mobile-compose-sheet" role="dialog" aria-modal="true" aria-label="Compose message">
        <header className="mobile-sheet-nav">
          <button type="button" className="mobile-nav-text" onClick={close}>Cancel</button>
          <h2>{draft.reply ? 'Reply' : 'New Message'}</h2>
          <button type="button" className="mobile-send-button" disabled={sending} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </header>
        <form className="mobile-compose-form" onSubmit={(event) => { event.preventDefault(); void send() }}>
          <label className="mobile-compose-field">
            <span>From</span>
            <select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>)}
            </select>
          </label>
          <label className="mobile-compose-field">
            <span>To</span>
            <input type="email" inputMode="email" multiple value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} autoComplete="off" />
            <button type="button" onClick={() => setShowCopies((open) => !open)}>Cc/Bcc</button>
          </label>
          {showCopies && (
            <>
              <label className="mobile-compose-field"><span>Cc</span><input type="email" inputMode="email" multiple value={draft.cc} onChange={(event) => setDraft({ ...draft, cc: event.target.value })} autoComplete="off" /></label>
              <label className="mobile-compose-field"><span>Bcc</span><input type="email" inputMode="email" multiple value={draft.bcc} onChange={(event) => setDraft({ ...draft, bcc: event.target.value })} autoComplete="off" /></label>
            </>
          )}
          <label className="mobile-compose-field"><span>Subject</span><input type="text" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></label>
          <label className="mobile-compose-body">
            <span className="sr-only">Message</span>
            <textarea
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void send()
              }}
              placeholder="Write a message…"
            />
          </label>
          {attachments.length > 0 && (
            <div className="mobile-draft-attachments">
              {attachments.map((attachment, index) => (
                <span key={`${attachment.filename}-${index}`}>
                  <Paperclip size={15} />{attachment.filename}
                  <button type="button" aria-label={`Remove ${attachment.filename}`} onClick={() => setAttachments((current) => current.filter((_, at) => at !== index))}><X size={15} /></button>
                </span>
              ))}
            </div>
          )}
          {error && <p className="mobile-form-error" role="alert">{error}</p>}
          <div className="mobile-compose-footer">
            <label className="mobile-attach-button">
              <Paperclip size={19} />
              <span>Add attachment</span>
              <input type="file" multiple onChange={(event) => void addFiles(event.target.files)} />
            </label>
            <button type="button" className="mobile-discard-button" onClick={close} aria-label="Discard draft"><Trash2 size={19} /></button>
          </div>
        </form>
      </section>
    </div>
  )
}

async function fileToAttachment(file: File): Promise<OutgoingAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataBase64: toDataUrl(bytes, file.type || 'application/octet-stream').split(',')[1] ?? '',
  }
}

function LaterSheet({ count, onClose, onPick }: { count: number; onClose: () => void; onPick: (wakeAt: number) => void }) {
  const now = useNow()
  const presets = useMemo(() => deferPresets(now), [now])
  const dateValue = (timestamp: number) => {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  return (
    <BottomSheet title={count > 1 ? `Save ${count} threads for later` : 'Save for later'} onClose={onClose}>
      <div className="mobile-later-options">
        {presets.map((preset) => (
          <button type="button" key={preset.id} onClick={() => onPick(preset.wakeAt)}>
            <span className="mobile-sheet-icon"><Clock3 size={19} /></span>
            <span><strong>{preset.label}</strong><small>{preset.detail}</small></span>
            <ChevronRight size={17} />
          </button>
        ))}
        <label className="mobile-custom-date">
          <span className="mobile-sheet-icon"><Clock3 size={19} /></span>
          <span><strong>Pick a date</strong><small>Up to {MAX_DEFER_DAYS} days</small></span>
          <input
            type="date"
            aria-label="Bring it back on"
            min={dateValue(now + 86_400_000)}
            max={dateValue(maxDeferAt(now))}
            onChange={(event) => {
              const [year, month, day] = event.target.value.split('-').map(Number)
              if (year && month && day) onPick(deferAtDate(year, month - 1, day))
            }}
          />
        </label>
      </div>
      <p className="mobile-later-note">Later is on this iPhone. Gmail elsewhere still shows these in your inbox.</p>
    </BottomSheet>
  )
}

function ThreadActionsSheet({
  thread,
  onClose,
  onAction,
  onLater,
  onMove,
}: {
  thread: Thread
  onClose: () => void
  onAction: (action: MailActionType) => void
  onLater: () => void
  onMove: () => void
}) {
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

function MoveSheet({ onClose, onMove }: { onClose: () => void; onMove: (action: MailActionType) => void }) {
  return (
    <BottomSheet title="Move thread" onClose={onClose}>
      <div className="mobile-action-list">
        <SheetAction icon={<Inbox size={19} />} label="Inbox" onClick={() => onMove('unarchive')} />
        <SheetAction icon={<Trash2 size={19} />} label="Trash" destructive onClick={() => onMove('trash')} />
      </div>
    </BottomSheet>
  )
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="mobile-sheet-layer mobile-bottom-layer" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="mobile-bottom-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="mobile-sheet-grabber" aria-hidden />
        <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        {children}
      </section>
    </div>
  )
}

function SheetAction({ icon, label, destructive = false, onClick }: { icon: ReactNode; label: string; destructive?: boolean; onClick: () => void }) {
  return <button className={destructive ? 'is-destructive' : ''} type="button" onClick={onClick}><span className="mobile-sheet-icon">{icon}</span><span>{label}</span><ChevronRight size={17} /></button>
}

function ToolbarButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label}>{icon}</button>
}

function TabBar({ active, onChange }: { active: MobileTab; onChange: (tab: MobileTab) => void }) {
  const items: { id: MobileTab; label: string; icon: ReactNode }[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={22} /> },
    { id: 'search', label: 'Search', icon: <Search size={22} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={22} /> },
  ]
  return (
    <nav className="mobile-tab-bar" aria-label="Primary navigation">
      {items.map((item) => (
        <button key={item.id} type="button" className={active === item.id ? 'is-active' : ''} onClick={() => onChange(item.id)} aria-current={active === item.id ? 'page' : undefined}>
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function EmptyInbox() {
  const reduced = useReducedMotion()
  return (
    <div className="mobile-empty-state">
      <WrenPerched alive={!reduced} className="mobile-empty-wren" />
      <h2>All caught up</h2>
      <p>New mail will land here. Until then, Maru is keeping watch.</p>
    </div>
  )
}

function MobileListSkeleton() {
  return <div className="mobile-list-skeleton" aria-label="Loading"><span /><span /><span /><span /><span /></div>
}

function MobilePrompt({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return <div className="mobile-prompt"><span>{icon}</span><h2>{title}</h2><p>{copy}</p></div>
}
