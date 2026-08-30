// Demo MailService: the whole app, fully in memory, with no Platform at all.
//
// This is what `--demo` runs, what screenshots are taken against, and what a
// reviewer sees before they have set up a Google OAuth client. It implements
// the same MailService contract as the real one, including events.

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
  private settings: Settings = { ...DEFAULT_SETTINGS }
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
    return () => this.listeners.delete(cb)
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

  async addAccount(): Promise<Account> {
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
    // Deterministic filler: enough bytes to exercise a save dialog or preview.
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
    for (const account of this.accounts) {
      this.emit({ type: 'syncStatus', status: { accountId: account.id, state: 'idle', lastSyncAt: Date.now() } })
    }
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
