import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import type { MailView, Thread } from '@/core/types'
import { SEARCH_OPERATOR_HINTS } from '@/core/search/operators'
import { useAccountsById, useThreads } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useNow } from '@/lib/use-now'
import { EmptyInbox, MobileListSkeleton } from '../components/placeholders'
import { MobileIcon } from '../components/mobile-icon'
import { SwipeThreadRow } from '../components/swipe-thread-row'
import { buildMobileRowModel } from '../state'
import { usePullRefresh } from '../use-pull-refresh'

const MOBILE_ROW_ROOT_MULTIPLIER = 5.5
const SWIPE_HINT_ID = 'mobile-inbox-gesture-hint'

/**
 * The inbox. It is mounted for the life of the phone shell and hidden while
 * another screen is on top of it — docs/IOS.md, "The inbox stays mounted" —
 * so `hidden` is not a styling detail here. It is the switch that parks the
 * virtualizer, and `readScrollTop` is how the virtualizer finds its way back.
 */
export function InboxScreen({
  hidden,
  readScrollTop,
  onOpen,
  onCompose,
  onSearch,
  onArchive,
  onLater,
  onContext,
  onStar,
}: {
  hidden: boolean
  readScrollTop: () => number
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
  const [rootFontSizePx, setRootFontSizePx] = useState(readRootFontSize)
  const region = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [listTop, setListTop] = useState(0)
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
  // The window, not a container. UIKit minimizes the Liquid Glass tab bar off
  // the WKWebView's own scroll view, so the inbox has to move the document
  // (mobile.css). `scrollMargin` is what tells the virtualizer how far the list
  // starts below the top of the page — the sticky header and the pull
  // indicator sit above it.
  //
  // `enabled` is the whole of the hidden state, and it is doing three jobs.
  // It drops the window scroll listener, so a thread's scrolling does not
  // re-render a screen nobody can see. It disconnects the row ResizeObserver,
  // which would otherwise measure every row of a `display: none` list as zero
  // pixels tall and cache that. And the size it reports falls to zero, so the
  // range empties and no row is rendered at all. What survives is the only
  // thing worth keeping: the measured height of every row already seen.
  //
  // Turning it back on clears the remembered offset, so `initialOffset` is
  // asked again — one render before `useRouteScroll` restores the page. That
  // is why it is `readScrollTop` and not `window.scrollY`: the first frame of
  // the return is drawn for the offset the page is going to, not the one it is
  // leaving. `initialRect` is asked in the same breath, and answering it with
  // the real viewport keeps that first frame a full screen of rows rather than
  // an empty one waiting on a resize callback.
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => MOBILE_ROW_ROOT_MULTIPLIER * rootFontSizePx,
    getItemKey: (index) => rows[index].thread.key,
    overscan: 8,
    scrollMargin: listTop,
    enabled: !hidden,
    initialOffset: readScrollTop,
    initialRect: viewportRect(),
  })
  // Measured rather than assumed: the header grows with Dynamic Type and with
  // the Edit row. Those are the only things that move the list's top, so they
  // are the dependencies — re-measuring on every render costs a layout read
  // per frame of a scroll and never returns a different number. React bails
  // out when the value is unchanged, so this settles in one pass.
  // `hidden` is a dependency and a guard: a hidden screen has no box, so
  // `offsetTop` reads zero, and a refetch that lands behind a thread would
  // otherwise overwrite the real measurement with it. Re-measured on the way
  // back, before the page is restored, because `offsetTop` does not depend on
  // where the page is scrolled to.
  useLayoutEffect(() => {
    if (hidden) return
    const top = list.current?.offsetTop ?? 0
    setListTop((current) => (current === top ? current : top))
  }, [hidden, rootFontSizePx, editing, query.isPending, rows.length === 0])
  useEffect(() => {
    const update = () => setRootFontSizePx(readRootFontSize())
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    const probe = document.createElement('span')
    probe.className = 'mobile-root-font-probe'
    document.body.append(probe)
    observer?.observe(probe)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      probe.remove()
    }
  }, [])
  useEffect(() => virtualizer.measure(), [rootFontSizePx, virtualizer])
  const { refreshing, drag } = usePullRefresh(region, async () => {
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
    <section className="mobile-screen" aria-label="Inbox" hidden={hidden} inert={hidden}>
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
          <button className="mobile-round-button mobile-press" type="button" onClick={onCompose} aria-label="Compose"><MobileIcon name="compose" scale="action" /></button>
        </div>
        <button className="mobile-search-field" type="button" onClick={onSearch}>
          <MobileIcon name="search" /><span>Search mail</span><kbd>{SEARCH_OPERATOR_HINTS[0]}</kbd>
        </button>
      </header>

      <div ref={region} className="mobile-scroll mobile-inbox-scroll" {...drag}>
        <div className="mobile-pull-indicator" aria-live="polite">
          <MobileIcon name="sync" className={refreshing ? 'is-spinning' : ''} scale="action" />
          <span className="mobile-pull-copy">Pull to refresh</span>
          <span className="mobile-pull-ready-copy">Release to refresh</span>
          <span className="mobile-refreshing-copy">Refreshing…</span>
        </div>
        {query.isPending ? <MobileListSkeleton /> : rows.length === 0 ? <EmptyInbox /> : (
          <div ref={list} className="mobile-thread-list" aria-describedby={SWIPE_HINT_ID} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  ref={virtualizer.measureElement}
                  className="mobile-virtual-row"
                  data-index={virtualRow.index}
                  key={row.thread.key}
                  style={{ transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)` }}
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
      <p className="sr-only" id={SWIPE_HINT_ID}>Swipe right to archive or left to save for later. Long press for more actions.</p>

      {editing && (
        <div className="mobile-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
          <button type="button" disabled={selected.size === 0} onClick={() => onArchive(selectedKeys)}><MobileIcon name="archive" scale="action" /><span>Archive</span></button>
          <button type="button" disabled={selected.size === 0} onClick={() => onLater(selectedKeys)}><MobileIcon name="calendar" scale="action" /><span>Later</span></button>
          <button type="button" disabled={selected.size === 0} onClick={stopEditing}><MobileIcon name="check" scale="action" /><span>Done</span></button>
        </div>
      )}
    </section>
  )
}

function viewportRect(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return { width: window.innerWidth, height: window.innerHeight }
}

function readRootFontSize(): number {
  if (typeof document === 'undefined') return 16
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}
