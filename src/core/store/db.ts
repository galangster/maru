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
import type { LabelDelta } from '../service/actions'
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

/** Just the columns an action touches. See setMessageFlags. */
export interface MessageFlags {
  id: string
  labelIds: string[]
  unread: boolean
  starred: boolean
}

// ---------------------------------------------------------------------------
// Batched writes
// ---------------------------------------------------------------------------

/**
 * SQLite's compiled variable ceiling is 32,766, but tauri-plugin-sql and
 * better-sqlite3 both pay per bound parameter, so the batches below stay well
 * inside it and split on a round number instead of the limit.
 */
const MAX_BOUND_PARAMS = 800

/** `$1,$2,$3` — a flat placeholder list, for `IN (…)`. */
function placeholderList(count: number, offset = 0): string {
  const cells: string[] = []
  for (let i = 0; i < count; i++) cells.push(`$${offset + i + 1}`)
  return cells.join(',')
}

/** `($1,$2,$3),($4,$5,$6)…` — one group per row. */
function valueGroups(rows: number, columns: number): string {
  const groups: string[] = []
  for (let r = 0; r < rows; r++) groups.push(`(${placeholderList(columns, r * columns)})`)
  return groups.join(',')
}

/** Column counts, so the batch size and the placeholder run cannot disagree. */
const THREAD_COLUMNS = 12
const LABEL_ROW_COLUMNS = 3
const MESSAGE_COLUMNS = 22
const FLAG_COLUMNS = 4

function chunkRows<T>(rows: T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(MAX_BOUND_PARAMS / columns))
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/**
 * Last write wins on a duplicate key. A multi-row upsert must not name the
 * same conflict target twice — SQLite refuses to let ON CONFLICT DO UPDATE
 * touch a row a second time inside one statement.
 */
function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  const byKey = new Map<string, T>()
  for (const row of rows) byKey.set(key(row), row)
  return [...byKey.values()]
}

function applyLabelDelta(labelIds: string[], delta: LabelDelta): string[] {
  const set = new Set(labelIds)
  for (const id of delta.remove) set.delete(id)
  for (const id of delta.add) set.add(id)
  return [...set]
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class Store {
  /** Depth, so a transaction nested inside another one joins it. */
  private txDepth = 0

  constructor(private readonly db: SqlDb) {}

  /**
   * One durable write per batch instead of one per row. A 50-thread sync used
   * to be ~300 sequential round-trips, each with its own implicit commit.
   */
  private async transaction<T>(run: () => Promise<T>): Promise<T> {
    if (this.txDepth > 0) return run()
    this.txDepth++
    await this.db.execute('BEGIN')
    try {
      const result = await run()
      await this.db.execute('COMMIT')
      return result
    } catch (err) {
      try {
        await this.db.execute('ROLLBACK')
      } catch {
        // The transaction was already unwound; the original error is the news.
      }
      throw err
    } finally {
      this.txDepth--
    }
  }

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
    await this.transaction(async () => {
      for (const table of ['messages', 'thread_labels', 'threads', 'labels', 'sync_state']) {
        await this.db.execute(`DELETE FROM ${table} WHERE account_id = $1`, [accountId])
      }
      await this.db.execute('DELETE FROM accounts WHERE id = $1', [accountId])
    })
  }

  // -- threads --------------------------------------------------------------

  async upsertThreads(threads: Thread[]): Promise<void> {
    const rows = dedupeBy(threads, (t) => t.key)
    if (rows.length === 0) return

    await this.transaction(async () => {
      for (const group of chunkRows(rows, THREAD_COLUMNS)) {
        const params = group.flatMap((t) => [
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
        ])
        await this.db.execute(
          `INSERT INTO threads (key, account_id, gmail_thread_id, subject, snippet, last_message_at,
                                participants, label_ids, unread, starred, message_count, has_attachments)
           VALUES ${valueGroups(group.length, THREAD_COLUMNS)}
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
          params,
        )
      }

      // Membership is replaced wholesale, so the delete and the insert are one
      // statement each for the whole batch rather than two per thread.
      const keys = rows.map((t) => t.key)
      for (const group of chunkRows(keys, 1)) {
        await this.db.execute(
          `DELETE FROM thread_labels WHERE thread_key IN (${placeholderList(group.length)})`,
          group,
        )
      }

      const labelRows = rows.flatMap((t) =>
        [...new Set(t.labelIds)].map((labelId) => [t.key, t.accountId, labelId]),
      )
      for (const group of chunkRows(labelRows, LABEL_ROW_COLUMNS)) {
        await this.db.execute(
          `INSERT OR REPLACE INTO thread_labels (thread_key, account_id, label_id)
           VALUES ${valueGroups(group.length, LABEL_ROW_COLUMNS)}`,
          group.flat(),
        )
      }
    })
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
    if (keys.length === 0) return
    await this.transaction(async () => {
      for (const group of chunkRows(keys, 1)) {
        const list = placeholderList(group.length)
        await this.db.execute(`DELETE FROM messages WHERE thread_key IN (${list})`, group)
        await this.db.execute(`DELETE FROM thread_labels WHERE thread_key IN (${list})`, group)
        await this.db.execute(`DELETE FROM threads WHERE key IN (${list})`, group)
      }
    })
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
    const rows = dedupeBy(messages, (m) => m.id)
    if (rows.length === 0) return

    await this.transaction(async () => {
      for (const group of chunkRows(rows, MESSAGE_COLUMNS)) {
        const params = group.flatMap((m) => [
          m.id,
          `${m.accountId}/${m.threadId}`,
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
        ])
        await this.db.execute(
          `INSERT INTO messages (id, thread_key, thread_id, account_id, from_json, to_json, cc_json, bcc_json,
                                 reply_to_json, date, subject, snippet, body_html, body_text, body_state,
                                 label_ids, attachments, rfc_message_id, references_hdr, in_reply_to, unread, starred)
           VALUES ${valueGroups(group.length, MESSAGE_COLUMNS)}
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
          params,
        )
      }
    })
  }

  /**
   * Applies a label delta to every message in a thread, writing only the three
   * flag columns. An action used to round-trip whole message rows — bodies,
   * attachment JSON and all — to move one label, and again to roll back.
   *
   * Returns the flags exactly as they were, so a rollback restores them rather
   * than inverting the delta: a message that was already read must not come
   * back unread because the thread's markRead failed.
   */
  async setMessageFlags(threadKey: string, delta: LabelDelta): Promise<MessageFlags[]> {
    const before = await this.getMessageFlags(threadKey)
    if (before.length === 0) return before
    await this.writeMessageFlags(
      before.map((row) => {
        const labelIds = applyLabelDelta(row.labelIds, delta)
        return {
          id: row.id,
          labelIds,
          unread: labelIds.includes('UNREAD'),
          starred: labelIds.includes('STARRED'),
        }
      }),
    )
    return before
  }

  /** The rollback half of setMessageFlags: puts back exactly what was read. */
  async restoreMessageFlags(rows: MessageFlags[]): Promise<void> {
    await this.writeMessageFlags(rows)
  }

  async getMessageFlags(threadKey: string): Promise<MessageFlags[]> {
    const rows = await this.db.select<{ id: string; label_ids: string; unread: number; starred: number }>(
      'SELECT id, label_ids, unread, starred FROM messages WHERE thread_key = $1 ORDER BY date ASC, id ASC',
      [threadKey],
    )
    return rows.map((r) => ({
      id: r.id,
      labelIds: parseJson<string[]>(r.label_ids, []),
      unread: r.unread === 1,
      starred: r.starred === 1,
    }))
  }

  private async writeMessageFlags(rows: MessageFlags[]): Promise<void> {
    if (rows.length === 0) return
    await this.transaction(async () => {
      for (const group of chunkRows(rows, FLAG_COLUMNS)) {
        // A values list joined back onto messages: one statement for the batch,
        // and the untouched columns are never named, let alone rewritten.
        const params = group.flatMap((r) => [
          r.id,
          JSON.stringify(r.labelIds),
          bit(r.unread),
          bit(r.starred),
        ])
        await this.db.execute(
          `WITH flags(id, label_ids, unread, starred) AS (
             VALUES ${valueGroups(group.length, FLAG_COLUMNS)}
           )
           UPDATE messages SET
             label_ids = (SELECT label_ids FROM flags WHERE flags.id = messages.id),
             unread    = (SELECT unread    FROM flags WHERE flags.id = messages.id),
             starred   = (SELECT starred   FROM flags WHERE flags.id = messages.id)
           WHERE id IN (SELECT id FROM flags)`,
          params,
        )
      }
    })
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
    const rows = dedupeBy(labels, (l) => l.id)
    await this.transaction(async () => {
      await this.db.execute('DELETE FROM labels WHERE account_id = $1', [accountId])
      for (const group of chunkRows(rows, 5)) {
        await this.db.execute(
          `INSERT OR REPLACE INTO labels (account_id, id, name, type, unread_count)
           VALUES ${valueGroups(group.length, 5)}`,
          group.flatMap((l) => [accountId, l.id, l.name, l.type, l.unreadCount ?? null]),
        )
      }
    })
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
