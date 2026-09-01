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
import { isOfficialGoogleClientId } from '../auth/client-config'
import type { VaultLocal } from '../account/vault'
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
  runAuthFlow?: (
    platform: Platform,
    clientId: string,
    clientSecret?: string,
    opts?: { expectEmail?: string },
  ) => Promise<AuthFlowResult>
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
  private readonly authFlow: (
    platform: Platform,
    clientId: string,
    clientSecret?: string,
    opts?: { expectEmail?: string },
  ) => Promise<AuthFlowResult>
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
    // Two small reads, batched. `allThreads()` used to be the third, and that
    // was the bug: it is only needed by the search index on the LAST line, but
    // sharing a `Promise.all` with the two reads the account loop genuinely
    // needs meant **no account began syncing until every thread had been read
    // and decrypted**.
    //
    // Measured on the owner's real mailbox, 3607 threads: 1.5s once and 6.2s
    // on a second launch — logged by sqlx as a slow statement both times. That
    // was not a slower search box, it was six seconds before Maru asked Google
    // for mail, on every single launch, and it is the demo's opening shot.
    //
    // The comment that used to sit here said the batch existed so "the window
    // opens a full SQLite round trip sooner". True of the two small reads, and
    // exactly backwards for the big one.
    const [settings, accounts] = await Promise.all([
      this.store.getSettings(),
      this.store.listAccounts(),
    ])
    // The launch pass of Later's lazy sweep, and it belongs HERE rather than
    // only in React. A laptop closed for a week has wake times a week in the
    // past; if the first list render happens before the sweep stamps `woke_at`,
    // those threads render at list position ninety and then visibly jump to the
    // top a moment later. It is one indexed UPDATE over a table that is usually
    // empty — not the `allThreads()` mistake this method's comment above
    // records.
    await this.store.sweepDeferrals(this.now())
    for (const account of accounts) await this.bringUp(account, settings)
    this.indexReady = this.buildIndex()
    // Tests and captures run with autoStart false and want a service that is
    // fully settled when `create` resolves — the same contract they had when
    // the index was built inline. Production does not wait.
    if (!this.autoStart) await this.indexReady
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
  private buildIndex(): Promise<void> {
    // The READ moved in here with the indexing, and that is the point. Chaining
    // `allThreads().then(fill)` would have taken the await off the critical
    // path but still fired 3607 row decrypts the instant the service was
    // constructed — competing with the first frame and with the sync passes
    // that have just started. Inside the idle callback, the whole cost lands
    // when the main thread has nothing better to do.
    const fill = async () => {
      const threads = await this.store.allThreads()
      // Re-read the account list AFTER the threads, and index only what still
      // belongs to a live account.
      //
      // Deferring the build opened a window that awaiting it did not have: a
      // removeAccount landing between this read and the upsert would clear the
      // index and then have its rows put straight back, because the snapshot
      // in hand predates the deletion. The threads are gone from the store and
      // the account is gone from the sidebar, but search still answers with
      // them — the one place stale mail could outlive "delete my data".
      // Reading accounts second is what makes the check sound: any removal
      // that beat the thread read is also visible here.
      const live = new Set((await this.store.listAccounts()).map((a) => a.id))
      this.index.upsertMany(
        threads.filter((t) => live.has(t.accountId) && !this.index.has(t.key)),
      )
    }
    if (!this.autoStart) return fill()
    return new Promise<void>((resolve) => {
      const run = () => void fill().then(resolve, resolve)
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

  /**
   * Add an account, or re-link one Maru already holds.
   *
   * `expectEmail` names the account this flow is FOR. Passing it does two
   * things: Google pre-selects that address in the picker, which is most of
   * the felt friction in the re-auth path (P4) — and the flow then asserts
   * that the account which came back is the one asked for, discarding the
   * grant if it is not. Without that assertion a person re-linking the wrong
   * row in a four-account picker would file one mailbox's tokens under
   * another account's id, and nothing downstream would ever notice.
   *
   * Called with no argument it is an open "Add account" and behaves exactly
   * as before.
   */
  async addAccount(expectEmail?: string): Promise<Account> {
    const settings = await this.store.getSettings()
    const oauthClient = resolveOAuthClient({ settings })
    if (!oauthClient) throw new MissingOAuthClientError()

    const result = await this.authFlow(
      this.platform,
      oauthClient.clientId,
      oauthClient.clientSecret,
      { expectEmail },
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
      issuedAt: this.now(),
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

    // Leaving the inbox for any reason ends the deferral. Otherwise a thread
    // archived and then un-archived mysteriously hides itself again, with
    // nothing on screen to explain it.
    //
    // After the try/catch, not inside the optimistic block: the catch above
    // rethrows, so reaching this line means Gmail accepted the change. A
    // refused archive must never silently cancel a Later the person set, and
    // writing it here is what makes that true without a rollback to maintain.
    if (before.deferredUntil !== undefined && labelDelta(action.type).remove.includes('INBOX')) {
      await this.store.clearDeferral([action.threadKey])
      this.emit({ type: 'threadsChanged', accountId, threadKeys: [action.threadKey] })
    }
  }

  // -- Later ------------------------------------------------------------------

  /**
   * Save a thread for later, or take the deferral off with `null`.
   *
   * No Gmail call, deliberately and structurally: `thread_defer` is the only
   * table this touches, so the invariant above migration 6 holds by
   * construction rather than by care. It is also why Later touches no method in
   * the OAuth scope matrix.
   */
  async defer(key: string, wakeAt: number | null): Promise<void> {
    const { accountId } = parseThreadKey(key)
    if (wakeAt === null) await this.store.clearDeferral([key])
    else await this.store.setDeferral(key, accountId, wakeAt, this.now())
    this.emit({ type: 'threadsChanged', accountId, threadKeys: [key] })
  }

  async wakeDeferred(now: number): Promise<number> {
    const { woken } = await this.store.sweepDeferrals(now)
    // Only when something actually moved. A sweep that wakes nothing is the
    // usual case and must not invalidate a list every minute forever.
    if (woken > 0) this.emit({ type: 'threadsChanged' })
    return woken
  }

  deferredCount(): Promise<number> {
    return this.store.countDeferred(this.now())
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
    // Replying is the loudest possible statement that you are done deferring.
    if (draft.reply) await this.store.clearDeferral([draft.reply.threadKey])
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
    this.emit({ type: 'settingsChanged' })
  }

  /** The narrow local seam used by the encrypted Maru account vault. */
  accountVaultLocal(setDirectedConsent?: (emails: string[]) => void): VaultLocal {
    return {
      getSettings: () => this.store.getSettings(),
      setSettings: (patch) => this.setSettings(patch),
      listAccounts: () => this.store.listAccounts(),
      upsertAccount: (account) => this.store.upsertAccount(account),
      removeAccount: (accountId) => this.removeAccount(accountId),
      loadCredential: async (accountId) => {
        const token = await this.tokenStore.load(accountId)
        return token ? { refreshToken: token.refreshToken, clientId: token.clientId, issuedAt: token.issuedAt } : null
      },
      saveCredential: (accountId, credential) => this.tokenStore.save(accountId, {
        refreshToken: credential.refreshToken,
        clientId: credential.clientId,
        source: isOfficialGoogleClientId(credential.clientId) ? 'official' : 'custom',
        issuedAt: credential.issuedAt,
      }),
      clearCredential: (accountId) => this.tokenStore.clear(accountId),
      setDirectedConsent,
      newAccountId: this.newId,
      now: this.now,
      refreshAfterApply: () => this.refresh(),
    }
  }

  /** Stops every timer. Call before the window closes. */
  dispose(): void {
    for (const runtime of this.runtimes.values()) runtime.engine.stop()
    this.listeners.clear()
  }
}
