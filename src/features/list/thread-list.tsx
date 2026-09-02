// The middle pane: a virtualized, date-grouped thread list, and the inline
// search that temporarily replaces it.
//
// There are no hairlines in the list at all. Every row is its own inset
// rounded rect with a --wren-row-gap between it and its neighbour, and a day
// group is marked by the space its header sits in — which is what Family 1
// asked for and what the divider was a compromise against (AMIE-STUDY §5).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { Skeleton } from '@/components/ui/skeleton'
import { Icon } from '@/components/ui/icon'
import { IconButton } from '@/components/wren-controls'
import { deferSortKey, isDeferred } from '@/core/defaults'
import { SEARCH_WINDOW_DAYS } from '@/core/sync/engine'
import type { MailAction, MailActionType, Thread } from '@/core/types'
import {
  MIN_SEARCH_LENGTH,
  registerActionUndo,
  registerUndoable,
  showUndoToast,
  useAccountsById,
  useDefer,
  useLabels,
  usePerformAction,
  useSearch,
  useThreads,
  useWakeSweep,
} from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { DEFAULT_LIST_PREFS, isDefaultPrefs, useListPrefs, useUi } from '@/features/mail/ui-store'
import { ThreadResult } from '@/components/thread-result'
import { SHELL_CARD } from '@/features/shell/app-shell'
import { useSurfaces } from '@/features/shell/surface-store'
import { HeldMutations } from '@/lib/deferred'
import { announcesItself, LEAVES_THE_LIST, UNDO_LABELS } from '@/lib/undo'
import { dateGroup, wakeGroup, wakeTime, type DateGroup, type WakeGroup } from '@/lib/format'
import { DUR } from '@/lib/motion'
import { useDebounced } from '@/lib/use-debounced'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

import { EmptyState } from '@/components/empty-state'
import { bulkAction, bulkDefer, type BulkActionType } from './bulk'
import { LATER_DISCLOSURE, LaterPicker } from './later-picker'
import { labelNameFor, mailboxTitle } from '@/features/mail/mailbox-title'
import { emptyCopyFor, useInboxZeroTier } from './inbox-zero'
import { ListControls } from './list-controls'
import { FILTER_LABELS, applyListPrefs, filterEmptyCopy, nextAfterRemoval } from './list-prefs'
import { SyncNotice } from './sync-notice'
import { ThreadRow, threadRowId } from './thread-row'

const GROUP_H = 40
const ROW_H = 68

/**
 * How long the archive tick holds the mutation: --wren-dur-fast of delay plus
 * --wren-dur-base of exit, which is also exactly when the check's pop lands.
 *
 * Derived from the motion tokens rather than typed as 320, because CSS owns the
 * animation and JS owns the hold: a retuned duration used to need two edits and
 * only ever got one.
 */
const TICK_MS = Math.round((DUR.fast + DUR.base) * 1000)

type Row =
  | { kind: 'group'; key: string; label: DateGroup | WakeGroup }
  | { kind: 'thread'; key: string; thread: Thread }

/**
 * `later` groups by when each thread comes BACK, because that is the order its
 * list is in. Every other view groups by the sort key, which is the message's
 * own date except for a thread that has just woken.
 *
 * They are two closed sets and not one: `dateGroup` buckets the past and has no
 * upper bound, so a month of deferrals would all land under "Today".
 */
function buildRows(threads: Thread[], now: number, later: boolean): Row[] {
  const rows: Row[] = []
  let current: DateGroup | WakeGroup | null = null
  for (const thread of threads) {
    // Outside Later: `deferSortKey`, not `lastMessageAt` — the same expression
    // the query ordered by. A thread that came back this morning lands at the
    // top of TODAY while its timestamp column still honestly reads "Mon", and
    // that grouping IS the wake cue. There is deliberately no toast (threads
    // wake in batches at 09:00 when nobody is looking, and a toast for
    // something you scheduled yourself is nagging), no row decoration
    // (DIRECTION §10.2), and no synthetic "Back" group — position already
    // delivers the signal, and a header that appears and expires on a
    // 24-hour timer is a second thing to reason about.
    const group = later
      ? wakeGroup(thread.deferredUntil ?? now, now)
      : dateGroup(deferSortKey(thread), now)
    if (group !== current) {
      current = group
      rows.push({ kind: 'group', key: `group:${group}`, label: group })
    }
    rows.push({ kind: 'thread', key: thread.key, thread })
  }
  return rows
}

export function ThreadList() {
  const view = useUi((s) => s.view)
  const selected = useUi((s) => s.selected)
  const setSelected = useUi((s) => s.setSelected)
  const checked = useUi((s) => s.checked)
  const now = useNow()
  const service = useMailService()

  const searchOpen = useSurfaces((s) => s.searchOpen)
  const searchQuery = useSurfaces((s) => s.searchQuery)
  const debounced = useDebounced(searchQuery)
  const searching = searchOpen && debounced.trim().length >= MIN_SEARCH_LENGTH
  const results = useSearch(searchOpen ? debounced : '')

  const threads = useThreads(view)
  const { accounts, byId: accountsById, selfEmails } = useAccountsById()
  const labels = useLabels(view.kind === 'account' ? view.accountId : undefined)
  const action = usePerformAction()
  const defer = useDefer()
  // Later's lazy wake, riding the same 60-second clock every relative date on
  // screen already reads. Mounted here because the list is the surface a woken
  // thread returns TO — see queries.ts for why there is no timer.
  useWakeSweep()

  // The lens between the mailbox and the rows: per-view sort and filter.
  // Applied here, after fetch, so j/k, selection and the virtualizer all see
  // one list and cannot disagree about what "next" means.
  const prefs = useListPrefs()
  const setListPrefs = useUi((s) => s.setListPrefs)
  const lensed = !isDefaultPrefs(prefs)

  const rows = useMemo(
    () => buildRows(applyListPrefs(threads.data ?? [], prefs), now, view.kind === 'later'),
    [threads.data, prefs, now, view.kind],
  )
  const threadCount = useMemo(() => rows.filter((r) => r.kind === 'thread').length, [rows])
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index].kind === 'group' ? GROUP_H : ROW_H),
    getItemKey: (index) => rows[index].key,
    overscan: 8,
  })

  // The capture script waits on this. It goes up once the first list has data,
  // empty or not, so an empty view is still a capturable state.
  useEffect(() => {
    if (threads.isSuccess) document.documentElement.setAttribute('data-ready', 'true')
  }, [threads.isSuccess])

  // Keyboard selection has to bring its row into view.
  useEffect(() => {
    if (!selected || searching) return
    const index = rows.findIndex((r) => r.kind === 'thread' && r.thread.key === selected)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
  }, [selected, rows, virtualizer, searching])

  // The mutation object is a fresh identity on every render, so it is held in
  // a ref rather than in the callbacks' dependency lists: the two handlers
  // below have to stay referentially stable or memo(ThreadRow) never holds.
  const actionRef = useRef(action)
  actionRef.current = action
  const deferRef = useRef(defer)
  deferRef.current = defer

  // The row currently showing its archive tick, and the archives waiting out
  // their animations. AMIE-STUDY §7(c).1: the row has to still be in the data
  // while the check pops, so the action waits exactly as long as the animation
  // runs and not a frame longer.
  const [ticking, setTicking] = useState<string | null>(null)
  const [held] = useState(() => new HeldMutations())

  // A mail action must never be lost to an animation. Anything still held when
  // this pane goes away fires now, in the same turn — the same guarantee the
  // composer's held send makes, through the same helper.
  useEffect(() => () => held.flushAll(), [held])

  // The rows' copy of the advance rule: acting on the *selected* thread
  // (archive/trash from the hover cluster) selects the next visible one
  // immediately — the pane shows it while the old row animates out.
  const visibleRef = useRef<Thread[]>([])
  visibleRef.current = rows.filter((r) => r.kind === 'thread').map((r) => r.thread)

  const onSelect = useCallback(
    (thread: Thread, shiftKey: boolean) => {
      // Shift-click extends the batch from the last toggled row, both
      // directions, like every list since the Finder. It never opens the
      // thread — a range is an intent about many, not a read of one.
      const ui = useUi.getState()
      if (shiftKey && ui.checkAnchor) {
        const list = visibleRef.current
        const a = list.findIndex((t) => t.key === ui.checkAnchor)
        const b = list.findIndex((t) => t.key === thread.key)
        if (a !== -1 && b !== -1) {
          ui.checkMany(list.slice(Math.min(a, b), Math.max(a, b) + 1).map((t) => t.key))
          return
        }
      }
      // Pointer-initiated: the reading pane is licensed to animate its arrival.
      // j/k traversal passes 'keyboard' and gets a hard cut instead.
      setSelected(thread.key, 'pointer')
      if (thread.unread) actionRef.current.mutate({ type: 'markRead', threadKey: thread.key })
    },
    [setSelected],
  )

  const onCheck = useCallback((thread: Thread) => {
    useUi.getState().toggleChecked(thread.key)
  }, [])

  const onBulk = useCallback((type: BulkActionType) => {
    bulkAction((a) => actionRef.current.mutate(a), visibleRef.current, type)
  }, [])

  /** The bulk bar's Later: the picker, then one batch, then one undo. */
  const onBulkLater = useCallback(() => {
    const keys = visibleRef.current
      .filter((t) => useUi.getState().checked.has(t.key))
      .map((t) => t.key)
    useSurfaces.getState().openLater(keys, true)
  }, [])

  /**
   * The row's Later button. It opens the PICKER rather than taking a default,
   * because a mouse has no digits and wants the menu — the division the
   * keyboard makes (`h` then `1`-`5`) is not available here.
   */
  const onLaterOne = useCallback((thread: Thread) => {
    useSurfaces.getState().openLater([thread.key])
  }, [])

  const onAction = useCallback(
    (thread: Thread, type: MailActionType) => {
      if (LEAVES_THE_LIST.has(type) && useUi.getState().selected === thread.key) {
        useUi.getState().setSelected(nextAfterRemoval(visibleRef.current, thread.key), 'keyboard')
      }
      // Archive is the one action with a row-level celebration; everything else
      // goes straight through. A second archive on a row already ticking is not
      // a second celebration — it goes through as well.
      //
      // There is no reduced-motion branch here: the tick and the row's exit are
      // CSS, and the tokens the reduced-motion block zeroes already turn both
      // into a 120 ms crossfade. A JS copy of that rule was a second answer to
      // a question tokens.css had already settled.
      // Through the ref, so an undo registered now still reaches the mutation
      // that exists when the user presses ⌘Z ten seconds later.
      const mutate = (next: MailAction) => actionRef.current.mutate(next)

      if (type !== 'archive' || held.has(thread.key)) {
        const next = { type, threadKey: thread.key }
        mutate(next)
        // An action that empties the row has no row left to confirm it, so the
        // mouse gets the same sentence the keyboard does — restore from trash
        // included (issue 5). Everything else stays a silent ⌘Z: the row is
        // still there, wearing the change.
        if (announcesItself(type)) registerUndoable(mutate, next, thread.subject || '(no subject)')
        else registerActionUndo(mutate, next)
        return
      }
      setTicking(thread.key)
      const cancel = held.hold(
        thread.key,
        () => {
          setTicking((current) => (current === thread.key ? null : current))
          mutate({ type: 'archive', threadKey: thread.key })
        },
        TICK_MS,
      )

      // The archive's UNDO has two halves, and which one runs is a question of
      // *when*. Inside the tick the mutation has not been dispatched yet, so
      // undo cancels the hold and the row simply stays — nothing ever left, and
      // nothing has to be put back. After it flushes there is nothing left to
      // cancel and undo sends the reverse action, which is the whole reason
      // `unarchive` exists. Registered rather than closed over by the toast, so
      // ⌘Z reaches the same two halves.
      const undoId = `archive:${thread.key}`
      useUi.getState().registerUndo({
        id: undoId,
        label: UNDO_LABELS.archive,
        run: () => {
          if (held.has(thread.key)) {
            cancel()
            setTicking((current) => (current === thread.key ? null : current))
            return
          }
          mutate({ type: 'unarchive', threadKey: thread.key })
        },
      })

      // DIRECTION §2 (Superhuman 5): small, bottom-left, inline UNDO. The
      // affordance is on screen for the toast's own life; ⌘Z keeps offering the
      // same undo for the rest of the 10 s window. The button carries this
      // archive's id, so a second archive raises its own toast beside this one
      // rather than replacing it (issue 40).
      showUndoToast(undoId, UNDO_LABELS.archive, thread.subject || '(no subject)')
    },
    [held],
  )

  /**
   * Save one thread for later, or bring it back with `null`.
   *
   * The archive machinery verbatim, and deliberately so: the advance rule, the
   * hold that lets the row survive its own exit animation, and the two-halved
   * undo are all `onAction`'s, reused rather than grown a second time. Nothing
   * in lib/undo.ts changes — Later takes a place on the stack like any other
   * action.
   *
   * There is no archive TICK here. The tick is a completion cue with a green
   * check, and deferring is an intent rather than a completion — the repo's own
   * sentence, above `CheckedChip`. The row simply leaves.
   */
  const onDefer = useCallback(
    (thread: Thread, wakeAt: number | null, at: number) => {
      if (useUi.getState().selected === thread.key) {
        useUi.getState().setSelected(nextAfterRemoval(visibleRef.current, thread.key), 'keyboard')
      }
      const before = thread.deferredUntil ?? null
      const commit = (next: number | null) =>
        deferRef.current.mutate({ threadKey: thread.key, wakeAt: next })

      const label =
        wakeAt === null ? 'Back in the inbox' : `Back ${wakeTime(wakeAt, at)}`
      const cancel = held.hold(thread.key, () => commit(wakeAt), TICK_MS)

      // The same two halves archive has, and which one runs is a question of
      // *when*. Inside the hold the mutation has not been dispatched, so undo
      // cancels it and the row simply stays. After it flushes, undo puts the
      // previous deferral back — `null` when there was none, which is the
      // ordinary case, and the old wake time when this was a re-schedule.
      const undoId = `later:${thread.key}`
      useUi.getState().registerUndo({
        id: undoId,
        label,
        run: () => {
          if (held.has(thread.key)) {
            cancel()
            return
          }
          commit(before)
        },
      })

      showUndoToast(undoId, label, thread.subject || '(no subject)')
    },
    [held],
  )

  const labelName = labelNameFor(view, labels.data)
  const title = mailboxTitle(view, accounts, labelName)
  const subtitle =
    view.kind === 'account' ? accountsById.get(view.accountId)?.email : undefined

  const checkedCount = useMemo(
    () => rows.filter((r) => r.kind === 'thread' && checked.has(r.thread.key)).length,
    [rows, checked],
  )

  const showAccount = view.kind === 'unified' && accounts.length > 1
  const hits = searching ? (results.data ?? []) : []

  // Whether the scroller is actually showing rows, which is the only state the
  // bottom-fade mask has a job in. Mirrors the branch tree below exactly.
  const showsRows = searching ? hits.length > 0 : !threads.isPending && rows.length > 0
  // Empty because the user cleared it in this session, or empty because it
  // always was? Only the first earns a moment (MAGIC §3.6). The *unfiltered*
  // count decides: an inbox a filter merely hides is not inbox zero.
  const emptyTier = useInboxZeroTier(view, threads.isSuccess ? (threads.data?.length ?? 0) : -1)

  return (
    <section
      aria-label="Threads"
      tabIndex={-1}
      // `@container` so a row can ask how wide the *list* is, not the window.
      //
      // No `border-t`. It closed the horizon under the titlebar, and the
      // titlebar is gone — with nothing above it, that edge would draw a
      // hairline across the very top of the window. The header's `border-b` at
      // y=52 is now the window's first horizontal rule, and it is level with
      // the reading pane's and with the sidebar card's first control.
      className={cn(SHELL_CARD, '@container min-w-0 outline-none')}
    >
      {/* The pane header is now the window's drag field. `="deep"` lets the
          blank areas and the title drag; Tauri's drag.js already blocks
          BUTTON / INPUT / A that lack the attribute, so the controls
          self-protect and only the two wrappers below need saying out loud. */}
      <header
        data-tauri-drag-region="deep"
        // --wren-card-band, not --wren-toolbar-h: the card starts 8px down,
        // so a 44px band puts this rule on the window's one horizon at y=52,
        // level with the reading region's and with the sidebar's first control.
        className="border-hairline flex h-(--wren-card-band) shrink-0 items-center gap-2 border-b px-4"
      >
        {searchOpen ? (
          // Drag-blocked on its own root — see SearchField. drag.js exempts the
          // INPUT itself, but the gap and the glyph beside it are field, not
          // chrome, and dragging the window while aiming at a text field is the
          // one place the belt-and-braces attribute is genuinely required.
          <SearchField />
        ) : (
          <>
            {/* The header is the view's name and nothing else. It used to
                carry a bare thread total, which sat two rows from the
                sidebar's unread badge — two unlabelled numbers for the same
                mailbox, disagreeing. Unread is the sidebar's job; how much is
                here is the list's own job. */}
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <h2 className="font-ui text-ink truncate text-base font-semibold">{title}</h2>
              {subtitle && <span className="text-ink-3 truncate text-xs">{subtitle}</span>}
            </div>
            {/* Belt and braces over drag.js's own control rule: the cluster's
                own gaps are inside the wrapper, so no pixel between two glyphs
                drags the window either. The `<h2>` above stays plain —
                dragging a window by its view title is correct and native. */}
            <div data-tauri-drag-region="false" className="flex items-center gap-2">
              <ListControls />
              <SearchToggle />
              {/* No `size` override: DIRECTION §8 puts toolbars at 18, and this
                  header sits at the same y as the reading pane's — which was
                  already 18 — separated by a 1 px rule, so a 16/18 mismatch read
                  as a direct side-by-side comparison (S8). */}
              <IconButton name="sync" label="Refresh" onClick={() => void service.refresh()} />
            </div>
          </>
        )}
      </header>

      <SyncNotice />

      {/* The disclosure, permanent and directly under the word "Later". It is
          its own strip rather than the header's inline subtitle because the
          header truncates — and a truncated disclosure is not a disclosure.
          Nothing dismisses it: dismissible means misremembered six months
          later. */}
      {view.kind === 'later' && !searching && (
        <p className="border-hairline text-ink-3 shrink-0 border-b px-4 py-2 text-xs text-pretty">
          {LATER_DISCLOSURE}
        </p>
      )}

      {searching && (
        <div className="border-hairline text-ink-3 flex h-8 shrink-0 items-center gap-1 border-b px-4 text-xs">
          <span className="tabular-nums">
            {hits.length} result{hits.length === 1 ? '' : 's'}
          </span>
          <span aria-hidden>·</span>
          <span>Esc to clear</span>
        </div>
      )}

      {/* The bulk bar: the batch's verbs, in the same strip the lens and the
          search count use. It exists only while something is checked, and it
          outranks the lens bar — a pending batch is the more urgent fact
          about the list.

          Tighter than the other strips (`gap-1.5 px-3`, not `gap-3 px-4`), and
          measured rather than guessed. At the old spacing, six verbs plus the
          count plus select-all came to 444 px in the pane's default 400, which
          pushed `Clear` clean off the end the moment Later was added.

          The case that sets the number is not "2 selected · All 37" but
          "99 selected · All 100", which is 407 px here. That is 7 px into the
          12 px right padding and nothing clips — Clear's right edge lands 5 px
          inside the pane — so the worst this degrades to is a slightly tighter
          margin on a rare state. Nothing hides behind an overflow and nothing
          truncates: a batch verb the person cannot see is a batch verb that
          does not exist.

          There is no room left. A seventh verb needs a real answer — a wrap,
          or one fewer verb — not another 2 px. */}
      {!searching && checkedCount > 0 && (
        <div className="border-hairline flex h-8 shrink-0 items-center gap-1.5 border-b px-3 text-xs">
          <span className="text-ink font-medium whitespace-nowrap tabular-nums">
            {checkedCount} selected
          </span>
          {checkedCount < threadCount && (
            <StripButton
              label={`All ${threadCount}`}
              onClick={() => useUi.getState().checkMany(visibleRef.current.map((t) => t.key))}
            />
          )}
          <span className="flex-1" />
          {view.kind === 'unified' && view.folder === 'trash' ? (
            <StripButton label="Restore" onClick={() => onBulk('untrash')} />
          ) : (
            <>
              <StripButton label="Archive" onClick={() => onBulk('archive')} />
              {/* Between Archive and Trash, because the three answer the same
                  question in ascending finality: not ever, not now, gone. */}
              <StripButton label="Later" onClick={onBulkLater} />
              <StripButton label="Trash" onClick={() => onBulk('trash')} />
            </>
          )}
          <StripButton label="Read" onClick={() => onBulk('markRead')} />
          <StripButton label="Unread" onClick={() => onBulk('markUnread')} />
          <StripButton label="Clear" hint="esc" onClick={() => useUi.getState().clearChecked()} />
        </div>
      )}

      {/* The lens bar: the same strip the search count uses, shown while the
          list is not the whole mailbox. The list must never quietly be a
          subset — the strip names the lens and offers the way back. */}
      {!searching && checkedCount === 0 && lensed && (
        <div className="border-hairline text-ink-3 flex h-8 shrink-0 items-center gap-1 border-b px-4 text-xs">
          <span>
            {FILTER_LABELS[prefs.filter]}
            {prefs.sort === 'oldest' ? ', oldest first' : ''}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {threadCount} thread{threadCount === 1 ? '' : 's'}
          </span>
          <span className="ml-auto">
            <StripButton label="Reset" onClick={() => setListPrefs(view, DEFAULT_LIST_PREFS)} />
          </span>
        </div>
      )}

      {/* `scroll-fade`: a row that straddles the card's bottom edge would be
          sliced mid-line and read as a stray fragment, so the last 16px
          dissolves into the card's own corner instead. */}
      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto',
          // Only when there are ROWS. The mask exists to soften a row that
          // straddles the bottom edge; with an empty state there is no such
          // row, and the mask instead dissolves the bottom 16px of the
          // earned tier's pane-filling field into the pane behind it — a
          // gradient nobody asked for, on the one celebration in the app.
          showsRows && 'scroll-fade',
        )}
      >
        {searching ? (
          hits.length === 0 ? (
            <EmptyState
              copy={{
                title: 'No matches',
                // Names the window rather than claiming "your mail": search
                // runs against the local index, which sync builds from the
                // last SEARCH_WINDOW_DAYS. Saying so turns a dead end into
                // information, and quietly reveals that older mail exists.
                subtitle: `Nothing from the last ${SEARCH_WINDOW_DAYS} days mentions “${debounced.trim()}”.`,
              }}
            />
          ) : (
            <ul
              role="listbox"
              aria-label="Search results"
              // Same inset and same gap as the thread list, so a result and a
              // row are visibly the same kind of object.
              className="flex flex-col gap-(--wren-row-gap) px-(--wren-row-inset-x) py-1"
            >
              {hits.map((thread) => (
                // A `listitem` between the listbox and its options breaks the
                // required owned-element relationship (N9).
                <li key={thread.key} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected === thread.key}
                    data-thread-key={thread.key}
                    onClick={(event) => onSelect(thread, event.shiftKey)}
                    className={cn(
                      'rounded-row flex h-(--wren-row-h-compact) w-full items-center px-2 text-left',
                      'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
                      // The ring follows the rect it is on, so a focused
                      // result reads as one shape rather than as a square
                      // outline around a rounded fill.
                      'focus-ring focus-visible:ring-inset',
                      selected === thread.key ? 'bg-fill-selected' : 'hover:bg-fill-hover',
                    )}
                  >
                    <ThreadResult
                      thread={thread}
                      selfEmails={selfEmails}
                      now={now}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : threads.isPending ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          prefs.filter !== 'all' ? (
            // A filter that matches nothing is not an empty folder, and must
            // never borrow "Inbox zero" or its celebration.
            <EmptyState copy={filterEmptyCopy(prefs.filter)} />
          ) : (
            <EmptyState copy={emptyCopyFor(view, labelName)} tier={emptyTier} />
          )
        ) : (
          <div
            role="listbox"
            aria-label={title}
            // The listbox is the list's one tab stop, and the selection is
            // announced through `aria-activedescendant` rather than by moving
            // DOM focus into a virtualized row that may be recycled out from
            // under it. Before this the container was never focusable and never
            // set the attribute, so `aria-selected` moved and nothing announced
            // — the primary surface had no navigable structure at all (B3).
            // j/k are bound globally and already compute the right target.
            tabIndex={0}
            // The focus indicator lives on the selected row, and the row is
            // virtualized — so focusing the list scrolls the selection into
            // view, or there would be visible focus nowhere (WCAG 2.4.7).
            onFocus={() => {
              if (!selected) return
              const index = rows.findIndex(
                (r) => r.kind === 'thread' && r.thread.key === selected,
              )
              if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
            }}
            aria-activedescendant={selected ? threadRowId(selected) : undefined}
            data-wren-listbox
            // No ring around the whole list (Nick's ruling): the container
            // stays the tab stop, but focus is *shown* on the active row via
            // the named group below — indication on the thing that is active.
            className="group/listbox relative w-full outline-none"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              return (
                <div
                  key={item.key}
                  // `items-center` is what turns the row's 4 px shortfall into
                  // an even 2 px above and below, so the gap between two rows
                  // is exactly --wren-row-gap and the pitch is untouched.
                  className="absolute top-0 left-0 flex w-full items-center"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  {row.kind === 'group' ? (
                    <GroupHeader label={row.label} />
                  ) : (
                    <ThreadRow
                      thread={row.thread}
                      account={accountsById.get(row.thread.accountId)}
                      selected={selected === row.thread.key}
                      checked={checked.has(row.thread.key)}
                      showAccount={showAccount}
                      selfEmails={selfEmails}
                      ticking={ticking === row.thread.key}
                      onSelect={onSelect}
                      onAction={onAction}
                      onLater={onLaterOne}
                      onCheck={onCheck}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* The picker is mounted HERE, not in the shell, because the commit needs
          this component's advance rule, its held mutations and its undo entry —
          the same three the archive path uses. It portals, so where it is
          declared has nothing to do with where it appears. */}
      <LaterPicker
        isDeferred={(keys) =>
          keys.length > 0 &&
          keys.every((key) => {
            const thread = visibleRef.current.find((t) => t.key === key)
            return thread !== undefined && isDeferred(thread, Date.now())
          })
        }
        onCommit={(wakeAt, target) => {
          const at = Date.now()
          if (target.bulk) {
            bulkDefer(
              (key, next) => deferRef.current.mutate({ threadKey: key, wakeAt: next }),
              visibleRef.current,
              wakeAt,
              at,
            )
            return
          }
          const thread = visibleRef.current.find((t) => t.key === target.keys[0])
          if (thread) onDefer(thread, wakeAt, at)
        }}
      />
    </section>
  )
}

/** The 8-high strips' one text button — the bulk bar's verbs and the lens
 *  bar's Reset. Feature-local on purpose: the kit's textButtonClass is
 *  surface geometry (h-8 rounded-full), not strip geometry. */
function StripButton({
  label,
  hint,
  onClick,
}: {
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring text-ink-2 hover:text-ink rounded-sm font-medium whitespace-nowrap"
    >
      {label}
      {hint && <span className="text-ink-3 ml-1">{hint}</span>}
    </button>
  )
}

function SearchToggle() {
  const openSearch = useSurfaces((s) => s.openSearch)
  return <IconButton name="search" label="Search mail" hint="/" onClick={openSearch} />
}

/** The header's inline field. `/` focuses it; Esc puts the view back. */
function SearchField() {
  const query = useSurfaces((s) => s.searchQuery)
  const setQuery = useSurfaces((s) => s.setSearchQuery)
  const closeSearch = useSurfaces((s) => s.closeSearch)

  return (
    // The header above is `data-tauri-drag-region="deep"`. The input blocks the
    // drag on its own, but this box's gap and its search glyph would otherwise
    // move the window while the user is aiming at the field.
    <div data-tauri-drag-region="false" className="flex min-w-0 flex-1 items-center gap-2">
      <Icon name="search" size={16} className="text-ink-3 shrink-0" />
      <input
        id="wren-search"
        type="search"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        aria-label="Search mail"
        placeholder="Search mail"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          closeSearch()
        }}
        className="text-ink placeholder:text-ink-3 h-8 min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <IconButton name="close" label="Close search" hint="esc" onClick={closeSearch} />
    </div>
  )
}

/**
 * The day label. It used to carry a hairline along its top edge, which was the
 * compromise DIRECTION §2 (Family 1) reached when rows were a full-bleed band
 * and needed *something* to mark a boundary. Rows are their own rounded rects
 * now, with a gap between them, so the group's own vertical space does the
 * grouping and the rule is gone — which is what Family and Amie both do.
 *
 * Sentence case, not the new all-caps eyebrow: these are date words, and
 * "YESTERDAY" reads as a shout where "ACCOUNTS" reads as a section.
 */
function GroupHeader({ label }: { label: DateGroup | WakeGroup }) {
  return (
    <div className="font-ui text-ink-3 flex h-full w-full items-end self-stretch px-4 pb-2 text-xs">
      {label}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: 9 }).map((_, i) => (
        // The skeleton is the row's shape, not a generic two-bar placeholder:
        // `gap-1` like the row, a 20 px first line and an 18 px second, and
        // the same 8 px inset plus 8 px padding the real row has, so nothing
        // about the geometry changes when the data lands (N8).
        <div
          key={i}
          className="mx-(--wren-row-inset-x) flex h-[calc(var(--wren-row-h)-var(--wren-row-gap))] items-center gap-3 px-2"
        >
          <span className="w-3 shrink-0" />
          <Skeleton className="size-8 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-5 w-(--wren-list-sender-w)" />
            <Skeleton className="h-[18px] w-full max-w-64" />
          </div>
        </div>
      ))}
    </div>
  )
}
