// react-query over MailService. Queries are reads, the one mutation is
// performAction, and MailService.onEvent is what invalidates. No component
// calls the service directly.

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { threadMatchesView } from '@/core/defaults'
import { applyActionToThread, reverseAction } from '@/core/service/actions'
import type {
  LabelChanges,
  Account,
  MailAction,
  MailActionType,
  MailView,
  Message,
  SyncStatus,
  Thread,
  Settings,
} from '@/core/types'
import { toast } from 'sonner'

import { playSound } from '@/lib/sound'
import { UNDO_TOAST_ID } from '@/lib/undo'

import { useMailService } from './service'
import { useUi, viewKey } from './ui-store'

export const keys = {
  accounts: ['accounts'] as const,
  labels: (accountId: string) => ['labels', accountId] as const,
  /**
   * The view rides in the key, not just its string form. The optimistic
   * updater has to know whether a thread still belongs in this list, and that
   * is a question for `threadMatchesView` — not for a parser that takes the
   * key apart again and re-derives the label from its shape.
   */
  threads: (view: MailView) => ['threads', viewKey(view), view] as const,
  thread: (threadKey: string) => ['thread', threadKey] as const,
  unread: (view: MailView) => ['unread', viewKey(view)] as const,
  settings: ['settings'] as const,
  search: (q: string) => ['search', q] as const,
}

export function useAccounts() {
  const service = useMailService()
  return useQuery({ queryKey: keys.accounts, queryFn: () => service.listAccounts() })
}

const NO_ACCOUNTS: Account[] = []

export interface AccountLookup {
  accounts: Account[]
  byId: Map<string, Account>
  /** Every address the user owns, lower-cased — what `correspondents` wants. */
  selfEmails: string[]
}

/**
 * The account list in the three shapes the UI reads it in. Three panes used to
 * build the same Map in three `useMemo`s, and one of them forgot to lower-case
 * the addresses, so the palette's rows credited the user as a correspondent.
 */
export function useAccountsById(): AccountLookup {
  const { data } = useAccounts()
  return useMemo(() => {
    const accounts = data ?? NO_ACCOUNTS
    const byId = new Map<string, Account>()
    for (const a of accounts) byId.set(a.id, a)
    return { accounts, byId, selfEmails: accounts.map((a) => a.email.toLowerCase()) }
  }, [data])
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
    // One call, one read: `hydrate` asks the service to fetch any missing
    // bodies as part of the same trip. Reading the thread and then calling
    // ensureBodies made opening a thread read the same message rows three
    // times over.
    queryFn: () => service.getThread(threadKey as string, { hydrate: true }),
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

/**
 * Toggle user labels on a thread through the M9 seam. Cache refresh rides
 * the service's own threadsChanged event, exactly like performAction.
 */
export function useModifyLabels() {
  const service = useMailService()
  return useMutation({
    mutationFn: (input: { threadKey: string; changes: LabelChanges }) =>
      service.modifyLabels(input.threadKey, input.changes),
  })
}

/** Patch settings and refresh every reader. Settings dialog, palette, pane. */
export function useSaveSettings() {
  const service = useMailService()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => service.setSettings(patch),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.settings }),
  })
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
        case 'newMail': {
          // Folder membership can change for any list, so those always refetch.
          void client.invalidateQueries({ queryKey: ['threads'] })
          void client.invalidateQueries({ queryKey: ['unread'] })
          // Open threads are a different matter: when the emitter names the
          // threads it moved, only those reload. Starring one thread used to
          // refetch every thread the cache held, bodies and all.
          const named = event.type === 'threadsChanged' ? event.threadKeys : [event.threadKey]
          if (named?.length) {
            for (const key of named) void client.invalidateQueries({ queryKey: keys.thread(key) })
          } else {
            void client.invalidateQueries({ queryKey: ['thread'] })
          }
          break
        }
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
 * answers. The label arithmetic and the folder rule are the engine's, imported
 * rather than restated: a third copy of "what archive does" is a third thing
 * that can disagree with Gmail.
 */
interface ActionContext {
  lists: [readonly unknown[], Thread[] | undefined][]
  detail: { thread: Thread; messages: Message[] } | undefined
}

/** Past tense, because it is what the confirmation says happened. */
export const UNDO_LABELS: Record<MailActionType, string> = {
  archive: 'Archived',
  unarchive: 'Moved to Inbox',
  trash: 'Moved to trash',
  untrash: 'Restored from trash',
  star: 'Starred',
  unstar: 'Unstarred',
  markRead: 'Marked read',
  markUnread: 'Marked unread',
}

/**
 * Offer ⌘Z on a mail action that has already been dispatched.
 *
 * Called at the *deliberate* action sites — the row's hover cluster, the
 * reading toolbar, the triage keys — and deliberately not inside
 * `usePerformAction`. Opening a thread marks it read through the same
 * mutation, and if that registered, ⌘Z after a morning of j/k would offer to
 * mark one thread unread rather than to put back the thing you just archived.
 *
 * The reverse is dispatched through `mutate` and not through this function, so
 * an undo never registers a redo: ⌘Z twice is one undo, not a loop.
 */
/** The one undo toast. Every surface that offers an inline Undo goes through
 *  here, so the id, the action wiring and the wording cannot drift apart. */
export function showUndoToast(label: string, description?: string): void {
  toast(label, {
    id: UNDO_TOAST_ID,
    description,
    action: { label: 'Undo', onClick: () => useUi.getState().runUndo() },
  })
}

export function registerActionUndo(
  mutate: (action: MailAction) => void,
  action: MailAction,
): void {
  useUi.getState().registerUndo({
    id: `${action.type}:${action.threadKey}`,
    label: UNDO_LABELS[action.type],
    run: () => mutate({ type: reverseAction(action.type), threadKey: action.threadKey }),
  })
}

export function usePerformAction() {
  const service = useMailService()
  const client = useQueryClient()

  return useMutation<void, Error, MailAction, ActionContext>({
    mutationFn: (action) => service.performAction(action),
    onMutate: async (action) => {
      // One place, four surfaces: the row's hover cluster, the reading
      // toolbar, the palette and the keymap all come through here, so the cue
      // cannot be attached to three of them and missed on the fourth.
      //
      // Triage only. Reading, starring and restoring are not completions, and
      // a sound on every `u` would be exactly the "100×/day" case MAGIC §4.5
      // warns about. `complete` carries its own 400 ms guard, so a held `e`
      // down a mailbox is one tick rather than forty (sound-policy.ts).
      if (action.type === 'archive' || action.type === 'trash') playSound('complete')
      await client.cancelQueries({ queryKey: ['threads'] })
      const lists = client.getQueriesData<Thread[]>({ queryKey: ['threads'] })
      const detail = client.getQueryData<{ thread: Thread; messages: Message[] }>(
        keys.thread(action.threadKey),
      )

      for (const [queryKey, threads] of lists) {
        if (!threads) continue
        const view = queryKey[2] as MailView | undefined
        const updated = threads
          .map((t) => (t.key === action.threadKey ? applyActionToThread(t, action.type) : t))
          .filter((t) => t.key !== action.threadKey || !view || threadMatchesView(t, view))
        client.setQueryData(queryKey, updated)
      }

      if (detail) {
        const thread = applyActionToThread(detail.thread, action.type)
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
      // The optimistic change is being taken back on screen; the cue says so
      // without a dialog. Low and short — it states "no" without alarming.
      playSound('error')
      for (const [queryKey, threads] of context?.lists ?? []) client.setQueryData(queryKey, threads)
      if (context?.detail) client.setQueryData(keys.thread(action.threadKey), context.detail)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['threads'] })
      void client.invalidateQueries({ queryKey: ['unread'] })
    },
  })
}
