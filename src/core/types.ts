// Wren core contract — domain model and the MailService seam.
// The UI consumes MailService only. Two implementations exist:
// service/real.ts (Gmail over Platform) and service/demo.ts (fixtures).
// Changing a shape here is a contract change: note it in the lane report.

export interface EmailAddress {
  name?: string
  email: string
}

export interface Account {
  id: string // local uuid, stable across sessions
  email: string
  displayName: string
  color: string // hex used for the account dot
  addedAt: number // epoch ms
}

export interface Attachment {
  id: string // gmail attachmentId
  messageId: string
  filename: string
  mimeType: string
  sizeBytes: number
  inline: boolean
  contentId?: string // for cid: image resolution
}

export type BodyState = 'metadata' | 'full'

export interface Message {
  id: string // gmail message id
  threadId: string // gmail thread id
  accountId: string
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
  replyTo: EmailAddress[]
  date: number // epoch ms
  subject: string
  snippet: string
  bodyHtml?: string // raw as fetched; sanitized at render time
  bodyText?: string
  bodyState: BodyState // 'metadata' until full body hydrated
  labelIds: string[]
  attachments: Attachment[]
  rfcMessageId?: string // Message-ID header
  references?: string // References header
  inReplyTo?: string // In-Reply-To header
  unread: boolean
  starred: boolean
}

export interface Thread {
  key: string // `${accountId}/${gmailThreadId}` — unified unique key
  gmailThreadId: string
  accountId: string
  subject: string
  snippet: string // of the latest message
  lastMessageAt: number
  participants: EmailAddress[]
  labelIds: string[] // union across messages
  unread: boolean
  starred: boolean
  messageCount: number
  hasAttachments: boolean
}

export type UnifiedFolder = 'inbox' | 'starred' | 'sent' | 'trash'

export type MailView =
  | { kind: 'unified'; folder: UnifiedFolder }
  | { kind: 'account'; accountId: string; labelId: string }

export interface Label {
  id: string // gmail label id
  accountId: string
  name: string
  type: 'system' | 'user'
  unreadCount?: number
}

export type MailActionType =
  | 'archive'
  // Archive's inverse: put INBOX back. Gmail has no "unarchive" verb — it is a
  // label modify like every other non-trash action — but undo needs a name for
  // it, and naming it here is what lets `reverseAction` stay total.
  | 'unarchive'
  | 'trash'
  | 'untrash'
  | 'star'
  | 'unstar'
  | 'markRead'
  | 'markUnread'

export interface MailAction {
  type: MailActionType
  threadKey: string
}

export interface LabelChanges {
  addLabelIds: string[]
  removeLabelIds: string[]
}

export interface OutgoingAttachment {
  filename: string
  mimeType: string
  dataBase64: string
}

export interface ComposeDraft {
  accountId: string // sending account
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
  subject: string
  bodyHtml: string
  attachments: OutgoingAttachment[]
  reply?: {
    threadKey: string
    messageId: string // gmail id of the message replied to
    mode: 'reply' | 'replyAll' | 'forward'
  }
}

export interface SyncStatus {
  accountId: string
  state: 'idle' | 'syncing' | 'error'
  progress?: number // 0..1 during backfill
  error?: string
  /** The error is a dead grant — signing in again is the fix (P4). Typed
   *  here so no UI ever has to regex an error message for it. */
  needsReauth?: boolean
  /** Google rejected the OAuth client, not the account. A custom client is
   *  the recovery path, so keep that distinct from a dead grant. */
  clientFailure?: boolean
  lastSyncAt?: number
}

export type MailEvent =
  /**
   * Something in the thread store moved. `threadKeys` names the threads the
   * emitter knows changed, so a listener can invalidate those and leave the
   * rest alone; absent means "unknown, assume everything".
   */
  | { type: 'threadsChanged'; accountId?: string; threadKeys?: string[] }
  | { type: 'syncStatus'; status: SyncStatus }
  /**
   * Mail arrived. **One event per sync pass**, not one per thread: the engine
   * is the only thing that knows where a pass ends, so it says so rather than
   * emitting N events and leaving every listener to re-derive the batch behind
   * its own timer.
   *
   * `threads` is how many arrived. `threadKey`, `from` and `subject` name the
   * newest of them — the one an OS notification leads with.
   */
  | {
      type: 'newMail'
      accountId: string
      threadKey: string
      from: string
      subject: string
      threads: number
    }
  | { type: 'accountsChanged' }

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  googleClientId?: string
  googleClientSecret?: string
  imagePolicy: 'block' | 'allow'
  pollIntervalSec: number // default 60
  /**
   * Interface sounds. Off by default, on purpose: Wren's most frequent cue is
   * new mail, which is unsolicited, can fire many times an hour, and Wren is
   * read in meetings and open offices. Ship it excellent and opt-in rather than
   * asking everyone to opt out of something that surprised them once in a quiet
   * room. See docs/design/SOUNDS.md §3.
   */
  sounds: boolean // default false
  /**
   * How a conversation reads in the pane: `chronological` (oldest → newest,
   * landing on the newest — mail's default) or `newestFirst` (newest on top,
   * the Outlook/Apple Mail preference). A reading preference, so it persists;
   * per-thread override is deliberately not offered.
   */
  conversationOrder: 'chronological' | 'newestFirst' // default chronological
}

export interface ListThreadsOptions {
  limit?: number // default 100
  before?: number // lastMessageAt cursor for paging
}

export interface GetThreadOptions {
  /**
   * Hydrate any metadata-only bodies as part of the same read. Opening a
   * thread wants this: without it the caller has to read the messages, call
   * ensureBodies, and read them a third time.
   */
  hydrate?: boolean
}

export interface MailService {
  listAccounts(): Promise<Account[]>
  /** Runs the OAuth flow (real) or adds the next fixture account (demo). */
  addAccount(): Promise<Account>
  removeAccount(accountId: string): Promise<void>

  listThreads(view: MailView, opts?: ListThreadsOptions): Promise<Thread[]>
  getThread(
    threadKey: string,
    opts?: GetThreadOptions,
  ): Promise<{ thread: Thread; messages: Message[] }>
  /** Hydrates full bodies for a thread's messages if still metadata-only. */
  ensureBodies(threadKey: string): Promise<Message[]>
  getAttachment(threadKey: string, messageId: string, attachmentId: string): Promise<Uint8Array>

  listLabels(accountId: string): Promise<Label[]>
  unreadCount(view: MailView): Promise<number>

  /** Optimistic: applies locally at once, queues remote, emits threadsChanged. */
  performAction(action: MailAction): Promise<void>
  /**
   * Add or remove labels on a thread, by label id. Additive to
   * `performAction`, which owns the four system flags — this is the door for
   * user labels. Optimistic like performAction: local first, remote after,
   * rolled back verbatim on failure.
   */
  modifyLabels(threadKey: string, changes: LabelChanges): Promise<void>
  send(draft: ComposeDraft): Promise<void>

  search(q: string): Promise<Thread[]>
  refresh(): Promise<void>

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<void>

  /** Returns an unsubscribe function. */
  onEvent(cb: (e: MailEvent) => void): () => void
}

export function threadKey(accountId: string, gmailThreadId: string): string {
  return `${accountId}/${gmailThreadId}`
}

export function parseThreadKey(key: string): { accountId: string; gmailThreadId: string } {
  const i = key.indexOf('/')
  return { accountId: key.slice(0, i), gmailThreadId: key.slice(i + 1) }
}
