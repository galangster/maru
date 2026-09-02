import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import type { IconName } from '@/components/ui/icon'
import { viewLabel } from '@/core/defaults'
import type { MailView, Thread } from '@/core/types'
import { SEARCH_OPERATOR_HINTS } from '@/core/search/operators'
import type { BulkActionType } from '@/features/list/bulk'
import { emptyCopyFor } from '@/features/list/inbox-zero'
import { LATER_DISCLOSURE } from '@/features/list/later-picker'
import { useAccountsById, useThreads } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { isUrgent } from '@/features/sidebar/sync-summary'
import { useSyncSummary } from '@/features/sidebar/use-sync-summary'
import { useNow } from '@/lib/use-now'
import { EmptyInbox, MobileListSkeleton, MobilePrompt } from '../components/placeholders'
import { MobileIcon } from '../components/mobile-icon'
import { SwipeThreadRow } from '../components/swipe-thread-row'
import { mailboxIcon } from '../mailboxes'
import {
  buildMobileRowModel,
  deferTarget,
  hasListToSelect,
  type DeferTarget,
  type MobileRowModel,
} from '../state'
import { batchActions, gestureHint, removeChrome, type MobileThreadActions } from '../thread-actions'
import { usePullRefresh } from '../use-pull-refresh'

const MOBILE_ROW_ROOT_MULTIPLIER = 5.5
const SWIPE_HINT_ID = 'mobile-inbox-gesture-hint'

/** One button of the Edit bar. `later` is not a `BulkActionType` and never
 *  will be — `runBatchDefer` is `runBatchAction`'s sibling, not a member of
 *  it — so it is spelled out here rather than smuggled through as `null`. */
interface BulkVerb {
  /**
   * Which of the five buttons this is, and never what it does.
   *
   * The bar has five fixed slots. The first one's verb changes with the batch
   * — Archive in the inbox, Move to Inbox in Trash — and keying the button by
   * the verb unmounted and remounted it every time the selection crossed that
   * line, which throws away its pressed state mid-tap.
   */
  slot: 'remove' | 'later' | 'trash' | 'read' | 'unread'
  verb: BulkActionType | 'later'
  icon: IconName
  label: string
  /** Whether the verb would do anything to every conversation checked. */
  available: boolean
}

/**
 * The Edit bar, in the order the thumb reads it, for the batch that is checked.
 *
 * A function of the batch rather than a constant, because three of the five
 * verbs depend on where the conversations are. In Trash, Archive is Move to
 * Inbox and Trash itself does nothing; in Sent, neither Archive nor Later
 * means anything unless the conversation is also in the inbox. The bar used to
 * offer all five everywhere and report success for all five (issue 48).
 *
 * The types stay `BulkActionType`, so bulk.ts still decides what a batch may
 * take and a verb it refuses will not compile — Star included.
 *
 * There is no "Done" here either. Edit's own control in the nav row already
 * says Done, and the room a duplicate would take is what Trash, Read and
 * Unread now use.
 */
function bulkVerbs(batch: MobileThreadActions): readonly BulkVerb[] {
  // `removeChrome` names the button while nothing is checked too, where every
  // verb is disabled anyway and "Archive" is the honest thing for it to read.
  const remove = removeChrome(batch.remove)
  return [
    { slot: 'remove', verb: batch.remove ?? 'archive', icon: remove.icon, label: remove.label, available: batch.remove !== null },
    { slot: 'later', verb: 'later', icon: 'calendar', label: 'Later', available: batch.defer },
    { slot: 'trash', verb: 'trash', icon: 'trash', label: 'Trash', available: batch.trash },
    { slot: 'read', verb: 'markRead', icon: 'read', label: 'Read', available: true },
    { slot: 'unread', verb: 'markUnread', icon: 'unread', label: 'Unread', available: true },
  ]
}

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
  onSettings,
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
  onAct: (keys: string[], type: BulkActionType) => void
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
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rootFontSizePx, setRootFontSizePx] = useState(readRootFontSize)
  const region = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [listTop, setListTop] = useState(0)
  const now = useNow()
  const service = useMailService()
  // Inbox zero earns the character; an empty Sent or an empty label does not.
  const isInbox = view.kind !== 'later' && viewLabel(view) === 'INBOX'
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
  // What this mailbox's rows actually answer to a finger, read by the hidden
  // help below the list (issue 63). Keyed on the threads rather than on the
  // rows: `rows` is rebuilt by the minute tick for its relative times, and
  // what a mailbox's gestures are does not change on the clock.
  const hint = useMemo(() => gestureHint(batchActions(threads)), [threads])
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
  // The Edit bar, and everything it needs, or `null` while it is not up.
  //
  // Derived from the rows, the way the desktop derives its own batch (bulk.ts,
  // `checkedInView`): a checkmark on a conversation the list no longer shows
  // is not part of the batch. Archive and Later therefore behave the same —
  // whatever leaves the list leaves the selection with it — rather than one of
  // them clearing up after itself and the other not.
  //
  // Behind a memo, and behind `editing`, because this screen re-renders on the
  // minute tick and on every mail event for the whole life of the app, and
  // outside selection mode all of it was a scan of every row and an
  // intersection over nothing, for a bar that is not on the screen.
  const editBar = useMemo(() => {
    if (!editing) return null
    const checked = rows.filter((row) => selected.has(row.thread.key))
    // What the whole batch will accept, resolved the same way each row
    // resolves its own swipes — the intersection over what is checked.
    return { checked, verbs: bulkVerbs(batchActions(checked.map((row) => row.thread))) }
  }, [editing, rows, selected])

  return (
    <section className="mobile-screen" aria-label={title} hidden={paused}>
      <header ref={header} className="mobile-nav mobile-inbox-nav">
        <div className="mobile-nav-row">
          {/* The account lens that used to sit here is gone: it offered three
              inboxes and nothing else (issue 21), and the title below now
              opens every place mail can be, its own three included. */}
          <div className="mobile-nav-row-end">
            {editing && rows.length > 0 && <button className="mobile-nav-text" type="button" onClick={() => setSelected(new Set(rows.map((row) => row.thread.key)))}>Select All</button>}
            {/* No list, no mode to enter. Without this the empty inbox kept an
                Edit control that could only put an all-disabled bulk bar on the
                screen and then take it away again. */}
            {(editing || listToSelect) && <button className="mobile-nav-text" type="button" onClick={() => editing ? stopEditing() : setEditing(true)}>{editing ? 'Done' : 'Edit'}</button>}
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
        {paused ? null : query.isPending ? <MobileListSkeleton /> : rows.length === 0 ? (
          isInbox ? <EmptyInbox /> : <EmptyMailbox view={view} title={title} />
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
                    onRemove={(type) => onAct([row.thread.key], type)}
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
      <p className="sr-only" id={SWIPE_HINT_ID}>{hint}</p>

      {editBar && (
        <div className="mobile-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
          {editBar.verbs.map((verb) => (
            <button
              key={verb.slot}
              type="button"
              disabled={editBar.checked.length === 0 || !verb.available}
              onClick={() =>
                verb.verb === 'later'
                  ? onLater(editBar.checked.map((row) => deferTarget(row.thread)))
                  : onAct(editBar.checked.map((row) => row.thread.key), verb.verb)
              }
            >
              <MobileIcon name={verb.icon} scale="action" /><span>{verb.label}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Every mailbox but the inbox, empty. The copy is the desktop's own table
 * (inbox-zero.ts, phone column) and the glyph is the same one the picker drew
 * the row with, so a mailbox looks like itself wherever it is empty.
 */
function EmptyMailbox({ view, title }: { view: MailView; title: string }) {
  const copy = emptyCopyFor(view, title, 'phone')
  return (
    <MobilePrompt
      icon={<MobileIcon name={mailboxIcon(view)} scale="hero" />}
      title={copy.title}
      copy={copy.subtitle}
    />
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
