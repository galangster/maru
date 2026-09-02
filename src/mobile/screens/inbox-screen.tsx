import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import type { IconName } from '@/components/ui/icon'
import { FOLDERS, viewLabel } from '@/core/defaults'
import type { MailActionType, MailView, Thread } from '@/core/types'
import { SEARCH_OPERATOR_HINTS } from '@/core/search/operators'
import { LATER_DISCLOSURE } from '@/features/list/later-picker'
import { useAccountsById, useThreads } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useNow } from '@/lib/use-now'
import { EmptyInbox, MobileListSkeleton, MobilePrompt } from '../components/placeholders'
import { MobileIcon } from '../components/mobile-icon'
import { SwipeThreadRow } from '../components/swipe-thread-row'
import { emptyMailboxCopy } from '../mailboxes'
import { buildMobileRowModel, type MobileRowModel } from '../state'
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
  view,
  title,
  readScrollTop,
  onOpen,
  onCompose,
  onSearch,
  onMailboxes,
  onAct,
  onLater,
  onContext,
  onStar,
}: {
  paused: boolean
  /** Which mailbox the list is showing. Owned by the shell, picked in the sheet. */
  view: MailView
  /** What that mailbox is called. Resolved by the shell, which also names the
   *  thread screen's back control with it. */
  title: string
  readScrollTop: () => number
  onOpen: (key: string) => void
  onCompose: () => void
  onSearch: () => void
  onMailboxes: () => void
  /** One verb over one or many threads — a swipe, or the Edit bar's batch. */
  onAct: (keys: string[], type: MailActionType) => void
  onLater: (keys: string[]) => void
  onContext: (thread: Thread) => void
  onStar: (thread: Thread) => void
}) {
  const { selfEmails } = useAccountsById()
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rootFontSizePx, setRootFontSizePx] = useState(readRootFontSize)
  const region = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [listTop, setListTop] = useState(0)
  const now = useNow()
  const service = useMailService()
  // Inbox zero earns the character; an empty Sent or an empty label does not.
  const isInbox = view.kind !== 'later' && viewLabel(view) === 'INBOX'
  const emptyIcon: IconName = view.kind === 'later'
    ? 'calendar'
    : view.kind === 'unified'
      ? (FOLDERS.find((folder) => folder.folder === view.folder)?.icon ?? 'inbox')
      : 'listBullet'
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
  // Measured rather than assumed: the header grows with Dynamic Type and with
  // the Edit row. Those are the only things that move the list's top, so they
  // are the dependencies — re-measuring on every render costs a layout read
  // per frame of a scroll and never returns a different number. React bails
  // out when the value is unchanged, so this settles in one pass.
  // `paused` is a dependency and a guard: a paused screen has no box, so
  // `offsetTop` reads zero, and a refetch that lands behind a thread would
  // otherwise overwrite the real measurement with it. Re-measured on the way
  // back, before the page is restored, because `offsetTop` does not depend on
  // where the page is scrolled to.
  useLayoutEffect(() => {
    if (paused) return
    const top = list.current?.offsetTop ?? 0
    setListTop((current) => (current === top ? current : top))
  }, [paused, rootFontSizePx, editing, query.isPending, rows.length === 0])
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
    <section className="mobile-screen" aria-label={title} hidden={paused}>
      <header className="mobile-nav mobile-inbox-nav">
        <div className="mobile-nav-row">
          <div className="mobile-nav-row-end">
            {editing && threads.length > 0 && <button className="mobile-nav-text" type="button" onClick={() => setSelected(new Set(threads.map((thread) => thread.key)))}>Select All</button>}
            <button className="mobile-nav-text" type="button" onClick={() => editing ? stopEditing() : setEditing(true)}>{editing ? 'Done' : 'Edit'}</button>
          </div>
        </div>
        <div className="mobile-title-row">
          {/* The title IS the mailbox picker. The account lens that used to sit
              above it offered three inboxes and nothing else (issue 21); this
              offers every place mail can be, including the account lens's own
              three. */}
          <button className="mobile-mailbox-title mobile-press" type="button" onClick={onMailboxes} aria-haspopup="dialog" aria-label={`${title}. Choose a mailbox`}>
            <h1>{title}</h1>
            <MobileIcon name="chevronDown" scale="action" />
          </button>
          <button className="mobile-round-button mobile-press" type="button" onClick={onCompose} aria-label="Compose"><MobileIcon name="compose" scale="action" /></button>
        </div>
        {/* The disclosure, directly under the word Later, exactly where the
            desktop puts its own, and above the search field rather than
            instead of it: search is how the phone reaches everything, and the
            list's pull indicator parks under the header's last element, which
            has to be something that paints a background. Nothing dismisses it —
            dismissible means misremembered six months later. */}
        {view.kind === 'later' && <p className="mobile-later-disclosure">{LATER_DISCLOSURE}</p>}
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
        {/* The last refusal of the pause: no `getVirtualItems()`, no
            `getTotalSize()`, and so no row in a `display: none` list for the
            ResizeObserver to measure as zero pixels tall. */}
        {paused ? null : query.isPending ? <MobileListSkeleton /> : rows.length === 0 ? (
          isInbox ? <EmptyInbox /> : <MobilePrompt icon={<MobileIcon name={emptyIcon} scale="hero" />} {...emptyMailboxCopy(view, title)} />
        ) : (
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
                    onArchive={() => onAct([row.thread.key], 'archive')}
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
        /* Five verbs, and no sixth "Done": Edit's own control in the nav row
           already says Done, and the room a duplicate would take is what Trash,
           Read and Unread now use. Star is deliberately absent here for the
           same reason the desktop's batch refuses it — a bulk star is how forty
           threads end up starred and the star stops meaning anything. */
        <div className="mobile-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
          <button type="button" disabled={selected.size === 0} onClick={() => onAct(selectedKeys, 'archive')}><MobileIcon name="archive" scale="action" /><span>Archive</span></button>
          <button type="button" disabled={selected.size === 0} onClick={() => onLater(selectedKeys)}><MobileIcon name="calendar" scale="action" /><span>Later</span></button>
          <button type="button" disabled={selected.size === 0} onClick={() => onAct(selectedKeys, 'trash')}><MobileIcon name="trash" scale="action" /><span>Trash</span></button>
          <button type="button" disabled={selected.size === 0} onClick={() => onAct(selectedKeys, 'markRead')}><MobileIcon name="read" scale="action" /><span>Read</span></button>
          <button type="button" disabled={selected.size === 0} onClick={() => onAct(selectedKeys, 'markUnread')}><MobileIcon name="unread" scale="action" /><span>Unread</span></button>
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
