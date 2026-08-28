// SQLite schema and typed store, sitting on the SqlDb seam so the same code
// runs against tauri-plugin-sql in the app and better-sqlite3 in tests.
//
// Shape notes:
//  - `threads` carries the denormalised label array for reads; `thread_labels`
//    carries the same data as rows so folder queries are an indexed join
//    instead of a JSON scan.
//  - Address lists and attachment lists are JSON text. They are read whole and
//    never queried by field, so a relational split would buy nothing.
//  - Outgoing actions are NOT persisted: the action queue lives in memory with
//    retry, because an optimistic action that outlives the process would need
//    conflict resolution the MVP does not have.

import type { Platform, SqlDb } from '../platform'
import type {
  Account,
  EmailAddress,
  Label,
  MailView,
  Message,
  Settings,
  Thread,
  ListThreadsOptions,
  BodyState,
  Attachment,
} from '../types'
import { DEFAULT_PAGE_SIZE, DEFAULT_SETTINGS, viewLabel } from '../defaults'

export { DEFAULT_PAGE_SIZE, DEFAULT_SETTINGS, FOLDER_LABELS } from '../defaults'

/**
 * Numbered migrations. Append only — the array index plus one is the stamped
 * `user_version`, so never reorder or delete an entry.
 */
export const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    color         TEXT NOT NULL,
    added_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS threads (
    key             TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL,
    gmail_thread_id TEXT NOT NULL,
    subject         TEXT NOT NULL DEFAULT '',
    snippet         TEXT NOT NULL DEFAULT '',
    last_message_at INTEGER NOT NULL DEFAULT 0,
    participants    TEXT NOT NULL DEFAULT '[]',
    label_ids       TEXT NOT NULL DEFAULT '[]',
    unread          INTEGER NOT NULL DEFAULT 0,
    starred         INTEGER NOT NULL DEFAULT 0,
    message_count   INTEGER NOT NULL DEFAULT 0,
    has_attachments INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_threads_recent ON threads (last_message_at DESC);
  CREATE INDEX IF NOT EXISTS idx_threads_account_recent ON threads (account_id, last_message_at DESC);

  CREATE TABLE IF NOT EXISTS thread_labels (
    thread_key TEXT NOT NULL,
    account_id TEXT NOT NULL,
    label_id   TEXT NOT NULL,
    PRIMARY KEY (thread_key, label_id)
  );
  CREATE INDEX IF NOT EXISTS idx_thread_labels_label ON thread_labels (label_id);
  CREATE INDEX IF NOT EXISTS idx_thread_labels_account_label ON thread_labels (account_id, label_id);

  CREATE TABLE IF NOT EXISTS messages (
    id            TEXT PRIMARY KEY,
    thread_key    TEXT NOT NULL,
    thread_id     TEXT NOT NULL,
    account_id    TEXT NOT NULL,
    from_json     TEXT NOT NULL DEFAULT '{}',
    to_json       TEXT NOT NULL DEFAULT '[]',
    cc_json       TEXT NOT NULL DEFAULT '[]',
    bcc_json      TEXT NOT NULL DEFAULT '[]',
    reply_to_json TEXT NOT NULL DEFAULT '[]',
    date          INTEGER NOT NULL DEFAULT 0,
    subject       TEXT NOT NULL DEFAULT '',
    snippet       TEXT NOT NULL DEFAULT '',
    body_html     TEXT,
    body_text     TEXT,
    body_state    TEXT NOT NULL DEFAULT 'metadata',
    label_ids     TEXT NOT NULL DEFAULT '[]',
    attachments   TEXT NOT NULL DEFAULT '[]',
    rfc_message_id TEXT,
    references_hdr TEXT,
    in_reply_to    TEXT,
    unread         INTEGER NOT NULL DEFAULT 0,
    starred        INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (thread_key, date);
  CREATE INDEX IF NOT EXISTS idx_messages_body_state ON messages (body_state);

  CREATE TABLE IF NOT EXISTS labels (
    account_id   TEXT NOT NULL,
    id           TEXT NOT NULL,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'user',
    unread_count INTEGER,
    PRIMARY KEY (account_id, id)
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    account_id     TEXT PRIMARY KEY,
    history_id     TEXT,
    last_full_sync INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );
  `,
]

export const SCHEMA_VERSION = MIGRATIONS.length

export interface SyncState {
  accountId: string
  historyId?: string
  lastFullSync?: number
}

/** Applies any migration newer than the stamped user_version. */
export async function migrate(db: SqlDb): Promise<number> {
  const rows = await db.select<{ user_version: number }>('PRAGMA user_version')
  const current = rows[0]?.user_version ?? 0
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.execute(MIGRATIONS[v])
    // PRAGMA does not accept bound parameters.
    await db.execute(`PRAGMA user_version = ${v + 1}`)
  }
  return MIGRATIONS.length
}

// ---------------------------------------------------------------------------
// Row types and conversion
// ---------------------------------------------------------------------------

interface ThreadRow {
  key: string
  account_id: string
  gmail_thread_id: string
  subject: string
  snippet: string
  last_message_at: number
  participants: string
  label_ids: string
  unread: number
  starred: number
  message_count: number
  has_attachments: number
}

interface MessageRow {
  id: string
  thread_key: string
  thread_id: string
  account_id: string
  from_json: string
  to_json: string
  cc_json: string
  bcc_json: string
  reply_to_json: string
  date: number
  subject: string
  snippet: string
  body_html: string | null
  body_text: string | null
  body_state: string
  label_ids: string
  attachments: string
  rfc_message_id: string | null
  references_hdr: string | null
  in_reply_to: string | null
  unread: number
  starred: number
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function rowToThread(r: ThreadRow): Thread {
  return {
    key: r.key,
    gmailThreadId: r.gmail_thread_id,
    accountId: r.account_id,
    subject: r.subject,
    snippet: r.snippet,
    lastMessageAt: r.last_message_at,
    participants: parseJson<EmailAddress[]>(r.participants, []),
    labelIds: parseJson<string[]>(r.label_ids, []),
    unread: r.unread === 1,
    starred: r.starred === 1,
    messageCount: r.message_count,
    hasAttachments: r.has_attachments === 1,
  }
}

function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    threadId: r.thread_id,
    accountId: r.account_id,
    from: parseJson<EmailAddress>(r.from_json, { email: '' }),
    to: parseJson<EmailAddress[]>(r.to_json, []),
    cc: parseJson<EmailAddress[]>(r.cc_json, []),
    bcc: parseJson<EmailAddress[]>(r.bcc_json, []),
    replyTo: parseJson<EmailAddress[]>(r.reply_to_json, []),
    date: r.date,
    subject: r.subject,
    snippet: r.snippet,
    bodyHtml: r.body_html ?? undefined,
    bodyText: r.body_text ?? undefined,
    bodyState: r.body_state as BodyState,
    labelIds: parseJson<string[]>(r.label_ids, []),
    attachments: parseJson<Attachment[]>(r.attachments, []),
    rfcMessageId: r.rfc_message_id ?? undefined,
    references: r.references_hdr ?? undefined,
    inReplyTo: r.in_reply_to ?? undefined,
    unread: r.unread === 1,
    starred: r.starred === 1,
  }
}

const bit = (b: boolean) => (b ? 1 : 0)

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class Store {
  constructor(private readonly db: SqlDb) {}

  static async open(platform: Platform): Promise<Store> {
    const db = await platform.sqlOpen()
    await migrate(db)
    return new Store(db)
  }

  // -- accounts -------------------------------------------------------------

  async upsertAccount(a: Account): Promise<void> {
    await this.db.execute(
      `INSERT INTO accounts (id, email, display_name, color, added_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name,
         color = excluded.color,
         added_at = excluded.added_at`,
      [a.id, a.email, a.displayName, a.color, a.addedAt],
    )
  }

  async listAccounts(): Promise<Account[]> {
    const rows = await this.db.select<{
      id: string
      email: string
      display_name: string
      color: string
      added_at: number
    }>('SELECT * FROM accounts ORDER BY added_at ASC, rowid ASC')
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      color: r.color,
      addedAt: r.added_at,
    }))
  }

  async deleteAccount(accountId: string): Promise<void> {
    for (const table of ['messages', 'thread_labels', 'threads', 'labels', 'sync_state']) {
      await this.db.execute(`DELETE FROM ${table} WHERE account_id = $1`, [accountId])
    }
    await this.db.execute('DELETE FROM accounts WHERE id = $1', [accountId])
  }

  // -- threads --------------------------------------------------------------

  async upsertThreads(threads: Thread[]): Promise<void> {
    for (const t of threads) {
      await this.db.execute(
        `INSERT INTO threads (key, account_id, gmail_thread_id, subject, snippet, last_message_at,
                              participants, label_ids, unread, starred, message_count, has_attachments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT(key) DO UPDATE SET
           subject = excluded.subject,
           snippet = excluded.snippet,
           last_message_at = excluded.last_message_at,
           participants = excluded.participants,
           label_ids = excluded.label_ids,
           unread = excluded.unread,
           starred = excluded.starred,
           message_count = excluded.message_count,
           has_attachments = excluded.has_attachments`,
        [
          t.key,
          t.accountId,
          t.gmailThreadId,
          t.subject,
          t.snippet,
          t.lastMessageAt,
          JSON.stringify(t.participants),
          JSON.stringify(t.labelIds),
          bit(t.unread),
          bit(t.starred),
          t.messageCount,
          bit(t.hasAttachments),
        ],
      )
      await this.db.execute('DELETE FROM thread_labels WHERE thread_key = $1', [t.key])
      for (const labelId of t.labelIds) {
        await this.db.execute(
          'INSERT OR REPLACE INTO thread_labels (thread_key, account_id, label_id) VALUES ($1,$2,$3)',
          [t.key, t.accountId, labelId],
        )
      }
    }
  }

  async getThread(key: string): Promise<Thread | null> {
    const rows = await this.db.select<ThreadRow>('SELECT * FROM threads WHERE key = $1', [key])
    return rows.length ? rowToThread(rows[0]) : null
  }

  async allThreads(): Promise<Thread[]> {
    const rows = await this.db.select<ThreadRow>('SELECT * FROM threads ORDER BY last_message_at DESC')
    return rows.map(rowToThread)
  }

  async deleteThreads(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.db.execute('DELETE FROM messages WHERE thread_key = $1', [key])
      await this.db.execute('DELETE FROM thread_labels WHERE thread_key = $1', [key])
      await this.db.execute('DELETE FROM threads WHERE key = $1', [key])
    }
  }

  async listThreadKeys(accountId: string): Promise<string[]> {
    const rows = await this.db.select<{ key: string }>('SELECT key FROM threads WHERE account_id = $1', [accountId])
    return rows.map((r) => r.key)
  }

  /** SQL twin of threadMatchesView; both read the label rule from defaults.ts. */
  private viewClause(view: MailView): { where: string; params: unknown[] } {
    const label = viewLabel(view)
    const params: unknown[] = [label]
    let where = `t.key IN (SELECT thread_key FROM thread_labels WHERE label_id = $1)`
    if (view.kind === 'account') {
      params.push(view.accountId)
      where += ` AND t.account_id = $${params.length}`
    }
    if (label !== 'TRASH') {
      where += ` AND t.key NOT IN (SELECT thread_key FROM thread_labels WHERE label_id = 'TRASH')`
    }
    return { where, params }
  }

  async listThreads(view: MailView, opts: ListThreadsOptions = {}): Promise<Thread[]> {
    const { where, params } = this.viewClause(view)
    const args = [...params]
    let sql = `SELECT t.* FROM threads t WHERE ${where}`
    if (opts.before !== undefined) {
      args.push(opts.before)
      sql += ` AND t.last_message_at < $${args.length}`
    }
    args.push(opts.limit ?? DEFAULT_PAGE_SIZE)
    sql += ` ORDER BY t.last_message_at DESC, t.key ASC LIMIT $${args.length}`
    const rows = await this.db.select<ThreadRow>(sql, args)
    return rows.map(rowToThread)
  }

  async countUnread(view: MailView): Promise<number> {
    const { where, params } = this.viewClause(view)
    const rows = await this.db.select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM threads t WHERE ${where} AND t.unread = 1`,
      params,
    )
    return rows[0]?.n ?? 0
  }

  // -- messages -------------------------------------------------------------

  async upsertMessages(messages: Message[]): Promise<void> {
    for (const m of messages) {
      const key = `${m.accountId}/${m.threadId}`
      await this.db.execute(
        `INSERT INTO messages (id, thread_key, thread_id, account_id, from_json, to_json, cc_json, bcc_json,
                               reply_to_json, date, subject, snippet, body_html, body_text, body_state,
                               label_ids, attachments, rfc_message_id, references_hdr, in_reply_to, unread, starred)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT(id) DO UPDATE SET
           thread_key = excluded.thread_key,
           from_json = excluded.from_json,
           to_json = excluded.to_json,
           cc_json = excluded.cc_json,
           bcc_json = excluded.bcc_json,
           reply_to_json = excluded.reply_to_json,
           date = excluded.date,
           subject = excluded.subject,
           snippet = excluded.snippet,
           -- A metadata refetch must never blank a body we already hydrated.
           body_html = COALESCE(excluded.body_html, messages.body_html),
           body_text = COALESCE(excluded.body_text, messages.body_text),
           body_state = CASE WHEN excluded.body_state = 'full' OR messages.body_state = 'full'
                             THEN 'full' ELSE excluded.body_state END,
           label_ids = excluded.label_ids,
           attachments = CASE WHEN excluded.attachments = '[]' THEN messages.attachments ELSE excluded.attachments END,
           rfc_message_id = COALESCE(excluded.rfc_message_id, messages.rfc_message_id),
           references_hdr = COALESCE(excluded.references_hdr, messages.references_hdr),
           in_reply_to = COALESCE(excluded.in_reply_to, messages.in_reply_to),
           unread = excluded.unread,
           starred = excluded.starred`,
        [
          m.id,
          key,
          m.threadId,
          m.accountId,
          JSON.stringify(m.from),
          JSON.stringify(m.to),
          JSON.stringify(m.cc),
          JSON.stringify(m.bcc),
          JSON.stringify(m.replyTo),
          m.date,
          m.subject,
          m.snippet,
          m.bodyHtml ?? null,
          m.bodyText ?? null,
          m.bodyState,
          JSON.stringify(m.labelIds),
          JSON.stringify(m.attachments),
          m.rfcMessageId ?? null,
          m.references ?? null,
          m.inReplyTo ?? null,
          bit(m.unread),
          bit(m.starred),
        ],
      )
    }
  }

  async listMessages(threadKey: string): Promise<Message[]> {
    const rows = await this.db.select<MessageRow>(
      'SELECT * FROM messages WHERE thread_key = $1 ORDER BY date ASC, id ASC',
      [threadKey],
    )
    return rows.map(rowToMessage)
  }

  /** Newest threads that still hold only metadata — the prefetch work list. */
  async threadsNeedingBodies(limit: number): Promise<string[]> {
    const rows = await this.db.select<{ key: string }>(
      `SELECT t.key AS key FROM threads t
       WHERE EXISTS (SELECT 1 FROM messages m WHERE m.thread_key = t.key AND m.body_state = 'metadata')
       ORDER BY t.last_message_at DESC
       LIMIT $1`,
      [limit],
    )
    return rows.map((r) => r.key)
  }

  // -- labels ---------------------------------------------------------------

  async replaceLabels(accountId: string, labels: Label[]): Promise<void> {
    await this.db.execute('DELETE FROM labels WHERE account_id = $1', [accountId])
    for (const l of labels) {
      await this.db.execute(
        'INSERT OR REPLACE INTO labels (account_id, id, name, type, unread_count) VALUES ($1,$2,$3,$4,$5)',
        [accountId, l.id, l.name, l.type, l.unreadCount ?? null],
      )
    }
  }

  async listLabels(accountId: string): Promise<Label[]> {
    const rows = await this.db.select<{
      account_id: string
      id: string
      name: string
      type: string
      unread_count: number | null
    }>('SELECT * FROM labels WHERE account_id = $1 ORDER BY type DESC, name ASC', [accountId])
    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      name: r.name,
      type: r.type === 'system' ? 'system' : 'user',
      unreadCount: r.unread_count ?? undefined,
    }))
  }

  // -- sync state -----------------------------------------------------------

  async getSyncState(accountId: string): Promise<SyncState | null> {
    const rows = await this.db.select<{ account_id: string; history_id: string | null; last_full_sync: number | null }>(
      'SELECT * FROM sync_state WHERE account_id = $1',
      [accountId],
    )
    if (!rows.length) return null
    return {
      accountId: rows[0].account_id,
      historyId: rows[0].history_id ?? undefined,
      lastFullSync: rows[0].last_full_sync ?? undefined,
    }
  }

  async setSyncState(state: SyncState): Promise<void> {
    await this.db.execute(
      `INSERT INTO sync_state (account_id, history_id, last_full_sync) VALUES ($1,$2,$3)
       ON CONFLICT(account_id) DO UPDATE SET
         history_id = excluded.history_id,
         last_full_sync = COALESCE(excluded.last_full_sync, sync_state.last_full_sync)`,
      [state.accountId, state.historyId ?? null, state.lastFullSync ?? null],
    )
  }

  // -- settings -------------------------------------------------------------

  async getSettings(): Promise<Settings> {
    const rows = await this.db.select<{ json: string }>('SELECT json FROM settings WHERE id = 1')
    if (!rows.length) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...parseJson<Partial<Settings>>(rows[0].json, {}) }
  }

  async setSettings(patch: Partial<Settings>): Promise<void> {
    const next = { ...(await this.getSettings()), ...patch }
    await this.db.execute(
      `INSERT INTO settings (id, json) VALUES (1, $1)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json`,
      [JSON.stringify(next)],
    )
  }
}
