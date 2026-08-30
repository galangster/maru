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
import { parseThreadKey } from '../types'
import type { LabelDelta } from '../service/actions'
import { DEFAULT_PAGE_SIZE, DEFAULT_SETTINGS, viewLabel } from '../defaults'
import { CIPHERTEXT_PREFIX, type Keyring, keyringFor } from '../crypto/keyring'

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

  // 2 — the agent trust substrate (M1). Four tables, no change to migration 1.
  //
  //  · agents      — an identity Maru ISSUED. `credential_hash` is a SHA-256
  //                  digest; the token itself is shown once and never stored.
  //                  A connecting client's self-reported name is never any of
  //                  this (docs/research/mcp-gateway-notes.md §2).
  //  · grants      — append-only. A revoke stamps `revoked_at` on the rows it
  //                  covers rather than deleting them, so the audit trail can
  //                  still explain why a past action was permitted.
  //  · approvals   — the app-level pending-ID composition the MCP spec has no
  //                  primitive for (notes §4). `payload_json` is a ComposeDraft.
  //  · audit_log   — every agent action, append-only, read newest-first.
  `
  CREATE TABLE IF NOT EXISTS agents (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    credential_hash TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    revoked_at      INTEGER
  );
  -- Verification is a lookup by exact digest, so it must be indexed and it
  -- must be unique: two agents sharing a credential is not a state that can
  -- be resolved after the fact.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_credential ON agents (credential_hash);

  CREATE TABLE IF NOT EXISTS grants (
    agent_id   TEXT NOT NULL,
    capability TEXT NOT NULL,
    scope_json TEXT NOT NULL DEFAULT '{"kind":"all"}',
    granted_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_grants_agent ON grants (agent_id, capability);

  CREATE TABLE IF NOT EXISTS approvals (
    id           TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL,
    kind         TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('pending','approved','denied','expired')),
    created_at   INTEGER NOT NULL,
    resolved_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals (status, created_at DESC);

  CREATE TABLE IF NOT EXISTS audit_log (
    id         TEXT PRIMARY KEY,
    agent_id   TEXT NOT NULL,
    at         INTEGER NOT NULL,
    tool       TEXT NOT NULL,
    summary    TEXT NOT NULL,
    thread_key TEXT,
    outcome    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_log (at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log (agent_id, at DESC);
  `,

  // 3 — account ownership for encrypted agent content.
  `
  ALTER TABLE audit_log ADD COLUMN account_id TEXT;
  ALTER TABLE approvals ADD COLUMN account_id TEXT;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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

const ENCRYPTED_THREAD_COLUMNS = ['subject', 'snippet', 'participants'] as const
// The write path in upsertMessages must name the same columns.
const ENCRYPTED_MESSAGE_COLUMNS = [
  'from_json',
  'to_json',
  'cc_json',
  'bcc_json',
  'reply_to_json',
  'subject',
  'snippet',
  'body_html',
  'body_text',
  'attachments',
  'rfc_message_id',
  'references_hdr',
  'in_reply_to',
] as const

const THREAD_COLUMN_FALLBACKS: Record<(typeof ENCRYPTED_THREAD_COLUMNS)[number], string> = {
  subject: '',
  snippet: '',
  participants: '[]',
}

const MESSAGE_COLUMN_FALLBACKS: Record<(typeof ENCRYPTED_MESSAGE_COLUMNS)[number], string> = {
  from_json: '{}',
  to_json: '[]',
  cc_json: '[]',
  bcc_json: '[]',
  reply_to_json: '[]',
  subject: '',
  snippet: '',
  body_html: '',
  body_text: '',
  attachments: '[]',
  rfc_message_id: '',
  references_hdr: '',
  in_reply_to: '',
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

/**
 * WHY THE BATCH WRITES BELOW HAVE NO BEGIN/COMMIT
 *
 * Six methods here write several statements that logically belong together —
 * `deleteAccount`, `upsertThreads`, `deleteThreads`, `upsertMessages`,
 * `writeMessageFlags`, `replaceLabels`. None of them opens a transaction, and
 * that is a finding rather than an omission.
 *
 * Production SQL runs through tauri-plugin-sql's connection POOL. `execute
 * ('BEGIN')` pins the transaction to one pooled connection while the batch's
 * other statements land on different connections; those block behind the write
 * lock and die at the ~5 s busy timeout. Observed live against real Gmail:
 * every write ~5.2 s, rows_affected=0.
 *
 * The multi-row VALUES statements carry the batching win on their own, and
 * each statement is atomic by itself. This used to be recorded on a private
 * `transaction()` that only called its argument — a seam that did nothing but
 * hold a comment, and read at six call sites as though a transaction were
 * being taken.
 */
export class Store {
  constructor(
    private readonly db: SqlDb,
    private readonly keyring: Keyring | null = null,
  ) {}

  static async open(platform: Platform): Promise<Store> {
    const db = await platform.sqlOpen()
    // WAL lets pooled readers proceed while a write is in flight.
    await db.execute('PRAGMA journal_mode = WAL')
    await migrate(db)
    const store = new Store(db, keyringFor(platform))
    await store.encryptLegacyRows()
    return store
  }

  private async encryptValue(accountId: string, value: string | null): Promise<string | null> {
    if (value === null || !this.keyring) return value
    return this.keyring.encrypt(accountId, value)
  }

  private async decryptValue(
    accountId: string,
    value: string | null,
    fallback: string,
  ): Promise<string | null> {
    if (value === null || !this.keyring) return value
    return (await this.keyring.decrypt(accountId, value)) ?? fallback
  }

  private async decryptThreadRow(row: ThreadRow): Promise<ThreadRow> {
    const values = await Promise.all(
      ENCRYPTED_THREAD_COLUMNS.map(async (column) => [
        column,
        await this.decryptValue(row.account_id, row[column], THREAD_COLUMN_FALLBACKS[column]),
      ]),
    )
    return { ...row, ...Object.fromEntries(values) } as ThreadRow
  }

  private async decryptMessageRow(row: MessageRow): Promise<MessageRow> {
    const values = await Promise.all(
      ENCRYPTED_MESSAGE_COLUMNS.map(async (column) => [
        column,
        await this.decryptValue(row.account_id, row[column], MESSAGE_COLUMN_FALLBACKS[column]),
      ]),
    )
    return { ...row, ...Object.fromEntries(values) } as MessageRow
  }

  private async updateColumnByKey(
    table: string,
    keyColumns: readonly string[],
    column: string,
    updates: Record<string, string>[],
  ): Promise<void> {
    const columns = [...keyColumns, 'value']
    for (const group of chunkRows(updates, columns.length)) {
      const matches = keyColumns
        .map((key) => `updates.${key} = ${table}.${key}`)
        .join(' AND ')
      await this.db.execute(
        `WITH updates(${columns.join(', ')}) AS (
           VALUES ${valueGroups(group.length, columns.length)}
         )
         UPDATE ${table} SET
           ${column} = (SELECT value FROM updates WHERE ${matches})
         WHERE EXISTS (SELECT 1 FROM updates WHERE ${matches})`,
        group.flatMap((row) => [...keyColumns.map((key) => row[key]), row.value]),
      )
    }
  }

  private async backfillAgentAccountIds(): Promise<void> {
    let afterId = ''
    while (true) {
      const approvals = await this.db.select<{
        id: string
        payload_json: string
      }>(
        `SELECT id, payload_json FROM approvals
         WHERE account_id IS NULL AND id > $1 ORDER BY id LIMIT $2`,
        [afterId, MAX_BOUND_PARAMS],
      )
      if (approvals.length === 0) break
      const updates: Record<string, string>[] = []
      for (const row of approvals) {
        const payload = parseJson<{ accountId?: unknown } | null>(row.payload_json, null)
        if (typeof payload?.accountId === 'string' && payload.accountId) {
          updates.push({ id: row.id, value: payload.accountId })
        }
      }
      await this.updateColumnByKey('approvals', ['id'], 'account_id', updates)
      afterId = approvals[approvals.length - 1].id
    }

    afterId = ''
    while (true) {
      const auditRows = await this.db.select<{ id: string; thread_key: string }>(
        `SELECT id, thread_key FROM audit_log
         WHERE account_id IS NULL AND thread_key IS NOT NULL AND id > $1
         ORDER BY id LIMIT $2`,
        [afterId, MAX_BOUND_PARAMS],
      )
      if (auditRows.length === 0) break
      const updates: Record<string, string>[] = []
      for (const row of auditRows) {
        if (row.thread_key.startsWith(CIPHERTEXT_PREFIX)) continue
        if (!row.thread_key.includes('/')) continue
        const { accountId } = parseThreadKey(row.thread_key)
        if (accountId) updates.push({ id: row.id, value: accountId })
      }
      await this.updateColumnByKey('audit_log', ['id'], 'account_id', updates)
      afterId = auditRows[auditRows.length - 1].id
    }
  }

  private async encryptTable(
    table: string,
    keyColumns: readonly string[],
    columns: readonly string[],
  ): Promise<void> {
    if (!this.keyring) return
    const pageSize = 500
    let after = keyColumns.map(() => '')
    while (true) {
      const cursor =
        keyColumns.length === 1
          ? `${keyColumns[0]} > $1`
          : `(${keyColumns.join(', ')}) > (${placeholderList(keyColumns.length)})`
      const rows = await this.db.select<Record<string, string | null>>(
        `SELECT ${[...keyColumns, 'account_id', ...columns].join(', ')}
         FROM ${table}
         WHERE account_id IS NOT NULL AND ${cursor}
         ORDER BY ${keyColumns.join(', ')}
         LIMIT $${keyColumns.length + 1}`,
        [...after, pageSize],
      )
      if (rows.length === 0) return

      for (const column of columns) {
        const pageUpdates = await Promise.all(
          rows.map(async (row): Promise<Record<string, string> | null> => {
            const accountId = row.account_id
            const value = row[column]
            if (
              !accountId ||
              value === null ||
              value === '' ||
              value.startsWith(CIPHERTEXT_PREFIX) ||
              (table === 'messages' && column === 'attachments' && value === '[]')
            ) {
              return null
            }
            const update: Record<string, string> = {
              value: await this.keyring!.encrypt(accountId, value),
            }
            for (const key of keyColumns) update[key] = row[key] as string
            return update
          }),
        )
        const updates = pageUpdates.filter((update): update is Record<string, string> => update !== null)
        await this.updateColumnByKey(table, keyColumns, column, updates)
      }

      const last = rows[rows.length - 1]
      after = keyColumns.map((key) => last[key] as string)
      if (rows.length < pageSize) return
    }
  }

  private async encryptLegacyRows(): Promise<void> {
    if (!this.keyring) return
    const swept = await this.db.select<{ value: string }>(
      `SELECT value FROM meta WHERE key = 'encryption-sweep'`,
    )
    if (swept.length > 0) return
    await this.backfillAgentAccountIds()

    const accounts = await this.db.select<{ id: string }>('SELECT id FROM accounts')
    await Promise.all(accounts.map((account) => this.keyring!.keyFor(account.id)))

    await this.encryptTable('threads', ['key'], ENCRYPTED_THREAD_COLUMNS)
    await this.encryptTable('messages', ['id'], ENCRYPTED_MESSAGE_COLUMNS)
    await this.encryptTable('labels', ['account_id', 'id'], ['name'])
    await this.encryptTable('approvals', ['id'], ['payload_json'])
    await this.encryptTable('audit_log', ['id'], ['summary', 'thread_key'])
    // New rows encrypt on write, so one global marker covers all later opens.
    await this.db.execute(`INSERT INTO meta (key, value) VALUES ('encryption-sweep', '1')`)
  }

  // -- accounts -------------------------------------------------------------

  async upsertAccount(a: Account): Promise<void> {
    await this.keyring?.keyFor(a.id)
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

  async deleteAccount(accountId: string, now: number): Promise<void> {
    await this.db.execute(
      `UPDATE approvals SET status = 'expired', resolved_at = $1
       WHERE account_id = $2 AND status = 'pending'`,
      [now, accountId],
    )
    for (const table of ['messages', 'thread_labels', 'threads', 'labels', 'sync_state']) {
      await this.db.execute(`DELETE FROM ${table} WHERE account_id = $1`, [accountId])
    }
    await this.db.execute('DELETE FROM accounts WHERE id = $1', [accountId])
    // Key destruction cryptographically erases this account's append-only audit content.
    await this.keyring?.destroy(accountId)
  }

  // -- threads --------------------------------------------------------------

  async upsertThreads(threads: Thread[]): Promise<void> {
    const rows = dedupeBy(threads, (t) => t.key)
    if (rows.length === 0) return

    for (const group of chunkRows(rows, THREAD_COLUMNS)) {
      const params = (
        await Promise.all(
          group.map(async (t) => {
            const [subject, snippet, participants] = await Promise.all([
              this.encryptValue(t.accountId, t.subject),
              this.encryptValue(t.accountId, t.snippet),
              this.encryptValue(t.accountId, JSON.stringify(t.participants)),
            ])
            return [
              t.key,
              t.accountId,
              t.gmailThreadId,
              subject,
              snippet,
              t.lastMessageAt,
              participants,
              JSON.stringify(t.labelIds),
              bit(t.unread),
              bit(t.starred),
              t.messageCount,
              bit(t.hasAttachments),
            ]
          }),
        )
      ).flat()
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
  }

  async getThread(key: string): Promise<Thread | null> {
    const rows = await this.db.select<ThreadRow>('SELECT * FROM threads WHERE key = $1', [key])
    return rows.length ? rowToThread(await this.decryptThreadRow(rows[0])) : null
  }

  async allThreads(): Promise<Thread[]> {
    const rows = await this.db.select<ThreadRow>('SELECT * FROM threads ORDER BY last_message_at DESC')
    return Promise.all(rows.map(async (row) => rowToThread(await this.decryptThreadRow(row))))
  }

  async deleteThreads(keys: string[]): Promise<void> {
    if (keys.length === 0) return
    for (const group of chunkRows(keys, 1)) {
      const list = placeholderList(group.length)
      await this.db.execute(`DELETE FROM messages WHERE thread_key IN (${list})`, group)
      await this.db.execute(`DELETE FROM thread_labels WHERE thread_key IN (${list})`, group)
      await this.db.execute(`DELETE FROM threads WHERE key IN (${list})`, group)
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
    return Promise.all(rows.map(async (row) => rowToThread(await this.decryptThreadRow(row))))
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

    for (const group of chunkRows(rows, MESSAGE_COLUMNS)) {
      const params = (
        await Promise.all(
          group.map(async (m) => {
            const attachments = JSON.stringify(m.attachments)
            const [
              from,
              to,
              cc,
              bcc,
              replyTo,
              subject,
              snippet,
              bodyHtml,
              bodyText,
              encryptedAttachments,
              rfcMessageId,
              references,
              inReplyTo,
            ] = await Promise.all([
              this.encryptValue(m.accountId, JSON.stringify(m.from)),
              this.encryptValue(m.accountId, JSON.stringify(m.to)),
              this.encryptValue(m.accountId, JSON.stringify(m.cc)),
              this.encryptValue(m.accountId, JSON.stringify(m.bcc)),
              this.encryptValue(m.accountId, JSON.stringify(m.replyTo)),
              this.encryptValue(m.accountId, m.subject),
              this.encryptValue(m.accountId, m.snippet),
              this.encryptValue(m.accountId, m.bodyHtml ?? null),
              this.encryptValue(m.accountId, m.bodyText ?? null),
              attachments === '[]'
                ? Promise.resolve(attachments)
                : this.encryptValue(m.accountId, attachments),
              this.encryptValue(m.accountId, m.rfcMessageId ?? null),
              this.encryptValue(m.accountId, m.references ?? null),
              this.encryptValue(m.accountId, m.inReplyTo ?? null),
            ])
            return [
              m.id,
              `${m.accountId}/${m.threadId}`,
              m.threadId,
              m.accountId,
              from,
              to,
              cc,
              bcc,
              replyTo,
              m.date,
              subject,
              snippet,
              bodyHtml,
              bodyText,
              m.bodyState,
              JSON.stringify(m.labelIds),
              encryptedAttachments,
              rfcMessageId,
              references,
              inReplyTo,
              bit(m.unread),
              bit(m.starred),
            ]
          }),
        )
      ).flat()
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
  }

  async listMessages(threadKey: string): Promise<Message[]> {
    const rows = await this.db.select<MessageRow>(
      'SELECT * FROM messages WHERE thread_key = $1 ORDER BY date ASC, id ASC',
      [threadKey],
    )
    return Promise.all(rows.map(async (row) => rowToMessage(await this.decryptMessageRow(row))))
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
    await this.db.execute('DELETE FROM labels WHERE account_id = $1', [accountId])
    for (const group of chunkRows(rows, 5)) {
      const params = (
        await Promise.all(
          group.map(async (label) => [
            accountId,
            label.id,
            await this.encryptValue(accountId, label.name),
            label.type,
            label.unreadCount ?? null,
          ]),
        )
      ).flat()
      await this.db.execute(
        `INSERT OR REPLACE INTO labels (account_id, id, name, type, unread_count)
         VALUES ${valueGroups(group.length, 5)}`,
        params,
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
    }>('SELECT * FROM labels WHERE account_id = $1', [accountId])
    const labels = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        accountId: r.account_id,
        name: (await this.decryptValue(r.account_id, r.name, '')) ?? '',
        type: r.type === 'system' ? ('system' as const) : ('user' as const),
        unreadCount: r.unread_count ?? undefined,
      })),
    )
    return labels.sort(
      (a, b) =>
        Number(b.type === 'system') - Number(a.type === 'system') ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )
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
