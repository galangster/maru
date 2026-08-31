// RealMailService — the Gmail-backed MailService the app runs by default.
//
// It owns one GmailApi + SyncEngine + TokenManager per account, one store, and
// one search index. Actions are optimistic: the local write and the
// threadsChanged event happen first, the Gmail call second, and a failure
// restores the exact rows that were replaced.

import { searchWithOperators } from '../search/operators'
import type { Platform } from '../platform'
import type { Store } from '../store/db'
import { GmailApi } from '../gmail/api'
import { GMAIL_BUDGET_PER_MINUTE, TokenBucket } from '../gmail/limiter'
import { SyncEngine, type SyncGmailClient } from '../sync/engine'
import { syncFailure } from '../sync/failure'
import { ThreadSearchIndex } from '../search/index'
import { TokenManager, TokenStore, runAuthFlow as defaultRunAuthFlow, type AuthFlowResult } from '../auth/oauth'
import { resolveOAuthClient } from '../auth/client-config'
import { buildRawMessage } from '../mime'
import { applyLabelChanges, applyActionToThread, isTrashAction, labelDelta } from './actions'
import { bodyTextOf, sentRowsFor } from './sent'
import { accountColor } from '../palette'
import type { GmailMessage, GmailThread } from '../gmail/types'
import type {
  LabelChanges,
  Account,
  ComposeDraft,
  GetThreadOptions,
  Label,
  MailAction,
  MailEvent,
  MailService,
  MailView,
  Message,
  Settings,
  Thread,
  ListThreadsOptions,
  SyncStatus,
} from '../types'
import { parseThreadKey, threadKey } from '../types'

/** The Gmail surface the service needs: sync reads plus the write endpoints. */
export interface MailGmailClient extends SyncGmailClient {
  modifyThread(id: string, labels: { addLabelIds?: string[]; removeLabelIds?: string[] }): Promise<GmailThread>
  trashThread(id: string): Promise<GmailThread>
  untrashThread(id: string): Promise<GmailThread>
  sendMessage(raw: string, threadId?: string): Promise<GmailMessage>
  getAttachment(messageId: string, attachmentId: string): Promise<Uint8Array>
}

export class MissingOAuthClientError extends Error {
  readonly code = 'missing_oauth_client'
  // Read by isClientFailure(), which tests the property rather than the
  // constructor. Without it this lands as an untyped error and the footer
  // classes "no OAuth client is configured" as a network blip it is retrying
  // — forever, for a state no retry can reach. The remedy is Settings →
  // Google, which is exactly where clientFailure already sends people.
  readonly clientFailure = true
  constructor() {
    // Thrown from addAccount AND from attach on an existing account, so the
    // wording assumes neither. A build with an official client never throws it.
    super('No Google OAuth client is configured. Add your client ID in Settings.')
    this.name = 'MissingOAuthClientError'
  }
}

export class UnknownThreadError extends Error {
  constructor(key: string) {
    super(`No such thread: ${key}`)
    this.name = 'UnknownThreadError'
  }
}

export interface RealMailServiceOptions {
  platform: Platform
  store: Store
  /** Overridable so tests can drive the service without a network. */
  createClient?: (accountId: string, clientId: string, clientSecret?: string) => MailGmailClient
  runAuthFlow?: (platform: Platform, clientId: string, clientSecret?: string) => Promise<AuthFlowResult>
  /** False in tests: skip the backfill and the poll timer. */
  autoStart?: boolean
  newId?: () => string
  now?: () => number
}

interface AccountRuntime {
  account: Account
  client: MailGmailClient
  engine: SyncEngine
}

export class RealMailService implements MailService {
  private readonly platform: Platform
  private readonly store: Store
  private readonly tokenStore: TokenStore
  private readonly index = new ThreadSearchIndex()
  private readonly listeners = new Set<(e: MailEvent) => void>()
  private readonly runtimes = new Map<string, AccountRuntime>()
  private readonly createClient: (accountId: string, clientId: string, clientSecret?: string) => MailGmailClient
  private readonly authFlow: (platform: Platform, clientId: string, clientSecret?: string) => Promise<AuthFlowResult>
  private readonly autoStart: boolean
  private readonly newId: () => string
  private readonly now: () => number
  /** Resolves once the startup index is built. See buildIndex. */
  private indexReady: Promise<void> = Promise.resolve()

  private constructor(opts: RealMailServiceOptions) {
    this.platform = opts.platform
    this.store = opts.store
    this.tokenStore = new TokenStore(opts.platform)
    this.autoStart = opts.autoStart ?? true
    this.newId = opts.newId ?? (() => crypto.randomUUID())
    this.now = opts.now ?? Date.now
    this.authFlow = opts.runAuthFlow ?? defaultRunAuthFlow
    this.createClient = opts.createClient ?? ((accountId, clientId, clientSecret) => this.gmailApi(accountId, clientId, clientSecret))
  }

  static async create(opts: RealMailServiceOptions): Promise<RealMailService> {
    const service = new RealMailService(opts)
    await service.start()
    return service
  }

  private gmailApi(accountId: string, clientId: string, clientSecret?: string): MailGmailClient {
    const tokens = new TokenManager({
      platform: this.platform,
      store: this.tokenStore,
      accountId,
      clientId,
      clientSecret,
    })
    return new GmailApi({
      platform: this.platform,
      accountId,
      tokens,
      bucket: new TokenBucket({ capacity: GMAIL_BUDGET_PER_MINUTE, refillPerMinute: GMAIL_BUDGET_PER_MINUTE }),
    })
  }

  private async start(): Promise<void> {
    // Three independent reads of three tables: the window opens a full SQLite
    // round trip sooner for doing them at once.
    const [threads, settings, accounts] = await Promise.all([
      this.store.allThreads(),
      this.store.getSettings(),
      this.store.listAccounts(),
    ])
    for (const account of accounts) await this.bringUp(account, settings)
    this.indexReady = this.buildIndex(threads)
  }

  /**
   * Attach one account and start its sync, reporting failure as that
   * account's own status.
   *
   * One account with an unreadable token record or no resolvable client must
   * not take the whole service down — it surfaces alone, and every other
   * account still syncs. Shared with `refresh()`, which retries exactly the
   * accounts this failed on.
   */
  private async bringUp(account: Account, settings: Settings): Promise<void> {
    try {
      const runtime = await this.attach(account, settings)
      if (this.autoStart) this.beginSync(runtime, settings)
    } catch (err) {
      this.emit({ type: 'syncStatus', status: syncFailure(account.id, err) })
    }
  }

  /**
   * Building the MiniSearch index over a 90-day window is the one long
   * synchronous block on startup, and nothing on the first frame needs it —
   * only search does. It runs when the main thread is next free, and `search`
   * waits for it rather than answering from a half-built index.
   *
   * Threads the sync engine has already indexed are skipped: this snapshot is
   * the older of the two by then.
   */
  private buildIndex(threads: Thread[]): Promise<void> {
    const fill = () => this.index.upsertMany(threads.filter((t) => !this.index.has(t.key)))
    if (!this.autoStart) {
      fill()
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const run = () => {
        fill()
        resolve()
      }
      const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: object) => number })
        .requestIdleCallback
      if (typeof idle === 'function') idle(run, { timeout: 2000 })
      else setTimeout(run, 0)
    })
  }

  private async attach(account: Account, settings: Settings): Promise<AccountRuntime> {
    if (this.runtimes.has(account.id)) return this.runtimes.get(account.id)!
    const stored = await this.tokenStore.load(account.id)
    const oauthClient = resolveOAuthClient({ issuingClient: stored, settings })
    if (!oauthClient) throw new MissingOAuthClientError()
    const client = this.createClient(account.id, oauthClient.clientId, oauthClient.clientSecret)
    const engine = new SyncEngine({
      api: client,
      store: this.store,
      accountId: account.id,
      emit: (e) => this.emit(e),
      now: this.now,
      onThreadsUpserted: (threads) => this.index.upsertMany(threads),
      onThreadsRemoved: (keys) => this.index.removeMany(keys),
      // Bodies are lazy, so this is the only moment real mode ever sees one.
      // Without it the palette would promise to search the message and match
      // subjects and snippets only.
      onBodiesHydrated: (key, messages) => this.index.setBody(key, bodyTextOf(messages)),
    })
    const runtime: AccountRuntime = { account, client, engine }
    this.runtimes.set(account.id, runtime)
    return runtime
  }

  /** Backfill runs detached: the UI shows fixtures-free empty state meanwhile. */
  private beginSync(runtime: AccountRuntime, settings: Settings): void {
    void (async () => {
      try {
        const state = await this.store.getSyncState(runtime.account.id)
        if (state?.historyId) await runtime.engine.incrementalSync()
        else await runtime.engine.fullBackfill()
        await runtime.engine.prefetchBodies()
      } catch {
        // The engine already emitted an error status.
      }
    })()
    runtime.engine.startPolling(settings.pollIntervalSec)
  }

  private runtime(accountId: string): AccountRuntime {
    const runtime = this.runtimes.get(accountId)
    if (!runtime) throw new Error(`Account ${accountId} is not signed in`)
    return runtime
  }

  // -- events ---------------------------------------------------------------

  /** Sync status is emit-only state, and startup errors fire before any UI
   *  listener exists — so the last status per account is retained and
   *  replayed to each new subscriber, or the per-account failure isolation
   *  in start() would signal into a room with nobody in it. */
  private readonly lastSyncStatus = new Map<string, SyncStatus>()

  onEvent(cb: (e: MailEvent) => void): () => void {
    this.listeners.add(cb)
    for (const status of this.lastSyncStatus.values()) cb({ type: 'syncStatus', status })
    return () => this.listeners.delete(cb)
  }

  private emit(e: MailEvent): void {
    if (e.type === 'syncStatus') {
      // Carry lastSyncAt across a state change, HERE rather than in each
      // subscriber. The engine writes it only on success, so an error would
      // otherwise erase the last-success time — and "mail stopped a minute
      // ago" versus "six days ago" is the whole difference between waiting
      // and acting. Doing it at the emitter also keeps every subscriber
      // agreeing: replayed status and live status are now the same object,
      // so a component that mounts after a failure sees what the sidebar has
      // seen since boot. An explicit lastSyncAt in the event still wins.
      const prev = this.lastSyncStatus.get(e.status.accountId)
      const merged: SyncStatus = { lastSyncAt: prev?.lastSyncAt, ...e.status }
      this.lastSyncStatus.set(merged.accountId, merged)
      e = { ...e, status: merged }
    }
    for (const cb of [...this.listeners]) cb(e)
  }

  // -- accounts -------------------------------------------------------------

  async listAccounts(): Promise<Account[]> {
    return this.store.listAccounts()
  }

  async addAccount(): Promise<Account> {
    const settings = await this.store.getSettings()
    const oauthClient = resolveOAuthClient({ settings })
    if (!oauthClient) throw new MissingOAuthClientError()

    const result = await this.authFlow(
      this.platform,
      oauthClient.clientId,
      oauthClient.clientSecret,
    )

    const existing = await this.store.listAccounts()

    // Signing in with an address Maru already holds is a RE-LINK, not an
    // error: fresh tokens under the existing account, and its engine
    // restarts. This is the whole recovery path for an expired grant (P4) —
    // Google's testing-mode consent screen kills refresh tokens after seven
    // days, and "Add account" has to be the way back in.
    const current = existing.find((a) => a.email.toLowerCase() === result.email.toLowerCase())
    const account: Account = current ?? {
      id: this.newId(),
      email: result.email,
      displayName: result.email.split('@')[0],
      color: accountColor(existing.length),
      addedAt: this.now(),
    }

    await this.tokenStore.save(account.id, {
      refreshToken: result.tokens.refreshToken,
      accessToken: result.tokens.accessToken,
      expiresAt: result.tokens.expiresAt,
      clientId: oauthClient.clientId,
      source: oauthClient.source,
    })
    if (current) {
      this.runtimes.get(current.id)?.engine.stop()
      this.runtimes.delete(current.id)
    } else {
      await this.store.upsertAccount(account)
    }

    const runtime = await this.attach(account, settings)
    this.emit({ type: 'accountsChanged' })
    if (this.autoStart) this.beginSync(runtime, settings)
    return account
  }

  async removeAccount(accountId: string): Promise<void> {
    this.runtimes.get(accountId)?.engine.stop()
    this.runtimes.delete(accountId)
    const keys = await this.store.listThreadKeys(accountId)
    await this.store.deleteAccount(accountId, this.now())
    await this.tokenStore.clear(accountId)
    this.index.removeMany(keys)
    this.emit({ type: 'accountsChanged' })
    this.emit({ type: 'threadsChanged' })
  }

  // -- reads ----------------------------------------------------------------

  listThreads(view: MailView, opts?: ListThreadsOptions): Promise<Thread[]> {
    return this.store.listThreads(view, opts)
  }

  async getThread(
    key: string,
    opts: GetThreadOptions = {},
  ): Promise<{ thread: Thread; messages: Message[] }> {
    const [thread, messages] = await Promise.all([
      this.store.getThread(key),
      this.store.listMessages(key),
    ])
    if (!thread) throw new UnknownThreadError(key)
    if (!opts.hydrate) return { thread, messages }
    const { accountId } = parseThreadKey(key)
    // Hand the rows we already hold to the engine, so a thread whose bodies
    // are warm is one read of the messages table instead of three.
    return { thread, messages: await this.runtime(accountId).engine.hydrate(key, messages) }
  }

  async ensureBodies(key: string): Promise<Message[]> {
    const { accountId } = parseThreadKey(key)
    return this.runtime(accountId).engine.ensureBodies(key)
  }

  async getAttachment(key: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
    const { accountId } = parseThreadKey(key)
    return this.runtime(accountId).client.getAttachment(messageId, attachmentId)
  }

  listLabels(accountId: string): Promise<Label[]> {
    return this.store.listLabels(accountId)
  }

  unreadCount(view: MailView): Promise<number> {
    return this.store.countUnread(view)
  }

  async search(q: string): Promise<Thread[]> {
    await this.indexReady
    const accounts = await this.store.listAccounts()
    const labels = (
      await Promise.all(accounts.map((a) => this.store.listLabels(a.id)))
    ).flat()
    return searchWithOperators(this.index, q, labels)
  }

  async refresh(): Promise<void> {
    // Retry the accounts that never attached, first. `runtimes` is only
    // populated after attach() succeeds, so an account that failed at startup
    // — an unreadable keychain, a client that would not resolve — was absent
    // from this map and silently skipped. That made the "Try again" button
    // beside its own error row a control that did nothing: it disabled, it
    // re-enabled, and no request was made. Retrying is precisely what the
    // person asked for, and attach is where it has to happen.
    const [accounts, settings] = await Promise.all([
      this.store.listAccounts(),
      this.store.getSettings(),
    ])
    await Promise.all(
      accounts
        .filter((account) => !this.runtimes.has(account.id))
        .map((account) => this.bringUp(account, settings)),
    )

    await Promise.all(
      [...this.runtimes.values()].map(async (runtime) => {
        try {
          await runtime.engine.refresh()
        } catch {
          // The engine already emitted an error status.
        }
      }),
    )
  }

  // -- actions --------------------------------------------------------------

  async performAction(action: MailAction): Promise<void> {
    const { accountId, gmailThreadId } = parseThreadKey(action.threadKey)
    const before = await this.store.getThread(action.threadKey)
    if (!before) throw new UnknownThreadError(action.threadKey)

    const after = applyActionToThread(before, action.type)
    await this.store.upsertThreads([after])
    // Only the flag columns move: a star must not rewrite every body, every
    // address list and every attachment row in the thread.
    const beforeFlags = await this.store.setMessageFlags(action.threadKey, labelDelta(action.type))
    this.index.upsert(after)
    this.emit({ type: 'threadsChanged', accountId, threadKeys: [action.threadKey] })

    try {
      const client = this.runtime(accountId).client
      if (isTrashAction(action.type)) {
        if (action.type === 'trash') await client.trashThread(gmailThreadId)
        else await client.untrashThread(gmailThreadId)
      } else {
        const delta = labelDelta(action.type)
        await client.modifyThread(gmailThreadId, { addLabelIds: delta.add, removeLabelIds: delta.remove })
      }
    } catch (err) {
      // Put back exactly what was there; the optimistic write never sticks.
      // The prior flags are restored verbatim rather than by inverting the
      // delta, so a message that was already read stays read.
      await this.store.upsertThreads([before])
      await this.store.restoreMessageFlags(beforeFlags)
      this.index.upsert(before)
      this.emit({ type: 'threadsChanged', accountId, threadKeys: [action.threadKey] })
      // No syncStatus here. A failed archive is not a verdict on the account's
      // sync: the optimistic write is already rolled back above, the mutation
      // plays the error sound, and this rethrows. Emitting `error` made one
      // refused label change paint the account failed — untyped, so it read as
      // a network problem — and hold it until the next poll tick.
      throw err
    }
  }

  async modifyLabels(threadKey: string, changes: LabelChanges): Promise<void> {
    const { accountId, gmailThreadId } = parseThreadKey(threadKey)
    const before = await this.store.getThread(threadKey)
    if (!before) throw new UnknownThreadError(threadKey)

    // Optimistic on the thread row only: the thread's labelIds are the union
    // the chips and the views read, and the per-message rows reconcile on the
    // next history poll — a user label never moves a flag column.
    const after = { ...before, labelIds: applyLabelChanges(before.labelIds, changes) }
    await this.store.upsertThreads([after])
    this.index.upsert(after)
    this.emit({ type: 'threadsChanged', accountId, threadKeys: [threadKey] })

    try {
      await this.runtime(accountId).client.modifyThread(gmailThreadId, {
        addLabelIds: changes.addLabelIds,
        removeLabelIds: changes.removeLabelIds,
      })
    } catch (err) {
      // Put back exactly what was there, as performAction does.
      await this.store.upsertThreads([before])
      this.index.upsert(before)
      this.emit({ type: 'threadsChanged', accountId, threadKeys: [threadKey] })
      // No syncStatus — see performAction above.
      throw err
    }
  }

  // -- send -----------------------------------------------------------------

  async send(draft: ComposeDraft): Promise<void> {
    const accounts = await this.store.listAccounts()
    const account = accounts.find((a) => a.id === draft.accountId)
    if (!account) throw new Error(`No such account: ${draft.accountId}`)

    let gmailThreadId: string | undefined
    let inReplyTo: string | undefined
    let references: string | undefined
    let parentMessages: Message[] = []

    if (draft.reply) {
      const parent = await this.store.getThread(draft.reply.threadKey)
      if (!parent) throw new UnknownThreadError(draft.reply.threadKey)
      gmailThreadId = parent.gmailThreadId
      parentMessages = await this.store.listMessages(draft.reply.threadKey)
      const target =
        parentMessages.find((m) => m.id === draft.reply!.messageId) ??
        parentMessages[parentMessages.length - 1]
      inReplyTo = target?.rfcMessageId
      references = [target?.references, target?.rfcMessageId].filter(Boolean).join(' ') || undefined
    }

    const raw = buildRawMessage(draft, {
      fromEmail: account.email,
      fromName: account.displayName,
      inReplyTo,
      references,
      now: this.now(),
    })

    const sent = await this.runtime(account.id).client.sendMessage(raw, gmailThreadId)

    // Gmail's send response is minimal (id, threadId, labelIds), so the local
    // rows are built from the draft rather than round-tripping the message.
    const resolvedThreadId = sent.threadId ?? gmailThreadId ?? sent.id
    const sentKey = threadKey(account.id, resolvedThreadId)
    // Gmail can answer with a thread we already hold even when the draft was
    // not a reply, so the prior rows are read by key rather than assumed.
    const existingThread = await this.store.getThread(sentKey)
    const existingMessages =
      resolvedThreadId === gmailThreadId
        ? parentMessages
        : existingThread
          ? await this.store.listMessages(sentKey)
          : []

    const { key, message, messages, thread } = sentRowsFor(draft, {
      account,
      gmailThreadId: resolvedThreadId,
      messageId: sent.id,
      date: this.now(),
      labelIds: sent.labelIds,
      references,
      inReplyTo,
      attachmentId: (i) => `${sent.id}-att${i}`,
      existingThread,
      existingMessages,
    })

    await this.store.upsertMessages([message])
    await this.store.upsertThreads([thread])
    this.index.upsert(thread, bodyTextOf(messages))
    this.emit({ type: 'threadsChanged', accountId: account.id, threadKeys: [key] })
  }

  // -- settings -------------------------------------------------------------

  getSettings(): Promise<Settings> {
    return this.store.getSettings()
  }

  async setSettings(patch: Partial<Settings>): Promise<void> {
    await this.store.setSettings(patch)
    if (patch.pollIntervalSec !== undefined) {
      for (const runtime of this.runtimes.values()) runtime.engine.startPolling(patch.pollIntervalSec)
    }
  }

  /** Stops every timer. Call before the window closes. */
  dispose(): void {
    for (const runtime of this.runtimes.values()) runtime.engine.stop()
    this.listeners.clear()
  }
}
