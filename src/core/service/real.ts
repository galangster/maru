// RealMailService — the Gmail-backed MailService the app runs by default.
//
// It owns one GmailApi + SyncEngine + TokenManager per account, one store, and
// one search index. Actions are optimistic: the local write and the
// threadsChanged event happen first, the Gmail call second, and a failure
// restores the exact rows that were replaced.

import type { Platform } from '../platform'
import type { Store } from '../store/db'
import { GmailApi } from '../gmail/api'
import { GMAIL_BUDGET_PER_MINUTE, TokenBucket } from '../gmail/limiter'
import { SyncEngine, type SyncGmailClient } from '../sync/engine'
import { ThreadSearchIndex } from '../search/index'
import { TokenManager, TokenStore, runAuthFlow as defaultRunAuthFlow, type AuthFlowResult } from '../auth/oauth'
import { buildRawMessage, htmlToText } from '../mime'
import { applyActionToMessage, applyActionToThread, isTrashAction, labelDelta } from './actions'
import { accountColor } from '../palette'
import { mergeParticipants } from '../gmail/mapping'
import type { GmailMessage, GmailThread } from '../gmail/types'
import type {
  Account,
  ComposeDraft,
  Label,
  MailAction,
  MailEvent,
  MailService,
  MailView,
  Message,
  Settings,
  Thread,
  ListThreadsOptions,
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
  constructor() {
    super('Add your Google OAuth client ID and secret in Settings before adding an account.')
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
  createClient?: (accountId: string, clientId: string, clientSecret: string) => MailGmailClient
  runAuthFlow?: (platform: Platform, clientId: string, clientSecret: string) => Promise<AuthFlowResult>
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
  private readonly createClient: (accountId: string, clientId: string, clientSecret: string) => MailGmailClient
  private readonly authFlow: (platform: Platform, clientId: string, clientSecret: string) => Promise<AuthFlowResult>
  private readonly autoStart: boolean
  private readonly newId: () => string
  private readonly now: () => number

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

  private gmailApi(accountId: string, clientId: string, clientSecret: string): MailGmailClient {
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
    this.index.replaceAll(await this.store.allThreads())
    const settings = await this.store.getSettings()
    for (const account of await this.store.listAccounts()) {
      const runtime = this.attach(account, settings)
      if (this.autoStart) this.beginSync(runtime, settings)
    }
  }

  private attach(account: Account, settings: Settings): AccountRuntime {
    if (this.runtimes.has(account.id)) return this.runtimes.get(account.id)!
    const clientId = settings.googleClientId ?? ''
    const clientSecret = settings.googleClientSecret ?? ''
    const client = this.createClient(account.id, clientId, clientSecret)
    const engine = new SyncEngine({
      api: client,
      store: this.store,
      accountId: account.id,
      emit: (e) => this.emit(e),
      now: this.now,
      onThreadsUpserted: (threads) => this.index.upsertMany(threads),
      onThreadsRemoved: (keys) => this.index.removeMany(keys),
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

  onEvent(cb: (e: MailEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(e: MailEvent): void {
    for (const cb of [...this.listeners]) cb(e)
  }

  // -- accounts -------------------------------------------------------------

  async listAccounts(): Promise<Account[]> {
    return this.store.listAccounts()
  }

  async addAccount(): Promise<Account> {
    const settings = await this.store.getSettings()
    if (!settings.googleClientId || !settings.googleClientSecret) throw new MissingOAuthClientError()

    const result = await this.authFlow(this.platform, settings.googleClientId, settings.googleClientSecret)

    const existing = await this.store.listAccounts()
    if (existing.some((a) => a.email.toLowerCase() === result.email.toLowerCase())) {
      throw new Error(`${result.email} is already added to Wren.`)
    }

    const account: Account = {
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
      clientId: settings.googleClientId,
    })
    await this.store.upsertAccount(account)

    const runtime = this.attach(account, settings)
    this.emit({ type: 'accountsChanged' })
    if (this.autoStart) this.beginSync(runtime, settings)
    return account
  }

  async removeAccount(accountId: string): Promise<void> {
    this.runtimes.get(accountId)?.engine.stop()
    this.runtimes.delete(accountId)
    const keys = await this.store.listThreadKeys(accountId)
    await this.store.deleteAccount(accountId)
    await this.tokenStore.clear(accountId)
    this.index.removeMany(keys)
    this.emit({ type: 'accountsChanged' })
    this.emit({ type: 'threadsChanged' })
  }

  // -- reads ----------------------------------------------------------------

  listThreads(view: MailView, opts?: ListThreadsOptions): Promise<Thread[]> {
    return this.store.listThreads(view, opts)
  }

  async getThread(key: string): Promise<{ thread: Thread; messages: Message[] }> {
    const thread = await this.store.getThread(key)
    if (!thread) throw new UnknownThreadError(key)
    return { thread, messages: await this.store.listMessages(key) }
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
    return this.index.search(q)
  }

  async refresh(): Promise<void> {
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
    const beforeMessages = await this.store.listMessages(action.threadKey)

    const after = applyActionToThread(before, action.type)
    const afterMessages = beforeMessages.map((m) => applyActionToMessage(m, action.type))
    await this.store.upsertThreads([after])
    if (afterMessages.length) await this.store.upsertMessages(afterMessages)
    this.index.upsert(after)
    this.emit({ type: 'threadsChanged', accountId })

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
      await this.store.upsertThreads([before])
      if (beforeMessages.length) await this.store.upsertMessages(beforeMessages)
      this.index.upsert(before)
      this.emit({ type: 'threadsChanged', accountId })
      this.emit({
        type: 'syncStatus',
        status: {
          accountId,
          state: 'error',
          error: err instanceof Error ? err.message : String(err),
        },
      })
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

    if (draft.reply) {
      const parent = await this.store.getThread(draft.reply.threadKey)
      if (!parent) throw new UnknownThreadError(draft.reply.threadKey)
      gmailThreadId = parent.gmailThreadId
      const messages = await this.store.listMessages(draft.reply.threadKey)
      const target = messages.find((m) => m.id === draft.reply!.messageId) ?? messages[messages.length - 1]
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
    // row is built from the draft rather than round-tripping the message.
    const resolvedThreadId = sent.threadId ?? gmailThreadId ?? sent.id
    const key = threadKey(account.id, resolvedThreadId)
    const date = this.now()
    const bodyText = htmlToText(draft.bodyHtml)
    const message: Message = {
      id: sent.id,
      threadId: resolvedThreadId,
      accountId: account.id,
      from: { name: account.displayName, email: account.email },
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      replyTo: [],
      date,
      subject: draft.subject,
      snippet: bodyText.slice(0, 140),
      bodyHtml: draft.bodyHtml,
      bodyText,
      bodyState: 'full',
      labelIds: sent.labelIds ?? ['SENT'],
      attachments: draft.attachments.map((a, i) => ({
        id: `${sent.id}-att${i}`,
        messageId: sent.id,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: Math.ceil((a.dataBase64.length * 3) / 4),
        inline: false,
      })),
      rfcMessageId: undefined,
      references,
      inReplyTo,
      unread: false,
      starred: false,
    }

    await this.store.upsertMessages([message])
    const messages = await this.store.listMessages(key)
    const existing = await this.store.getThread(key)
    const participants = mergeParticipants(existing ? existing.participants.slice() : [], [
      message.from,
      ...draft.to,
      ...draft.cc,
    ])

    const thread: Thread = {
      key,
      gmailThreadId: resolvedThreadId,
      accountId: account.id,
      subject: existing?.subject ?? draft.subject,
      snippet: message.snippet,
      lastMessageAt: date,
      participants,
      labelIds: [...new Set([...(existing?.labelIds ?? []), 'SENT'])],
      unread: false,
      starred: existing?.starred ?? false,
      messageCount: messages.length,
      hasAttachments: messages.some((m) => m.attachments.some((a) => !a.inline)),
    }
    await this.store.upsertThreads([thread])
    this.index.upsert(thread)
    this.emit({ type: 'threadsChanged', accountId: account.id })
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
