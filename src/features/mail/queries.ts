// react-query over MailService. Queries are reads, the one mutation is
// performAction, and MailService.onEvent is what invalidates. No component
// calls the service directly.

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { FOLDERS, threadMatchesView } from '@/core/defaults'
import { applyActionToThread, reverseAction } from '@/core/service/actions'
import type {
  Label,
  LabelChanges,
  Account,
  EmailAddress,
  MailAction,
  MailActionType,
  MailView,
  Message,
  SyncStatus,
  Thread,
  Settings,
} from '@/core/types'
import { toast } from 'sonner'

import { cue } from '@/lib/cue'
import { playSound } from '@/lib/sound'
import { dedupeAddresses } from '@/lib/compose'
import { correspondents } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { UNDO_LABELS, UNDO_TOAST_ID } from '@/lib/undo'

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
  /** Threads waiting in Later. Not view-keyed: there is exactly one Later. */
  deferred: ['deferred'] as const,
  settings: ['settings'] as const,
  search: (q: string) => ['search', q] as const,
  correspondents: (accountId: string | undefined, selfEmails: string[]) =>
    ['correspondents', accountId ?? 'all', selfEmails.join('\0')] as const,
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

/**
 * One account's user labels, which is what every label surface actually wants.
 *
 * The `type === 'user'` filter had been written out at four call sites — the
 * phone's label sheet, its thread screen, its mailbox picker and the desktop's
 * reading pane — and a fifth surface would have written a fifth copy. System
 * labels are the `FOLDERS` table's business and are never rows in a label list.
 */
export function useUserLabels(accountId: string | undefined): Label[] {
  const labels = useLabels(accountId)
  const data = labels.data
  return useMemo(() => (data ?? []).filter((label) => label.type === 'user'), [data])
}

export function useThreads(view: MailView) {
  const service = useMailService()
  return useQuery({ queryKey: keys.threads(view), queryFn: () => service.listThreads(view) })
}

const NO_CORRESPONDENTS: EmailAddress[] = []
const CORRESPONDENT_LIMIT = 200

/** Recent people from every mailbox folder, normalized once in the query cache. */
export function useCorrespondents(accountId?: string): EmailAddress[] {
  const service = useMailService()
  const { selfEmails } = useAccountsById()
  const query = useQuery({
    queryKey: keys.correspondents(accountId, selfEmails),
    enabled: selfEmails.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const lists = await Promise.all(FOLDERS.map(({ folder, label }) => service.listThreads(
        accountId
          ? { kind: 'account', accountId, labelId: label }
          : { kind: 'unified', folder },
        { limit: CORRESPONDENT_LIMIT },
      )))
      const seenThreads = new Set<string>()
      const addresses: EmailAddress[] = []
      for (const thread of lists.flat()) {
        if (seenThreads.has(thread.key)) continue
        seenThreads.add(thread.key)
        for (const address of thread.participants) {
          const email = address.email.trim().toLowerCase()
          if (!email) continue
          const name = address.name?.trim()
          addresses.push(name ? { email, name } : { email })
        }
      }
      const self = new Set(selfEmails)
      return correspondents(dedupeAddresses(addresses), selfEmails)
        .filter((address) => !self.has(address.email))
        .slice(0, CORRESPONDENT_LIMIT)
    },
  })
  return query.data ?? NO_CORRESPONDENTS
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

/** `enabled: false` for a count nothing is showing — the native tab badge. */
export function useUnreadCount(view: MailView, options: { enabled?: boolean } = {}) {
  const service = useMailService()
  return useQuery({
    queryKey: keys.unread(view),
    queryFn: () => service.unreadCount(view),
    enabled: options.enabled ?? true,
  })
}

/** How many threads are waiting in Later — the sidebar row's count. */
export function useDeferredCount() {
  const service = useMailService()
  return useQuery({ queryKey: keys.deferred, queryFn: () => service.deferredCount() })
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

/**
 * The change one label row makes, from the state it is in.
 *
 * `on` means the thread already carries the label, so the row takes it off.
 * Both shells draw this row and both wrote the pair of arrays out by hand,
 * which is one transposition away from a row that adds what it says it removes.
 */
export function toggleLabelChange(labelId: string, on: boolean): LabelChanges {
  return on
    ? { addLabelIds: [], removeLabelIds: [labelId] }
    : { addLabelIds: [labelId], removeLabelIds: [] }
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
          // A reply, an archive and a trash all end a deferral, so the Later
          // count moves on events that never mention Later.
          void client.invalidateQueries({ queryKey: keys.deferred })
          void client.invalidateQueries({ queryKey: ['correspondents'] })
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
          void client.invalidateQueries({ queryKey: ['correspondents'] })
          break
        case 'settingsChanged':
          void client.invalidateQueries({ queryKey: keys.settings })
          break
        case 'syncStatus':
          break
      }
    })
  }, [service, client])
}

/**
 * Per-account sync state for the sidebar footer.
 *
 * This is a PARTIAL record, filled only by events: an account that has not
 * emitted yet is absent, not idle. Callers must judge against the real account
 * list in both directions — a missing key means "not heard from", and a key
 * with no account behind it is a status left over from a removed account.
 * Reading it with `.some()` alone is what let four accounts with one status
 * render "Up to date", a positive claim about three accounts the app had heard
 * nothing about.
 */
export function useSyncStatus() {
  const service = useMailService()
  const [statuses, setStatuses] = useState<Record<string, SyncStatus>>({})
  useEffect(() => {
    return service.onEvent((event) => {
      if (event.type !== 'syncStatus') return
      // Straight assignment: the service merges lastSyncAt across a state
      // change before it emits, so every subscriber — including one that
      // mounts after a failure and gets a replay — holds the same object.
      // Doing that merge here instead let two components disagree.
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

/**
 * Patch one thread in every cached list, and drop it from any list it no longer
 * belongs to. Returns the lists AS THEY WERE, which is what the rollback needs.
 *
 * Shared by the two optimistic mutations. "Does this thread still belong in
 * this list" has exactly one answer — `threadMatchesView` — and asking it from
 * two near-identical loops is how the archive rule and the Later rule would
 * eventually disagree about the same list.
 */
function patchLists(
  client: QueryClient,
  threadKey: string,
  transform: (thread: Thread) => Thread,
  now: number,
): [readonly unknown[], Thread[] | undefined][] {
  const lists = client.getQueriesData<Thread[]>({ queryKey: ['threads'] })
  for (const [queryKey, threads] of lists) {
    if (!threads) continue
    const view = queryKey[2] as MailView | undefined
    const updated = threads
      .map((t) => (t.key === threadKey ? transform(t) : t))
      .filter((t) => t.key !== threadKey || !view || threadMatchesView(t, view, now))
    client.setQueryData(queryKey, updated)
  }
  return lists
}

/** Put back exactly what `patchLists` and the detail read found. */
function restore(client: QueryClient, threadKey: string, context: ActionContext | undefined): void {
  for (const [queryKey, threads] of context?.lists ?? []) client.setQueryData(queryKey, threads)
  if (context?.detail) client.setQueryData(keys.thread(threadKey), context.detail)
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

/** Register a deliberate action and show the shared one-slot undo toast. */
export function registerUndoable(
  mutate: (action: MailAction) => void,
  action: MailAction,
  description?: string,
): void {
  registerActionUndo(mutate, action)
  showUndoToast(UNDO_LABELS[action.type], description)
}

/**
 * Save a thread for later, or take the deferral off with `null`.
 *
 * Modelled on `usePerformAction`'s optimistic half, and separate from it for
 * the same reason `defer` is not a `MailActionType`: this changes no labels.
 * There is no sound — `complete` is reserved for archive and trash, and
 * deferring is an intent rather than a completion.
 */
interface DeferInput {
  threadKey: string
  wakeAt: number | null
}

export function useDefer() {
  const service = useMailService()
  const client = useQueryClient()

  return useMutation<void, Error, DeferInput, ActionContext>({
    mutationFn: ({ threadKey, wakeAt }) => service.defer(threadKey, wakeAt),
    onMutate: async ({ threadKey: key, wakeAt }) => {
      // The commit, not the sheet, so the reading toolbar and the desktop list
      // get it too. `defer` is the soundless cue, and it carries its own
      // window; `lib/cue.ts` states both.
      cue('defer')
      await client.cancelQueries({ queryKey: ['threads'] })
      const detail = client.getQueryData<{ thread: Thread; messages: Message[] }>(keys.thread(key))

      // The row has to leave the inbox list before the service answers, and it
      // has to APPEAR in Later's list for the same reason — both fall out of
      // `threadMatchesView` once `deferredUntil` is patched, so neither view
      // needs a rule of its own here.
      const lists = patchLists(
        client,
        key,
        (t) => ({ ...t, deferredUntil: wakeAt ?? undefined }),
        Date.now(),
      )

      if (detail) {
        client.setQueryData(keys.thread(key), {
          ...detail,
          thread: { ...detail.thread, deferredUntil: wakeAt ?? undefined },
        })
      }

      return { lists, detail }
    },
    onError: (_error, { threadKey: key }, context) => {
      playSound('error')
      restore(client, key, context)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['threads'] })
      void client.invalidateQueries({ queryKey: ['unread'] })
      void client.invalidateQueries({ queryKey: keys.deferred })
    },
  })
}

/**
 * Bring due deferrals back, on the clock the whole UI already shares.
 *
 * It rides `useNow`'s single 60-second interval rather than adding a timer of
 * its own — standing order, and this repo's own lazy-sweep doctrine: a timer
 * would be a persistent monitor for a queue that is usually empty, and
 * `wake_at > now` cannot be wrong at the moment somebody looks. Under
 * `?screenshot=1` the clock is frozen, so captures get this for free.
 *
 * It invalidates only when the sweep reports something actually moved.
 */
export function useWakeSweep(): void {
  const service = useMailService()
  const client = useQueryClient()
  const now = useNow()
  useEffect(() => {
    let cancelled = false
    void service.wakeDeferred(now).then((woken) => {
      if (cancelled || woken === 0) return
      void client.invalidateQueries({ queryKey: ['threads'] })
      void client.invalidateQueries({ queryKey: ['unread'] })
      void client.invalidateQueries({ queryKey: keys.deferred })
    })
    return () => {
      cancelled = true
    }
  }, [service, client, now])
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
      // warns about. `cue` carries the 400 ms guard for the sound and the
      // haptic together, so a held `e` down a mailbox, or a bulk archive that
      // fans out one mutation per thread, is one confirmation (lib/cue.ts).
      if (action.type === 'archive' || action.type === 'trash') {
        cue('complete')
      }
      await client.cancelQueries({ queryKey: ['threads'] })
      const detail = client.getQueryData<{ thread: Thread; messages: Message[] }>(
        keys.thread(action.threadKey),
      )

      const lists = patchLists(
        client,
        action.threadKey,
        (t) => applyActionToThread(t, action.type),
        Date.now(),
      )

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
      restore(client, action.threadKey, context)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['threads'] })
      void client.invalidateQueries({ queryKey: ['unread'] })
    },
  })
}
