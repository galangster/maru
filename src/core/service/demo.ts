// Demo MailService: the whole app, fully in memory, with no Platform at all.
//
// This is what `--demo` runs, what screenshots are taken against, and what a
// reviewer sees before they have set up a Google OAuth client. It implements
// the same MailService contract as the real one, including events.

import { imagePreview, now, syncPreview } from '@/lib/env'
import { decodeBase64Url } from '../mime'
import { searchWithOperators } from '../search/operators'
import { ThreadSearchIndex } from '../search/index'
import { buildDemoData, buildExtraAccount, labelsFor } from '../demo/fixtures'
import { applyLabelChanges, applyActionToMessage, applyActionToThread } from './actions'
import { bodyTextOf, sentRowsFor } from './sent'
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
  SyncStatus,
  Thread,
  ListThreadsOptions,
} from '../types'
import { threadKey } from '../types'
import { DEFAULT_PAGE_SIZE, DEFAULT_SETTINGS, threadMatchesView } from '../defaults'

export class DemoMailService implements MailService {
  private readonly accounts: Account[]
  private readonly threads = new Map<string, Thread>()
  private readonly messages = new Map<string, Message[]>()
  private readonly labels = new Map<string, Label[]>()
  private readonly listeners = new Set<(e: MailEvent) => void>()
  private readonly index = new ThreadSearchIndex()
  // `?images=block` is the capture door onto the blocking surface — see
  // imagePreview in lib/env. Demo-only, so it can never reach real mail.
  private settings: Settings = { ...DEFAULT_SETTINGS, ...(imagePreview ? { imagePolicy: imagePreview } : {}) }
  private readonly now: number
  private extraAdded = false
  private sendCounter = 0

  constructor(opts: { now?: number } = {}) {
    this.now = opts.now ?? Date.now()
    const data = buildDemoData(this.now)
    this.accounts = data.accounts
    for (const t of data.threads) this.threads.set(t.key, t)
    for (const [key, messages] of data.messagesByThread) this.messages.set(key, messages)
    for (const [accountId, labels] of data.labelsByAccount) this.labels.set(accountId, labels)
    this.reindex()
  }

  // -- events ---------------------------------------------------------------

  onEvent(cb: (e: MailEvent) => void): () => void {
    this.listeners.add(cb)
    // A new subscriber gets the current per-account state immediately, the way
    // a real subscriber does after the engine's first pass. Without this the
    // sidebar would sit on an empty record — which now honestly renders as
    // "Starting…" rather than the old false "Up to date".
    for (const status of this.syncStatuses()) cb({ type: 'syncStatus', status })
    return () => this.listeners.delete(cb)
  }

  /**
   * What demo mode reports per account. Idle unless `?sync=` asks for a
   * failure — see syncPreview in lib/env, and note this is the ONLY reader of
   * it, so the flag can never colour real mail.
   */
  private syncStatuses(): SyncStatus[] {
    const failure = (accountId: string): SyncStatus => {
      switch (syncPreview) {
        case 'signedout':
          return { accountId, state: 'error', error: 'invalid_grant', needsReauth: true }
        case 'nocreds':
          return {
            accountId,
            state: 'error',
            error: 'This account is not signed in',
            needsReauth: true,
            noCredentials: true,
          }
        case 'client':
          return {
            accountId,
            state: 'error',
            error: 'unauthorized_client',
            needsReauth: true,
            clientFailure: true,
          }
        case 'noclient':
          return {
            accountId,
            state: 'error',
            error: 'No Google OAuth client is configured.',
            clientFailure: true,
            noClientConfigured: true,
          }
        default:
          return { accountId, state: 'error', error: 'network timeout', lastSyncAt: now() - 7_200_000 }
      }
    }

    const healthy = (id: string): SyncStatus => ({
      accountId: id,
      state: 'idle',
      lastSyncAt: now() - 90_000,
    })

    return this.accounts.map((account, i) => {
      if (!syncPreview) return healthy(account.id)
      // `partial` signs out the FIRST account and leaves the rest healthy —
      // the case the old footer could not express at all, because it collapsed
      // every account into one word and could not say which.
      if (syncPreview === 'partial') {
        return i === 0
          ? { accountId: account.id, state: 'error', error: 'invalid_grant', needsReauth: true }
          : healthy(account.id)
      }
      return failure(account.id)
    })
  }

  private emit(e: MailEvent): void {
    for (const cb of [...this.listeners]) cb(e)
  }

  private reindex(): void {
    const bodies = new Map<string, string>()
    for (const [key, messages] of this.messages) bodies.set(key, bodyTextOf(messages))
    this.index.replaceAll([...this.threads.values()], bodies)
  }

  // -- accounts -------------------------------------------------------------

  async listAccounts(): Promise<Account[]> {
    return this.accounts.map((a) => ({ ...a }))
  }

  // The hint is accepted and unused: the demo service has no consent screen
  // to pre-select in and no wrong account to guard against.
  async addAccount(_expectEmail?: string): Promise<Account> {
    if (this.extraAdded) throw new Error('Demo mode ships three accounts; all of them are already added.')
    this.extraAdded = true
    const extra = buildExtraAccount(this.now)
    this.accounts.push(extra.account)
    for (const t of extra.threads) this.threads.set(t.key, t)
    for (const [key, messages] of extra.messagesByThread) this.messages.set(key, messages)
    this.labels.set(extra.account.id, extra.labels)
    this.reindex()
    this.emit({ type: 'accountsChanged' })
    this.emit({ type: 'threadsChanged', accountId: extra.account.id })
    return { ...extra.account }
  }

  async removeAccount(accountId: string): Promise<void> {
    const at = this.accounts.findIndex((a) => a.id === accountId)
    if (at === -1) return
    this.accounts.splice(at, 1)
    for (const [key, thread] of [...this.threads]) {
      if (thread.accountId !== accountId) continue
      this.threads.delete(key)
      this.messages.delete(key)
    }
    this.labels.delete(accountId)
    this.reindex()
    this.emit({ type: 'accountsChanged' })
    this.emit({ type: 'threadsChanged' })
  }

  // -- reads ----------------------------------------------------------------

  async listThreads(view: MailView, opts: ListThreadsOptions = {}): Promise<Thread[]> {
    return [...this.threads.values()]
      .filter((t) => threadMatchesView(t, view))
      .filter((t) => opts.before === undefined || t.lastMessageAt < opts.before)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt || a.key.localeCompare(b.key))
      .slice(0, opts.limit ?? DEFAULT_PAGE_SIZE)
      .map((t) => ({ ...t }))
  }

  private require(key: string): Thread {
    const thread = this.threads.get(key)
    if (!thread) throw new Error(`No such thread: ${key}`)
    return thread
  }

  /** Demo bodies are always hydrated, so `hydrate` costs nothing extra here. */
  async getThread(
    key: string,
    _opts: GetThreadOptions = {},
  ): Promise<{ thread: Thread; messages: Message[] }> {
    const thread = this.require(key)
    const messages = (this.messages.get(key) ?? []).slice().sort((a, b) => a.date - b.date)
    return { thread: { ...thread }, messages: messages.map((m) => ({ ...m })) }
  }

  /** Demo bodies are always hydrated, so this resolves without any work. */
  async ensureBodies(key: string): Promise<Message[]> {
    return (await this.getThread(key)).messages
  }

  async getAttachment(key: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
    const message = (this.messages.get(key) ?? []).find((m) => m.id === messageId)
    const attachment = message?.attachments.find((a) => a.id === attachmentId)
    if (!attachment) throw new Error(`No such attachment: ${attachmentId}`)
    // An image attachment must decode as an image — the reading pane shows it
    // as a photo thumbnail. One embedded sunset stands in for every fixture
    // photo; other types keep deterministic filler bytes.
    if (attachment.mimeType.startsWith('image/')) {
      return decodeBase64Url(DEMO_PHOTO_PNG)
    }
    const size = Math.min(attachment.sizeBytes, 4096)
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i++) bytes[i] = (i * 31 + attachment.filename.length) % 256
    return bytes
  }

  async listLabels(accountId: string): Promise<Label[]> {
    return (this.labels.get(accountId) ?? labelsFor(accountId)).map((l) => ({ ...l }))
  }

  async unreadCount(view: MailView): Promise<number> {
    return [...this.threads.values()].filter((t) => threadMatchesView(t, view) && t.unread).length
  }

  async search(q: string): Promise<Thread[]> {
    const labels = (
      await Promise.all(this.accounts.map((a) => this.listLabels(a.id)))
    ).flat()
    return searchWithOperators(this.index, q, labels).map((t) => ({ ...t }))
  }

  async refresh(): Promise<void> {
    for (const status of this.syncStatuses()) this.emit({ type: 'syncStatus', status })
  }

  // -- writes ---------------------------------------------------------------

  async performAction(action: MailAction): Promise<void> {
    const thread = this.require(action.threadKey)
    const next = applyActionToThread(thread, action.type)
    this.threads.set(next.key, next)
    this.messages.set(
      next.key,
      (this.messages.get(next.key) ?? []).map((m) => applyActionToMessage(m, action.type)),
    )
    this.index.upsert(next)
    this.emit({ type: 'threadsChanged', accountId: next.accountId, threadKeys: [next.key] })
  }

  async modifyLabels(threadKey: string, changes: LabelChanges): Promise<void> {
    const thread = this.require(threadKey)
    const next = { ...thread, labelIds: applyLabelChanges(thread.labelIds, changes) }
    this.threads.set(next.key, next)
    // A thread modify reaches every message, as Gmail's does.
    this.messages.set(
      next.key,
      (this.messages.get(next.key) ?? []).map((m) => ({
        ...m,
        labelIds: applyLabelChanges(m.labelIds, changes),
      })),
    )
    this.index.upsert(next)
    this.emit({ type: 'threadsChanged', accountId: next.accountId, threadKeys: [next.key] })
  }

  async send(draft: ComposeDraft): Promise<void> {
    const account = this.accounts.find((a) => a.id === draft.accountId)
    if (!account) throw new Error(`No such account: ${draft.accountId}`)

    this.sendCounter++
    const n = this.sendCounter
    const gmailThreadId = draft.reply
      ? this.require(draft.reply.threadKey).gmailThreadId
      : `demo-sent-${n}`
    const existingMessages = this.messages.get(threadKey(account.id, gmailThreadId)) ?? []
    const previous = existingMessages[existingMessages.length - 1]

    const { key, messages, thread } = sentRowsFor(draft, {
      account,
      gmailThreadId,
      messageId: `demo-sent-msg-${n}`,
      date: Date.now(),
      rfcMessageId: `<demo-sent-${n}@wren.demo>`,
      inReplyTo: previous?.rfcMessageId,
      references: previous
        ? [previous.references, previous.rfcMessageId].filter(Boolean).join(' ')
        : undefined,
      attachmentId: (i) => `demo-sent-att-${n}-${i}`,
      existingThread: this.threads.get(threadKey(account.id, gmailThreadId)) ?? null,
      existingMessages,
    })

    this.messages.set(key, messages)
    this.threads.set(key, thread)
    this.index.upsert(thread, bodyTextOf(messages))
    this.emit({ type: 'threadsChanged', accountId: account.id, threadKeys: [key] })
  }

  // -- settings -------------------------------------------------------------

  async getSettings(): Promise<Settings> {
    return { ...this.settings }
  }

  async setSettings(patch: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...patch }
  }
}

/** A small real PNG (a sunset), served for every demo photo attachment. */
const DEMO_PHOTO_PNG =
  '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'
