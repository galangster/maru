// The middle pane: a virtualized, date-grouped thread list, and the inline
// search that temporarily replaces it.
//
// Hairlines appear only between day groups (Family 1). Rows inside a group are
// separated by nothing but their own height.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { Skeleton } from '@/components/ui/skeleton'
import { Icon } from '@/components/ui/icon'
import { IconButton } from '@/components/wren-controls'
import type { MailActionType, Thread } from '@/core/types'
import {
  MIN_SEARCH_LENGTH,
  useAccountsById,
  useLabels,
  usePerformAction,
  useSearch,
  useThreads,
} from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useUi } from '@/features/mail/ui-store'
import { ThreadResult } from '@/features/search/thread-result'
import { useSurfaces } from '@/features/shell/surface-store'
import { dateGroup, type DateGroup } from '@/lib/format'
import { useDebounced } from '@/lib/use-debounced'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

import { EmptyState, emptyCopyFor, useInboxZeroTier } from './empty-state'
import { ThreadRow, threadRowId } from './thread-row'

const GROUP_H = 40
const ROW_H = 68

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

  const rows = useMemo(() => buildRows(threads.data ?? [], now), [threads.data, now])
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
    (thread: Thread, type: MailActionType) => actionRef.current.mutate({ type, threadKey: thread.key }),
    [],
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
  // always was? Only the first earns a moment (MAGIC §3.6).
  const emptyTier = useInboxZeroTier(view, threads.isSuccess ? rows.length : -1)

  return (
    <section
      aria-label="Threads"
      tabIndex={-1}
      // `@container` so a row can ask how wide the *list* is, not the window.
      className="bg-surface @container flex h-full min-w-0 flex-col outline-none"
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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {searching ? (
          hits.length === 0 ? (
            <EmptyState
              copy={{
                title: 'No matches',
                subtitle: `Nothing in your mail mentions “${debounced.trim()}”.`,
              }}
            />
          ) : (
            <ul role="listbox" aria-label="Search results" className="flex flex-col py-1">
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
                      'flex h-(--wren-row-h-compact) w-full items-center px-4 text-left outline-none',
                      'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
                      'focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:ring-inset',
                      selected === thread.key ? 'bg-fill-selected' : 'hover:bg-fill-hover',
                    )}
                  >
                    <ThreadResult
                      thread={thread}
                      account={accountsById.get(thread.accountId)}
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
          <EmptyState copy={emptyCopyFor(view, labelName)} tier={emptyTier} />
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
            className="focus-visible:ring-ring/50 relative w-full outline-none focus-visible:ring-3 focus-visible:ring-inset"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              return (
                <div
                  key={item.key}
                  className="absolute top-0 left-0 w-full"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  {row.kind === 'group' ? (
                    <GroupHeader label={row.label} first={item.index === 0} />
                  ) : (
                    <ThreadRow
                      thread={row.thread}
                      account={accountsById.get(row.thread.accountId)}
                      selected={selected === row.thread.key}
                      showAccount={showAccount}
                      selfEmails={selfEmails}
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

function GroupHeader({ label, first }: { label: DateGroup; first: boolean }) {
  return (
    <div
      className={cn(
        'font-ui text-ink-3 flex h-full items-end px-4 pb-2 text-xs',
        // The only hairline in the list, and it never adds layout height.
        !first && 'shadow-[inset_0_1px_0_var(--wren-hairline)]',
      )}
    >
      {label}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: 9 }).map((_, i) => (
        // The skeleton is the row's shape, not a generic two-bar placeholder:
        // `gap-1` like the row, a 20 px first line and an 18 px second, so
        // nothing about the geometry changes when the data lands (N8).
        <div key={i} className="flex h-(--wren-row-h) items-center gap-3 px-4">
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
