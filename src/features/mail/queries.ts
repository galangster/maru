// react-query over MailService. Queries are reads, the one mutation is
// performAction, and MailService.onEvent is what invalidates. No component
// calls the service directly.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { FOLDER_LABELS } from '@/core'
import type {
  MailAction,
  MailActionType,
  MailView,
  Message,
  SyncStatus,
  Thread,
  UnifiedFolder,
} from '@/core/types'

import { useMailService } from './service'
import { viewKey } from './ui-store'

export const keys = {
  accounts: ['accounts'] as const,
  labels: (accountId: string) => ['labels', accountId] as const,
  threads: (view: MailView) => ['threads', viewKey(view)] as const,
  thread: (threadKey: string) => ['thread', threadKey] as const,
  unread: (view: MailView) => ['unread', viewKey(view)] as const,
  settings: ['settings'] as const,
  search: (q: string) => ['search', q] as const,
}

export function useAccounts() {
  const service = useMailService()
  return useQuery({ queryKey: keys.accounts, queryFn: () => service.listAccounts() })
}

export function useLabels(accountId: string | undefined) {
  const service = useMailService()
  return useQuery({
    queryKey: keys.labels(accountId ?? ''),
    queryFn: () => service.listLabels(accountId as string),
    enabled: Boolean(accountId),
  })
}

export function useThreads(view: MailView) {
  const service = useMailService()
  return useQuery({ queryKey: keys.threads(view), queryFn: () => service.listThreads(view) })
}

export function useThread(threadKey: string | null) {
  const service = useMailService()
  return useQuery({
    queryKey: keys.thread(threadKey ?? ''),
    queryFn: async () => {
      const detail = await service.getThread(threadKey as string)
      const messages = await service.ensureBodies(threadKey as string)
      return { thread: detail.thread, messages }
    },
    enabled: Boolean(threadKey),
  })
}

export function useUnreadCount(view: MailView) {
  const service = useMailService()
  return useQuery({ queryKey: keys.unread(view), queryFn: () => service.unreadCount(view) })
}

export function useSettings() {
  const service = useMailService()
  return useQuery({ queryKey: keys.settings, queryFn: () => service.getSettings() })
}

/** The shortest query worth sending. One letter matches most of a mailbox. */
export const MIN_SEARCH_LENGTH = 2

/**
 * Shared by the palette and the list header, so typing the same query in both
 * costs one call. `placeholderData` keeps the previous results on screen while
 * the next ones resolve — the results panel must not blink between keystrokes.
 */
export function useSearch(query: string) {
  const service = useMailService()
  const term = query.trim()
  return useQuery({
    queryKey: keys.search(term),
    queryFn: () => service.search(term),
    enabled: term.length >= MIN_SEARCH_LENGTH,
    placeholderData: (previous) => previous,
  })
}

// -- events -----------------------------------------------------------------

/** Wires MailService events to cache invalidation. Mount once, at the root. */
export function useMailEvents() {
  const service = useMailService()
  const client = useQueryClient()
  useEffect(() => {
    return service.onEvent((event) => {
      switch (event.type) {
        case 'threadsChanged':
        case 'newMail':
          void client.invalidateQueries({ queryKey: ['threads'] })
          void client.invalidateQueries({ queryKey: ['unread'] })
          void client.invalidateQueries({ queryKey: ['thread'] })
          break
        case 'accountsChanged':
          void client.invalidateQueries({ queryKey: keys.accounts })
          void client.invalidateQueries({ queryKey: ['labels'] })
          break
        case 'syncStatus':
          break
      }
    })
  }, [service, client])
}

/** Per-account sync state for the sidebar footer. */
export function useSyncStatus() {
  const service = useMailService()
  const [statuses, setStatuses] = useState<Record<string, SyncStatus>>({})
  useEffect(() => {
    return service.onEvent((event) => {
      if (event.type !== 'syncStatus') return
      setStatuses((prev) => ({ ...prev, [event.status.accountId]: event.status }))
    })
  }, [service])
  return statuses
}

// -- the one mutation --------------------------------------------------------

/**
 * The visible half of an action, applied to a cached thread before the service
 * answers. The service is the authority; this only has to be right for the one
 * frame before `threadsChanged` invalidates.
 */
function applyOptimistic(thread: Thread, type: MailActionType): Thread {
  const labels = new Set(thread.labelIds)
  const next: Thread = { ...thread }
  switch (type) {
    case 'archive':
      labels.delete('INBOX')
      break
    case 'trash':
      labels.delete('INBOX')
      labels.add('TRASH')
      break
    case 'untrash':
      labels.delete('TRASH')
      labels.add('INBOX')
      break
    case 'star':
      labels.add('STARRED')
      next.starred = true
      break
    case 'unstar':
      labels.delete('STARRED')
      next.starred = false
      break
    case 'markRead':
      labels.delete('UNREAD')
      next.unread = false
      break
    case 'markUnread':
      labels.add('UNREAD')
      next.unread = true
      break
  }
  next.labelIds = [...labels]
  return next
}

function labelOfViewKey(key: string): string {
  if (key.startsWith('account:')) return key.split(':').slice(2).join(':')
  return FOLDER_LABELS[key as UnifiedFolder] ?? 'INBOX'
}

/** Same rule the engine uses: in the folder, and not in the trash unless it is. */
function stillBelongs(thread: Thread, label: string): boolean {
  if (!thread.labelIds.includes(label)) return false
  return label === 'TRASH' || !thread.labelIds.includes('TRASH')
}

interface ActionContext {
  lists: [readonly unknown[], Thread[] | undefined][]
  detail: { thread: Thread; messages: Message[] } | undefined
}

export function usePerformAction() {
  const service = useMailService()
  const client = useQueryClient()

  return useMutation<void, Error, MailAction, ActionContext>({
    mutationFn: (action) => service.performAction(action),
    onMutate: async (action) => {
      await client.cancelQueries({ queryKey: ['threads'] })
      const lists = client.getQueriesData<Thread[]>({ queryKey: ['threads'] })
      const detail = client.getQueryData<{ thread: Thread; messages: Message[] }>(
        keys.thread(action.threadKey),
      )

      for (const [queryKey, threads] of lists) {
        if (!threads) continue
        const label = labelOfViewKey(String(queryKey[1]))
        const updated = threads
          .map((t) => (t.key === action.threadKey ? applyOptimistic(t, action.type) : t))
          .filter((t) => t.key !== action.threadKey || stillBelongs(t, label))
        client.setQueryData(queryKey, updated)
      }

      if (detail) {
        const thread = applyOptimistic(detail.thread, action.type)
        client.setQueryData(keys.thread(action.threadKey), {
          thread,
          messages: detail.messages.map((m) => ({
            ...m,
            unread: thread.unread,
            starred: thread.starred,
          })),
        })
      }

      return { lists, detail }
    },
    onError: (_error, action, context) => {
      for (const [queryKey, threads] of context?.lists ?? []) client.setQueryData(queryKey, threads)
      if (context?.detail) client.setQueryData(keys.thread(action.threadKey), context.detail)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['threads'] })
      void client.invalidateQueries({ queryKey: ['unread'] })
    },
  })
}
