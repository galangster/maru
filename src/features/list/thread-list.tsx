// The middle pane: a virtualized, date-grouped thread list.
//
// Hairlines appear only between day groups (Family 1). Rows inside a group are
// separated by nothing but their own height.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { Skeleton } from '@/components/ui/skeleton'
import { IconButton } from '@/components/wren-controls'
import type { Account, MailActionType, Thread } from '@/core/types'
import {
  useAccounts,
  useLabels,
  usePerformAction,
  useThreads,
} from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useUi } from '@/features/mail/ui-store'
import { dateGroup, type DateGroup } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

import { EmptyState, emptyCopyFor } from './empty-state'
import { ThreadRow } from './thread-row'

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

  const threads = useThreads(view)
  const accounts = useAccounts()
  const labels = useLabels(view.kind === 'account' ? view.accountId : undefined)
  const action = usePerformAction()

  const accountsById = useMemo(() => {
    const map = new Map<string, Account>()
    for (const a of accounts.data ?? []) map.set(a.id, a)
    return map
  }, [accounts.data])
  const selfEmails = useMemo(
    () => (accounts.data ?? []).map((a) => a.email.toLowerCase()),
    [accounts.data],
  )

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
    if (!selected) return
    const index = rows.findIndex((r) => r.kind === 'thread' && r.thread.key === selected)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
  }, [selected, rows, virtualizer])

  const onSelect = useCallback(
    (thread: Thread) => {
      setSelected(thread.key)
      if (thread.unread) action.mutate({ type: 'markRead', threadKey: thread.key })
    },
    [setSelected, action],
  )

  const onAction = useCallback(
    (thread: Thread, type: MailActionType) => action.mutate({ type, threadKey: thread.key }),
    [action],
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

  const showAccountDot = view.kind === 'unified' && (accounts.data?.length ?? 0) > 1

  return (
    <section
      aria-label="Threads"
      className="bg-surface flex h-full min-w-0 flex-col"
    >
      <header className="border-hairline flex h-(--wren-toolbar-h) shrink-0 items-center gap-2 border-b px-4">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h2 className="font-ui text-ink truncate text-base font-semibold">{title}</h2>
          {subtitle && <span className="text-ink-3 truncate text-xs">{subtitle}</span>}
        </div>
        <span className="text-ink-3 shrink-0 text-xs tabular-nums">
          {threads.data ? threads.data.length : ''}
        </span>
        <IconButton
          name="sync"
          label="Refresh"
          size={16}
          onClick={() => void service.refresh()}
        />
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {threads.isPending ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState copy={emptyCopyFor(view, labelName)} />
        ) : (
          <div
            role="listbox"
            aria-label={title}
            className="relative w-full"
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
                      showAccountDot={showAccountDot}
                      now={now}
                      selfEmails={selfEmails}
                      onSelect={() => onSelect(row.thread)}
                      onAction={(type) => onAction(row.thread, type)}
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
        <div key={i} className="flex h-(--wren-row-h) items-center gap-3 px-4">
          <span className="w-3 shrink-0" />
          <Skeleton className="size-8 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-(--wren-list-sender-w)" />
            <Skeleton className="h-3 w-full max-w-64" />
          </div>
        </div>
      ))}
    </div>
  )
}
