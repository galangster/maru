// The middle pane: a virtualized, date-grouped thread list, and the inline
// search that temporarily replaces it.
//
// There are no hairlines in the list at all. Every row is its own inset
// rounded rect with a --wren-row-gap between it and its neighbour, and a day
// group is marked by the space its header sits in — which is what Family 1
// asked for and what the divider was a compromise against (AMIE-STUDY §5).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'

import { Skeleton } from '@/components/ui/skeleton'
import { Icon } from '@/components/ui/icon'
import { IconButton } from '@/components/wren-controls'
import type { MailAction, MailActionType, Thread } from '@/core/types'
import {
  MIN_SEARCH_LENGTH,
  registerActionUndo,
  useAccountsById,
  useLabels,
  usePerformAction,
  useSearch,
  useThreads,
} from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { DEFAULT_LIST_PREFS, isDefaultPrefs, useListPrefs, useUi } from '@/features/mail/ui-store'
import { ThreadResult } from '@/components/thread-result'
import { useSurfaces } from '@/features/shell/surface-store'
import { HeldMutations } from '@/lib/deferred'
import { dateGroup, type DateGroup } from '@/lib/format'
import { DUR } from '@/lib/motion'
import { UNDO_TOAST_ID } from '@/lib/undo'
import { useDebounced } from '@/lib/use-debounced'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

import { EmptyState } from '@/components/empty-state'
import { emptyCopyFor, useInboxZeroTier } from './inbox-zero'
import { ListControls } from './list-controls'
import { FILTER_LABELS, applyListPrefs, filterEmptyCopy } from './list-prefs'
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
  | { kind: 'group'; key: string; label: DateGroup }
  | { kind: 'thread'; key: string; thread: Thread }

function buildRows(threads: Thread[], now: number): Row[] {
  const rows: Row[] = []
  let current: DateGroup | null = null
  for (const thread of threads) {
    const group = dateGroup(thread.lastMessageAt, now)
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

  // The lens between the mailbox and the rows: per-view sort and filter.
  // Applied here, after fetch, so j/k, selection and the virtualizer all see
  // one list and cannot disagree about what "next" means.
  const prefs = useListPrefs()
  const setListPrefs = useUi((s) => s.setListPrefs)
  const lensed = !isDefaultPrefs(prefs)

  const rows = useMemo(
    () => buildRows(applyListPrefs(threads.data ?? [], prefs), now),
    [threads.data, prefs, now],
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

  const onSelect = useCallback(
    (thread: Thread) => {
      // Pointer-initiated: the reading pane is licensed to animate its arrival.
      // j/k traversal passes 'keyboard' and gets a hard cut instead.
      setSelected(thread.key, 'pointer')
      if (thread.unread) actionRef.current.mutate({ type: 'markRead', threadKey: thread.key })
    },
    [setSelected],
  )

  const onAction = useCallback(
    (thread: Thread, type: MailActionType) => {
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
        mutate({ type, threadKey: thread.key })
        registerActionUndo(mutate, { type, threadKey: thread.key })
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
      useUi.getState().registerUndo({
        id: `archive:${thread.key}`,
        label: 'Archived',
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
      // same undo for the rest of the 10 s window.
      toast('Archived', {
        id: UNDO_TOAST_ID,
        description: thread.subject || '(no subject)',
        action: { label: 'Undo', onClick: () => useUi.getState().runUndo() },
      })
    },
    [held],
  )

  const labelName =
    view.kind === 'account'
      ? (labels.data ?? []).find((l) => l.id === view.labelId)?.name
      : undefined

  const title =
    view.kind === 'unified'
      ? view.folder[0].toUpperCase() + view.folder.slice(1)
      : (labelName ?? 'Label')
  const subtitle =
    view.kind === 'account' ? accountsById.get(view.accountId)?.email : undefined

  const showAccount = view.kind === 'unified' && accounts.length > 1
  const hits = searching ? (results.data ?? []) : []
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
      // `border-t` closes the horizon. The pane's left and right edges are real
      // hairlines (the two resize handles) and its top was open, so a white
      // surface met the canvas titlebar with nothing drawn between them and the
      // two vertical rules ran up into nothing. The reading pane carries the
      // same edge, so the line is continuous across both panes.
      className="bg-surface border-hairline @container flex h-full min-w-0 flex-col border-t outline-none"
    >
      <header className="border-hairline flex h-(--wren-toolbar-h) shrink-0 items-center gap-2 border-b px-4">
        {searchOpen ? (
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
            <ListControls />
            <SearchToggle />
            {/* No `size` override: DIRECTION §8 puts toolbars at 18, and this
                header sits at the same y as the reading pane's — which was
                already 18 — separated by a 1 px rule, so a 16/18 mismatch read
                as a direct side-by-side comparison (S8). */}
            <IconButton name="sync" label="Refresh" onClick={() => void service.refresh()} />
          </>
        )}
      </header>

      {searching && (
        <div className="border-hairline text-ink-3 flex h-8 shrink-0 items-center gap-1 border-b px-4 text-xs">
          <span className="tabular-nums">
            {hits.length} result{hits.length === 1 ? '' : 's'}
          </span>
          <span aria-hidden>·</span>
          <span>Esc to clear</span>
        </div>
      )}

      {/* The lens bar: the same strip the search count uses, shown while the
          list is not the whole mailbox. The list must never quietly be a
          subset — the strip names the lens and offers the way back. */}
      {!searching && lensed && (
        <div className="border-hairline text-ink-3 flex h-8 shrink-0 items-center gap-1 border-b px-4 text-xs">
          <span>
            {FILTER_LABELS[prefs.filter]}
            {prefs.sort === 'oldest' ? ', oldest first' : ''}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {threadCount} thread{threadCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => setListPrefs(view, DEFAULT_LIST_PREFS)}
            className="focus-ring text-ink-2 hover:text-ink ml-auto rounded-sm font-medium"
          >
            Reset
          </button>
        </div>
      )}

      {/* `scroll-fade`: the pane runs to the window frame, so the row that
          happens to straddle the bottom edge was being sliced mid-line and read
          as a stray fragment stuck to the bottom of the app. */}
      <div
        ref={scrollRef}
        className="scroll-fade min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        {searching ? (
          hits.length === 0 ? (
            <EmptyState
              copy={{
                title: 'No matches',
                subtitle: `Nothing in your mail mentions “${debounced.trim()}”.`,
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
                    onClick={() => onSelect(thread)}
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
            aria-activedescendant={selected ? threadRowId(selected) : undefined}
            data-wren-listbox
            className="focus-ring relative w-full focus-visible:ring-inset"
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
                      showAccount={showAccount}
                      selfEmails={selfEmails}
                      ticking={ticking === row.thread.key}
                      onSelect={onSelect}
                      onAction={onAction}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
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
    <div className="flex min-w-0 flex-1 items-center gap-2">
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
function GroupHeader({ label }: { label: DateGroup }) {
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
