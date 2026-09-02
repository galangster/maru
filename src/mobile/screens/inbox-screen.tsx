import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import type { MailView, Thread } from '@/core/types'
import { SEARCH_OPERATOR_HINTS } from '@/core/search/operators'
import { useAccountsById, useThreads } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { isUrgent } from '@/features/sidebar/sync-summary'
import { useSyncSummary } from '@/features/sidebar/use-sync-summary'
import { useNow } from '@/lib/use-now'
import { EmptyInbox, MobileListSkeleton } from '../components/placeholders'
import { MobileIcon } from '../components/mobile-icon'
import { SwipeThreadRow } from '../components/swipe-thread-row'
import {
  buildMobileRowModel,
  deferTarget,
  hasListToSelect,
  type DeferTarget,
  type MobileRowModel,
} from '../state'
import { usePullRefresh } from '../use-pull-refresh'

const MOBILE_ROW_ROOT_MULTIPLIER = 5.5
const SWIPE_HINT_ID = 'mobile-inbox-gesture-hint'

interface InboxRow {
  thread: Thread
  model: MobileRowModel
}

/**
 * The inbox. It is the one screen the stage keeps mounted, so instead of
 * unmounting it the stage pauses it, and this screen decides what pausing
 * means — docs/IOS.md, "The inbox stays mounted".
 */
export function InboxScreen({
  paused,
  readScrollTop,
  onOpen,
  onCompose,
  onSearch,
  onArchive,
  onLater,
  onContext,
  onStar,
  onSettings,
}: {
  paused: boolean
  readScrollTop: () => number
  onOpen: (key: string) => void
  onCompose: () => void
  onSearch: () => void
  onArchive: (keys: string[]) => void
  onLater: (targets: DeferTarget[]) => void
  onContext: (thread: Thread) => void
  onStar: (thread: Thread) => void
  onSettings: () => void
}) {
  const { accounts, selfEmails } = useAccountsById()
  // Read here rather than handed down: this screen already re-renders on the
  // minute tick for its relative times, so the summary's own tick costs it
  // nothing, and the stage above it is spared re-rendering every screen and
  // sheet once a minute for a sentence only this header draws.
  const sync = useSyncSummary(accounts)
  const [accountId, setAccountId] = useState('all')
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rootFontSizePx, setRootFontSizePx] = useState(readRootFontSize)
  const region = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [listTop, setListTop] = useState(0)
  const now = useNow()
  const service = useMailService()
  const view: MailView = accountId === 'all'
    ? { kind: 'unified', folder: 'inbox' }
    : { kind: 'account', accountId, labelId: 'INBOX' }
  const query = useThreads(view)
  const threads = query.data ?? []
  // Pausing starts here: the previous array is handed straight back, so a
  // `useNow` tick or a mail event arriving behind a thread rebuilds no row
  // model for a screen nobody can see, and the virtualizer's count and item
  // keys stay exactly where they were.
  const parked = useRef<InboxRow[]>([])
  const rows = useMemo(() => {
    if (paused) return parked.current
    parked.current = threads.map((thread) => ({ thread, model: buildMobileRowModel(thread, selfEmails, now) }))
    return parked.current
  }, [paused, threads, selfEmails, now])
  // The window, not a container. UIKit minimizes the Liquid Glass tab bar off
  // the WKWebView's own scroll view, so the inbox has to move the document
  // (mobile.css). `scrollMargin` is what tells the virtualizer how far the list
  // starts below the top of the page — the sticky header and the pull
  // indicator sit above it.
  //
  // There is deliberately no `enabled: !paused` here. That option empties the
  // measured row heights, which are the whole reason this screen stays mounted
  // — docs/IOS.md, "The inbox stays mounted", and
  // tests/mobile-inbox-virtualizer.test.ts. The instance therefore outlives
  // every screen change, so `initialOffset` and `initialRect` are asked once,
  // on the first mount, and `readScrollTop` is the reader that stays right
  // when it is asked during a render.
  const [initialRect] = useState(viewportRect)
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => MOBILE_ROW_ROOT_MULTIPLIER * rootFontSizePx,
    getItemKey: (index) => rows[index].thread.key,
    overscan: 8,
    scrollMargin: listTop,
    initialOffset: readScrollTop,
    initialRect,
  })
  // Measured rather than assumed, and observed rather than enumerated.
  //
  // The list's top is whatever sits above it, and that is everything in the
  // sticky header: Dynamic Type, the Edit row appearing, and — the one a list
  // of dependencies had already forgotten — the sync banner wrapping onto a
  // second line. So the header is observed instead of the causes being named,
  // and nothing has to remember to add the next one. React bails out when the
  // value is unchanged, so this settles in one pass.
  //
  // `list.current` is null while the screen is paused, while the skeleton is
  // up, and over the empty state, and a missing box is skipped rather than
  // measured as zero — a refetch landing behind a thread would otherwise
  // overwrite the real measurement with it. The layout effect below covers the
  // moments the list itself appears or comes back, which is the one thing a
  // ResizeObserver on the header cannot see.
  const measureListTop = useCallback(() => {
    const top = list.current?.offsetTop
    if (top === undefined) return
    setListTop((current) => (current === top ? current : top))
  }, [])
  // Re-measured on the way back, before the page is restored, because
  // `offsetTop` does not depend on where the page is scrolled to.
  useLayoutEffect(measureListTop, [measureListTop, paused, query.isPending, rows.length === 0])
  useEffect(() => {
    const update = () => {
      setRootFontSizePx(readRootFontSize())
      measureListTop()
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    const probe = document.createElement('span')
    probe.className = 'mobile-root-font-probe'
    document.body.append(probe)
    observer?.observe(probe)
    if (header.current) observer?.observe(header.current)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      probe.remove()
    }
  }, [measureListTop])
  useEffect(() => virtualizer.measure(), [rootFontSizePx, virtualizer])
  const { refreshing, drag } = usePullRefresh(region, async () => {
    await service.refresh()
    await query.refetch()
  })

  const stopEditing = useCallback(() => {
    setEditing(false)
    setSelected(new Set())
  }, [])
  // The last conversation leaves and the mode goes with it (issue 18). The
  // rule is the same pure predicate the Edit control is drawn from, so the two
  // cannot disagree about what counts as a list — including the `pending`
  // half, which is why a pull-to-refresh does not take a batch's checkmarks
  // away.
  const listToSelect = hasListToSelect(query.isPending, rows.length)
  useEffect(() => {
    if (editing && !listToSelect) stopEditing()
  }, [editing, listToSelect, stopEditing])

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  // Derived from the rows, the way the desktop derives its own batch
  // (bulk.ts, `checkedInView`): a checkmark on a conversation the list no
  // longer shows is not part of the batch. Archive and Later therefore behave
  // the same — whatever leaves the list leaves the selection with it — rather
  // than one of them clearing up after itself and the other not.
  const selectedRows = rows.filter((row) => selected.has(row.thread.key))

  return (
    <section className="mobile-screen" aria-label="Inbox" hidden={paused}>
      <header ref={header} className="mobile-nav mobile-inbox-nav">
        <div className="mobile-nav-row">
          <label className="mobile-account-lens">
            <span className="sr-only">Account lens</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} aria-label="Account lens">
              <option value="all">All inboxes</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
            </select>
          </label>
          {editing && rows.length > 0 && <button className="mobile-nav-text" type="button" onClick={() => setSelected(new Set(rows.map((row) => row.thread.key)))}>Select All</button>}
          {/* No list, no mode to enter. Without this the empty inbox kept an
              Edit control that could only put an all-disabled bulk bar on the
              screen and then take it away again. */}
          {(editing || listToSelect) && <button className="mobile-nav-text" type="button" onClick={() => editing ? stopEditing() : setEditing(true)}>{editing ? 'Done' : 'Edit'}</button>}
        </div>
        <div className="mobile-title-row">
          <h1>Inbox</h1>
          <button className="mobile-round-button mobile-press" type="button" onClick={onCompose} aria-label="Compose"><MobileIcon name="compose" scale="action" /></button>
        </div>
        <button className="mobile-search-field" type="button" onClick={onSearch}>
          <MobileIcon name="search" /><span>Search mail</span><kbd>{SEARCH_OPERATOR_HINTS[0]}</kbd>
        </button>
        {/* Mail has stopped arriving, or is about to say why it has not
            started. The sentence is `describeSync`'s — the same six the
            desktop writes, naming the account and the way back — because the
            phone had all six reaching it and drew none of them (issue 9).

            `action !== null` is the whole test: a state that offers somewhere
            to go is a state worth a row, and "Up to date" and "Syncing…" are
            not. It sits in the sticky header rather than in the list, because
            a notice you have to scroll to find is the state the report
            described. Urgency is the colour and nothing else — `stalled` is
            waiting, not an alarm, and sync-summary.ts says so. */}
        {sync.action !== null && (
          <button
            className={`mobile-sync-banner${isUrgent(sync) ? ' is-urgent' : ''}`}
            type="button"
            onClick={onSettings}
          >
            <MobileIcon name={isUrgent(sync) ? 'error' : 'sync'} scale="action" />
            <span>{sync.detail}</span>
            <MobileIcon name="chevronRight" scale="small" />
          </button>
        )}
      </header>

      <div ref={region} className="mobile-scroll mobile-inbox-scroll" {...drag}>
        <div className="mobile-pull-indicator" aria-live="polite">
          <MobileIcon name="sync" className={refreshing ? 'is-spinning' : ''} scale="action" />
          <span className="mobile-pull-copy">Pull to refresh</span>
          <span className="mobile-pull-ready-copy">Release to refresh</span>
          <span className="mobile-refreshing-copy">Refreshing…</span>
        </div>
        {/* The last refusal of the pause: no `getVirtualItems()`, no
            `getTotalSize()`, and so no row in a `display: none` list for the
            ResizeObserver to measure as zero pixels tall. */}
        {paused ? null : query.isPending ? <MobileListSkeleton /> : rows.length === 0 ? <EmptyInbox /> : (
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
                    onLater={() => onLater([deferTarget(row.thread)])}
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
          <button type="button" disabled={selectedRows.length === 0} onClick={() => onArchive(selectedRows.map((row) => row.thread.key))}><MobileIcon name="archive" scale="action" /><span>Archive</span></button>
          <button type="button" disabled={selectedRows.length === 0} onClick={() => onLater(selectedRows.map((row) => deferTarget(row.thread)))}><MobileIcon name="calendar" scale="action" /><span>Later</span></button>
          <button type="button" disabled={selectedRows.length === 0} onClick={stopEditing}><MobileIcon name="check" scale="action" /><span>Done</span></button>
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
