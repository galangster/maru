import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Archive, Check, Clock3, PenLine, RefreshCw, Search } from 'lucide-react'

import type { MailView, Thread } from '@/core/types'
import { SEARCH_OPERATOR_HINTS } from '@/core/search/operators'
import { useAccountsById, useThreads } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useNow } from '@/lib/use-now'
import { EmptyInbox, MobileListSkeleton } from '../components/placeholders'
import { SwipeThreadRow } from '../components/swipe-thread-row'
import { buildMobileRowModel } from '../state'
import { usePullRefresh } from '../use-pull-refresh'
import './inbox-screen.css'

const MOBILE_ROW_HEIGHT = 88

export function InboxScreen({
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
  const scroller = useRef<HTMLDivElement>(null)
  const now = useNow()
  const service = useMailService()
  const view: MailView = accountId === 'all'
    ? { kind: 'unified', folder: 'inbox' }
    : { kind: 'account', accountId, labelId: 'INBOX' }
  const query = useThreads(view)
  const threads = query.data ?? []
  const rows = useMemo(
    () => threads.map((thread) => ({ thread, model: buildMobileRowModel(thread, selfEmails, now) })),
    [threads, selfEmails, now],
  )
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => MOBILE_ROW_HEIGHT,
    getItemKey: (index) => rows[index].thread.key,
    overscan: 8,
  })
  const { refreshing, drag } = usePullRefresh(scroller, async () => {
    await service.refresh()
    await query.refetch()
  })

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const stopEditing = () => { setEditing(false); setSelected(new Set()) }
  const selectedKeys = [...selected]

  return (
    <section className="mobile-screen" aria-label="Inbox">
      <header className="mobile-nav mobile-inbox-nav">
        <div className="mobile-nav-row">
          <label className="mobile-account-lens">
            <span className="sr-only">Account lens</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} aria-label="Account lens">
              <option value="all">All inboxes</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
            </select>
          </label>
          {editing && threads.length > 0 && <button className="mobile-nav-text" type="button" onClick={() => setSelected(new Set(threads.map((thread) => thread.key)))}>Select All</button>}
          <button className="mobile-nav-text" type="button" onClick={() => editing ? stopEditing() : setEditing(true)}>{editing ? 'Done' : 'Edit'}</button>
        </div>
        <div className="mobile-title-row">
          <h1>Inbox</h1>
          <button className="mobile-round-button mobile-press" type="button" onClick={onCompose} aria-label="Compose"><PenLine size={20} strokeWidth={2} /></button>
        </div>
        <button className="mobile-search-field" type="button" onClick={onSearch}>
          <Search size={17} aria-hidden /><span>Search mail</span><kbd>{SEARCH_OPERATOR_HINTS[0]}</kbd>
        </button>
      </header>

      <div ref={scroller} className="mobile-scroll mobile-inbox-scroll" {...drag}>
        <div className="mobile-pull-indicator" aria-live="polite">
          <RefreshCw className={refreshing ? 'is-spinning' : ''} size={20} />
          <span className="mobile-pull-copy">Pull to refresh</span>
          <span className="mobile-pull-ready-copy">Release to refresh</span>
          <span className="mobile-refreshing-copy">Refreshing…</span>
        </div>
        {query.isPending ? <MobileListSkeleton /> : rows.length === 0 ? <EmptyInbox /> : (
          <div className="mobile-thread-list" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  ref={virtualizer.measureElement}
                  className="mobile-virtual-row"
                  data-index={virtualRow.index}
                  key={row.thread.key}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <SwipeThreadRow
                    thread={row.thread}
                    model={row.model}
                    editing={editing}
                    selected={selected.has(row.thread.key)}
                    onSelect={() => toggle(row.thread.key)}
                    onOpen={() => onOpen(row.thread.key)}
                    onArchive={() => onArchive([row.thread.key])}
                    onLater={() => onLater([row.thread.key])}
                    onContext={() => onContext(row.thread)}
                    onStar={() => onStar(row.thread)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editing && (
        <div className="mobile-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
          <button type="button" disabled={selected.size === 0} onClick={() => onArchive(selectedKeys)}><Archive size={20} /><span>Archive</span></button>
          <button type="button" disabled={selected.size === 0} onClick={() => onLater(selectedKeys)}><Clock3 size={20} /><span>Later</span></button>
          <button type="button" disabled={selected.size === 0} onClick={stopEditing}><Check size={20} /><span>Done</span></button>
        </div>
      )}
    </section>
  )
}
