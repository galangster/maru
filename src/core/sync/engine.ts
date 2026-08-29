// Per-account sync. One engine owns one Gmail account's cursor and timer.
//
// Cost shape (2026-05 quota model, 4,500 units/min budget):
//
//   backfill    threads.list (10/page of 100) + threads.get?format=metadata
//               batched 50 at a time (40 each). One threads.get returns every
//               message in the thread with headers, so the alternative —
//               threads.get?format=minimal then a messages.get per message —
//               costs 40 + 20n for the same data. Metadata only: bodies are
//               lazy, because messages.get is 20 units whatever the format.
//   incremental history.list (2) + one metadata refetch of the touched threads.
//   bodies      messages.get?format=full (20 each) batched per thread, on
//               demand from the reading pane plus a low-priority prefetch of
//               the newest threads.
//
// A 404 from history.list is routine, not exceptional: Google only promises
// "typically a week" of historyId validity and warns it can be hours.

import type { Store } from '../store/db'
import { mapGmailMessage, mapGmailThread } from '../gmail/mapping'
import { HttpError } from '../gmail/limiter'
import { MAX_BATCH_SIZE } from '../gmail/api'
import type {
  GmailHistoryResponse,
  GmailLabel,
  GmailListThreadsResponse,
  GmailMessage,
  GmailProfile,
  GmailThread,
  HistoryType,
  MessageFormat,
  ThreadFormat,
} from '../gmail/types'
import type { Label, MailEvent, Message, SyncStatus, Thread } from '../types'
import { threadKey } from '../types'

export const WINDOW_QUERY = 'newer_than:90d'
export const PREFETCH_LIMIT = 60
export const HISTORY_TYPES: HistoryType[] = ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']

/** The slice of GmailApi the engine depends on. GmailApi satisfies it. */
export interface SyncGmailClient {
  profile(): Promise<GmailProfile>
  listLabels(): Promise<GmailLabel[]>
  listThreads(params: { q?: string; labelIds?: string[]; pageToken?: string; maxResults?: number }): Promise<GmailListThreadsResponse>
  batchGetThreads(ids: string[], format?: ThreadFormat): Promise<GmailThread[]>
  batchGetMessages(ids: string[], format?: MessageFormat): Promise<GmailMessage[]>
  listHistory(params: {
    startHistoryId: string
    historyTypes?: HistoryType[]
    pageToken?: string
  }): Promise<GmailHistoryResponse>
}

export interface SyncEngineOptions {
  api: SyncGmailClient
  store: Store
  accountId: string
  emit: (e: MailEvent) => void
  now?: () => number
  /** Lets the search index track exactly what changed. */
  onThreadsUpserted?: (threads: Thread[]) => void
  onThreadsRemoved?: (keys: string[]) => void
  /**
   * Fires whenever a thread's bodies go from metadata to full, on demand or
   * on prefetch. The search index feeds on this: without it, real mode would
   * only ever match subjects and snippets while the palette promises to search
   * the message.
   */
  onBodiesHydrated?: (key: string, messages: Message[]) => void
}

function mapLabel(accountId: string, l: GmailLabel): Label {
  return {
    id: l.id,
    accountId,
    name: l.name,
    type: l.type === 'system' ? 'system' : 'user',
    unreadCount: l.threadsUnread ?? l.messagesUnread,
  }
}

export class SyncEngine {
  private readonly api: SyncGmailClient
  private readonly store: Store
  readonly accountId: string
  private readonly emit: (e: MailEvent) => void
  private readonly now: () => number
  private readonly onThreadsUpserted?: (threads: Thread[]) => void
  private readonly onThreadsRemoved?: (keys: string[]) => void
  private readonly onBodiesHydrated?: (key: string, messages: Message[]) => void

  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private stopped = false

  constructor(opts: SyncEngineOptions) {
    this.api = opts.api
    this.store = opts.store
    this.accountId = opts.accountId
    this.emit = opts.emit
    this.now = opts.now ?? Date.now
    this.onThreadsUpserted = opts.onThreadsUpserted
    this.onThreadsRemoved = opts.onThreadsRemoved
    this.onBodiesHydrated = opts.onBodiesHydrated
  }

  // -- status ---------------------------------------------------------------

  private status(state: SyncStatus['state'], extra: Partial<SyncStatus> = {}): void {
    this.emit({ type: 'syncStatus', status: { accountId: this.accountId, state, ...extra } })
  }

  private failed(err: unknown): void {
    this.status('error', { error: err instanceof Error ? err.message : String(err) })
  }

  // -- storage helpers ------------------------------------------------------

  /** Maps and stores raw threads. Returns the domain threads it wrote. */
  private async storeThreads(raw: GmailThread[]): Promise<Thread[]> {
    const threads: Thread[] = []
    const messages: Message[] = []
    for (const t of raw) {
      const mapped = (t.messages ?? []).map((m) => mapGmailMessage(this.accountId, m))
      messages.push(...mapped)
      threads.push(mapGmailThread(this.accountId, t, mapped))
    }
    if (threads.length) await this.store.upsertThreads(threads)
    if (messages.length) await this.store.upsertMessages(messages)
    if (threads.length) this.onThreadsUpserted?.(threads)
    return threads
  }

  private async removeThreads(keys: string[]): Promise<void> {
    if (!keys.length) return
    await this.store.deleteThreads(keys)
    this.onThreadsRemoved?.(keys)
  }

  /** Every thread id in the 90-day window, inbox side and trash side. */
  private async listWindowThreadIds(): Promise<string[]> {
    const ids: string[] = []
    // threads.list hides SPAM and TRASH unless asked, so trash needs its own
    // pass or trashed threads would look deleted to the diff.
    for (const labelIds of [undefined, ['TRASH']]) {
      let pageToken: string | undefined
      do {
        const page = await this.api.listThreads({ q: WINDOW_QUERY, labelIds, pageToken, maxResults: 100 })
        for (const t of page.threads ?? []) ids.push(t.id)
        pageToken = page.nextPageToken
      } while (pageToken && !this.stopped)
    }
    return [...new Set(ids)]
  }

  private async hydrateThreads(ids: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
      if (this.stopped) return
      const group = ids.slice(i, i + MAX_BATCH_SIZE)
      await this.storeThreads(await this.api.batchGetThreads(group, 'metadata'))
      onProgress?.(Math.min(i + group.length, ids.length), ids.length)
    }
  }

  // -- backfill -------------------------------------------------------------

  async fullBackfill(): Promise<void> {
    this.status('syncing', { progress: 0 })
    try {
      // Read the cursor BEFORE listing, so anything that lands mid-backfill is
      // replayed by the first incremental pass instead of being missed.
      const profile = await this.api.profile()
      await this.store.replaceLabels(
        this.accountId,
        (await this.api.listLabels()).map((l) => mapLabel(this.accountId, l)),
      )

      const ids = await this.listWindowThreadIds()
      await this.hydrateThreads(ids, (done, total) => {
        this.status('syncing', { progress: total === 0 ? 1 : done / total })
        this.emit({ type: 'threadsChanged', accountId: this.accountId })
      })

      await this.store.setSyncState({
        accountId: this.accountId,
        historyId: profile.historyId,
        lastFullSync: this.now(),
      })
      this.emit({ type: 'threadsChanged', accountId: this.accountId })
      this.status('idle', { lastSyncAt: this.now() })
    } catch (err) {
      // Surfaces in the dev log; the UI only shows a short status string.
      const detail =
        err instanceof Error ? `${err.name} | ${err.message} | ${err.stack?.split('\n')[1] ?? ''}` : JSON.stringify(err)
      console.error('[wren] backfill failed:', detail)
      this.failed(err)
      throw err
    }
  }

  // -- incremental ----------------------------------------------------------

  async incrementalSync(): Promise<void> {
    const state = await this.store.getSyncState(this.accountId)
    if (!state?.historyId) {
      await this.fullBackfill()
      return
    }

    this.status('syncing')
    try {
      const records: NonNullable<GmailHistoryResponse['history']> = []
      let historyId = state.historyId
      let pageToken: string | undefined

      try {
        do {
          const page = await this.api.listHistory({
            startHistoryId: state.historyId,
            historyTypes: HISTORY_TYPES,
            pageToken,
          })
          records.push(...(page.history ?? []))
          if (page.historyId) historyId = page.historyId
          pageToken = page.nextPageToken
        } while (pageToken && !this.stopped)
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
          // Cursor expired. Routine — rebuild the window and carry on.
          await this.resyncWindow()
          this.status('idle', { lastSyncAt: this.now() })
          return
        }
        throw err
      }

      await this.applyHistory(records)
      await this.store.setSyncState({ accountId: this.accountId, historyId })
      this.status('idle', { lastSyncAt: this.now() })
    } catch (err) {
      this.failed(err)
      throw err
    }
  }

  private async applyHistory(records: NonNullable<GmailHistoryResponse['history']>): Promise<void> {
    const touched = new Set<string>()
    const newMailThreads = new Map<string, GmailMessage>()

    for (const record of records) {
      for (const group of [record.messagesAdded, record.messagesDeleted, record.labelsAdded, record.labelsRemoved]) {
        for (const ref of group ?? []) touched.add(ref.message.threadId)
      }
      for (const ref of record.messagesAdded ?? []) {
        const labels = ref.message.labelIds ?? []
        if (labels.includes('INBOX') && labels.includes('UNREAD') && !newMailThreads.has(ref.message.threadId)) {
          newMailThreads.set(ref.message.threadId, ref.message)
        }
      }
    }
    if (touched.size === 0) return

    // Snapshot the local unread state before the refetch overwrites it: a
    // thread that was already unread is not "new mail" arriving.
    const wasUnread = new Map<string, boolean>()
    for (const id of newMailThreads.keys()) {
      const local = await this.store.getThread(threadKey(this.accountId, id))
      wasUnread.set(id, local?.unread ?? false)
    }

    const ids = [...touched]
    const fetched = await this.api.batchGetThreads(ids, 'metadata')
    const stored = await this.storeThreads(fetched)
    const present = new Set(fetched.map((t) => t.id))
    await this.removeThreads(ids.filter((id) => !present.has(id)).map((id) => threadKey(this.accountId, id)))

    // History names exactly which threads moved, so say so: a listener can
    // then refresh those and leave every other open thread alone.
    this.emit({
      type: 'threadsChanged',
      accountId: this.accountId,
      threadKeys: ids.map((id) => threadKey(this.accountId, id)),
    })

    // One arrival event for the whole pass. This method is the only place that
    // knows where the pass ends, so the count is stated here rather than
    // rebuilt downstream from a burst of single events behind a timer — which
    // is what the notification layer used to do, and it had to guess how long
    // to wait. History records run oldest-first, so the last arrival is the
    // newest and is the one the event names.
    const byKey = new Map(stored.map((t) => [t.key, t]))
    let arrivals = 0
    let newest: { threadKey: string; from: string; subject: string } | null = null
    for (const [gmailThreadId, message] of newMailThreads) {
      if (wasUnread.get(gmailThreadId)) continue
      const key = threadKey(this.accountId, gmailThreadId)
      const thread = byKey.get(key)
      if (!thread) continue
      const mapped = mapGmailMessage(this.accountId, message)
      arrivals += 1
      newest = {
        threadKey: key,
        from: mapped.from.name ?? mapped.from.email,
        subject: thread.subject || mapped.subject,
      }
    }
    if (newest) {
      this.emit({ type: 'newMail', accountId: this.accountId, threads: arrivals, ...newest })
    }
  }

  /** Cheap, routine recovery from an expired historyId. */
  async resyncWindow(): Promise<void> {
    const profile = await this.api.profile()
    const remoteIds = await this.listWindowThreadIds()
    const remoteKeys = new Set(remoteIds.map((id) => threadKey(this.accountId, id)))

    const localKeys = await this.store.listThreadKeys(this.accountId)
    await this.removeThreads(localKeys.filter((key) => !remoteKeys.has(key)))

    await this.hydrateThreads(remoteIds)
    await this.store.setSyncState({ accountId: this.accountId, historyId: profile.historyId })
    this.emit({ type: 'threadsChanged', accountId: this.accountId })
  }

  // -- bodies ---------------------------------------------------------------

  async ensureBodies(key: string): Promise<Message[]> {
    return this.hydrate(key, await this.store.listMessages(key))
  }

  /**
   * The same work as ensureBodies, for a caller that has already read the
   * thread's messages. Opening a thread used to cost three reads of the same
   * rows — one to show the thread, one here, one after the write.
   */
  async hydrate(key: string, messages: Message[]): Promise<Message[]> {
    const missing = messages.filter((m) => m.bodyState !== 'full')
    if (missing.length === 0) return messages

    const raw = await this.api.batchGetMessages(
      missing.map((m) => m.id),
      'full',
    )
    if (!raw.length) return messages
    await this.store.upsertMessages(raw.map((m) => mapGmailMessage(this.accountId, m)))
    const hydrated = await this.store.listMessages(key)
    this.onBodiesHydrated?.(key, hydrated)
    return hydrated
  }

  /** Low-priority warm-up so opening a recent thread is instant. */
  async prefetchBodies(limit = PREFETCH_LIMIT): Promise<void> {
    const keys = await this.store.threadsNeedingBodies(limit)
    for (const key of keys) {
      if (this.stopped) return
      try {
        await this.ensureBodies(key)
      } catch {
        // A prefetch miss is never worth surfacing; the reading pane retries.
        return
      }
    }
  }

  // -- polling --------------------------------------------------------------

  /** One timer per account. A tick that lands mid-run is skipped, not queued. */
  startPolling(intervalSec: number): void {
    this.stop()
    this.stopped = false
    this.timer = setInterval(() => {
      // incrementalSync already emitted any error status worth showing.
      void this.refresh().catch(() => undefined)
    }, Math.max(5, intervalSec) * 1000)
  }

  /** Manual refresh. Shares the in-flight guard with the poll timer. */
  async refresh(): Promise<void> {
    if (this.running || this.stopped) return
    this.running = true
    try {
      await this.incrementalSync()
    } finally {
      this.running = false
    }
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
