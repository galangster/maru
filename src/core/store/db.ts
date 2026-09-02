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
import { DEFAULT_PAGE_SIZE, DEFAULT_SETTINGS, DEFERRAL_TTL_MS, WOKE_RETENTION_MS, viewLabel } from '../defaults'
import { CIPHERTEXT_PREFIX, type Keyring, keyringFor } from '../crypto/keyring'

export { DEFAULT_PAGE_SIZE, DEFAULT_SETTINGS, FOLDER_LABELS } from '../defaults'

/**
 * One deferral fact, in device-local terms: a `thread_key`, and the moment the
 * decision behind it was made.
 *
 * `until: null` is a tombstone — a deferral that was cleared. `at` is `set_at`
 * for a live row and `cleared_at` for a tombstone, which is exactly what the
 * vault merge in MARU-ACCOUNT.md §6 compares.
 */
export interface DeferralRecord {
  threadKey: string
  accountId: string
  until: number | null
  at: number
}

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
  // 4 — repair threads that a single deleted reply hid from every view.
  //
  // mapGmailThread unioned TRASH and SPAM across a thread's messages like any
  // other label, so one trashed message anywhere in a conversation's history
  // stamped TRASH on the thread — and every non-trash view excludes TRASH. The
  // conversation vanished from the inbox while its newest message plainly sat
  // there. Found on the owner's own mailbox, 2026-08-31: 58 threads across four
  // accounts, including both messages he reported missing.
  //
  // The mapping is fixed, but that only helps a thread the next sync happens to
  // touch, and a thread nobody replies to is never touched again. This repairs
  // what is already stored, from the messages already stored, with no network.
  //
  // Both statements ask the same question: does this thread hold a message that
  // does NOT carry the location label? If so the label was a union artefact and
  // comes off. A thread with no stored messages is left alone — the EXISTS is
  // false — which matches the mapping's own guard against inventing a label
  // that none of its messages had.
  `
  DELETE FROM thread_labels
  WHERE label_id IN ('TRASH','SPAM')
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.thread_key = thread_labels.thread_key
        AND NOT EXISTS (
          SELECT 1 FROM json_each(m.label_ids) je WHERE je.value = thread_labels.label_id
        )
    );

  UPDATE threads SET label_ids = (
    SELECT json_group_array(je.value) FROM json_each(threads.label_ids) je
    WHERE NOT (
      je.value IN ('TRASH','SPAM')
      AND EXISTS (
        SELECT 1 FROM messages m
        WHERE m.thread_key = threads.key
          AND NOT EXISTS (SELECT 1 FROM json_each(m.label_ids) j2 WHERE j2.value = je.value)
      )
    )
  )
  WHERE EXISTS (
    SELECT 1 FROM json_each(threads.label_ids) je
    WHERE je.value IN ('TRASH','SPAM')
      AND EXISTS (
        SELECT 1 FROM messages m
        WHERE m.thread_key = threads.key
          AND NOT EXISTS (SELECT 1 FROM json_each(m.label_ids) j2 WHERE j2.value = je.value)
      )
  );
  `,
  // 5 — remote images load by default (owner, 2026-08-31: "can we please not
  // do this by default anymore? maybe it can be an option but it's annoying to
  // have to click this every time").
  //
  // Flipping DEFAULT_SETTINGS alone would have shipped a change that does
  // nothing on the machine that reported the problem. `setSettings` writes the
  // WHOLE merged object rather than the patch, and `getSettings` spreads the
  // stored row OVER the defaults — so every install that has ever saved any
  // setting already carries a literal "imagePolicy":"block", and it wins.
  //
  // A stored 'block' cannot encode an intention here: until this release
  // nothing read the value and no control could set it. It was a dead field.
  // One-shot and keyed on user_version, so a `block` a person deliberately
  // chooses AFTER this ships is never touched.
  //
  // It REMOVES the key rather than writing 'allow' over it, and that is the
  // point: `getSettings` spreads the stored row over DEFAULT_SETTINGS, so an
  // absent key means "whatever the default is". Writing the literal would have
  // made defaults.ts the second of three copies and quietly falsified the
  // reversal cost recorded in DECISIONS.md — flip that one word back and a
  // migration hardcoding 'allow' would still overrule it on every install.
  //
  // NOT IDEMPOTENT, and the only entry in this array that is not. Re-running it
  // would erase a `block` a person actually chose. It is safe only because
  // `migrate()` stamps user_version past it on the first run, and the one crash
  // window — between the execute and the PRAGMA — is a window in which
  // Store.open never returned, so no UI existed in which to choose anything.
  //
  // A fresh database has no settings row at all, so this is a no-op there.
  `
  UPDATE settings SET json = json_remove(json, '$.imagePolicy')
  WHERE json_extract(json, '$.imagePolicy') = 'block';
  `,
  // 6 — Later (P21), in its own table.
  //
  // THE INVARIANT, and it is the whole design:
  //
  //     Maru never disagrees with Gmail about what a thread's labels are.
  //     It only decides what to show you.
  //
  // A deferred thread still carries INBOX in `thread_labels`; archiving it
  // later still removes INBOX correctly; there is no conflict to arbitrate and
  // no precedence rule to write. Deferral is a predicate over a stored
  // timestamp, evaluated when the query runs.
  //
  // The enforcement is STRUCTURAL rather than a rule anyone has to remember.
  // `upsertThreads` rewrites `threads.label_ids` and deletes and re-inserts
  // `thread_labels` wholesale on every sync pass — so any local state expressed
  // as a label is destroyed within one poll interval. But it names those two
  // tables and nothing else, so a separate table cannot be clobbered by a
  // method that does not know it exists. A COLUMN on `threads` would NOT have
  // this property: `upsertThreads` rewrites twelve named columns from a Thread,
  // so a stale in-memory Thread round-tripping through any sync path would
  // silently erase the deferral.
  //
  // Why local-only rather than a Gmail label, in one line: a label-based snooze
  // removes INBOX at Google and needs a network write at wake time that only
  // happens if this Mac runs, so a laptop shut Monday to Friday hides mail on
  // every device, past its time, with no timer anywhere that will fix it.
  // Label-based fails unsafe. Local-only fails safe.
  //
  // No ALTER on any existing table, so the encryption sweep and
  // ENCRYPTED_THREAD_COLUMNS are untouched. No keyring encryption either:
  // `thread_key` is already plaintext as `threads.key`, and two timestamps are
  // not message content.
  //
  // Idempotent, unlike entry 5.
  `
  CREATE TABLE IF NOT EXISTS thread_defer (
    thread_key TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    wake_at    INTEGER NOT NULL,
    set_at     INTEGER NOT NULL,
    woke_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_thread_defer_wake ON thread_defer (wake_at);
  CREATE INDEX IF NOT EXISTS idx_thread_defer_account ON thread_defer (account_id);
  `,

  // 7 — the deferral tombstone (A9). Later crosses devices now, and a DELETE
  // does not cross anything.
  //
  // Owner ruling, Nick 2026-09-02: deferrals sync inside the encrypted vault.
  // The moment they do, "cleared" needs a representation. A row that is simply
  // gone is indistinguishable from a row this device never had, so the other
  // device's copy of the old `until` would win every merge and re-hide a thread
  // the person deliberately brought back. The tombstone is what makes a clear
  // an event rather than an absence.
  //
  // Its own table, for migration 6's reason exactly: `thread_defer` is deleted
  // from by `sweepDeferrals`, `deleteThreads` and `clearDeferral`, and a
  // tombstone that lived there would have to survive all three.
  //
  // Bounded by `sweepDeferrals`, which drops tombstones past DEFERRAL_TTL_MS.
  `
  CREATE TABLE IF NOT EXISTS thread_defer_cleared (
    thread_key TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    cleared_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_thread_defer_cleared_at ON thread_defer_cleared (cleared_at);
  CREATE INDEX IF NOT EXISTS idx_thread_defer_cleared_account ON thread_defer_cleared (account_id);
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
  /** From the LEFT JOIN on `thread_defer`, never from a column on `threads`. */
  defer_wake_at?: number | null
  defer_woke_at?: number | null
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
    deferredUntil: r.defer_wake_at ?? undefined,
    wokeAt: r.defer_woke_at ?? undefined,
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
const DEFER_COLUMNS = 4
const DEFER_CLEARED_COLUMNS = 3

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
    // `thread_defer` belongs in this loop, not beside it: leaving deferral rows
    // behind after a "delete my data" is exactly the promise the `keyring.destroy`
    // below is careful to keep.
    for (const table of ['messages', 'thread_labels', 'threads', 'thread_defer', 'thread_defer_cleared', 'labels', 'sync_state']) {
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

  /**
   * The read path's one spelling of "and whatever Later knows about it".
   *
   * A LEFT JOIN rather than a column, because `upsertThreads` must never be
   * able to write these back — see the invariant above migration 6.
   */
  private static readonly DEFER_JOIN =
    'LEFT JOIN thread_defer d ON d.thread_key = t.key'
  private static readonly DEFER_COLUMNS =
    'd.wake_at AS defer_wake_at, d.woke_at AS defer_woke_at'

  async getThread(key: string): Promise<Thread | null> {
    const rows = await this.db.select<ThreadRow>(
      `SELECT t.*, ${Store.DEFER_COLUMNS} FROM threads t ${Store.DEFER_JOIN} WHERE t.key = $1`,
      [key],
    )
    return rows.length ? rowToThread(await this.decryptThreadRow(rows[0])) : null
  }

  /** Feeds the search index, which is why it carries the defer columns too. */
  async allThreads(): Promise<Thread[]> {
    const rows = await this.db.select<ThreadRow>(
      `SELECT t.*, ${Store.DEFER_COLUMNS} FROM threads t ${Store.DEFER_JOIN}
       ORDER BY t.last_message_at DESC`,
    )
    return Promise.all(rows.map(async (row) => rowToThread(await this.decryptThreadRow(row))))
  }

  async deleteThreads(keys: string[]): Promise<void> {
    if (keys.length === 0) return
    for (const group of chunkRows(keys, 1)) {
      const list = placeholderList(group.length)
      await this.db.execute(`DELETE FROM messages WHERE thread_key IN (${list})`, group)
      await this.db.execute(`DELETE FROM thread_labels WHERE thread_key IN (${list})`, group)
      // Without this a thread that falls out of the 90-day window orphans its
      // deferral row, and the row would then match a later thread that happened
      // to reuse the key.
      await this.db.execute(`DELETE FROM thread_defer WHERE thread_key IN (${list})`, group)
      // The tombstone goes with it. An evicted thread is not a cleared
      // deferral, and a tombstone for a thread nobody holds any more is a row
      // that can only ever lose a merge.
      await this.db.execute(`DELETE FROM thread_defer_cleared WHERE thread_key IN (${list})`, group)
      await this.db.execute(`DELETE FROM threads WHERE key IN (${list})`, group)
    }
  }

  // -- Later ------------------------------------------------------------------

  /**
   * Save a thread for later. `woke_at` is cleared on the way in, so re-saving a
   * thread that already came back once starts a fresh deferral rather than
   * inheriting the old wake stamp and its position at the top of Today.
   */
  async setDeferral(threadKey: string, accountId: string, wakeAt: number, now: number): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO thread_defer (thread_key, account_id, wake_at, set_at, woke_at)
       VALUES ($1, $2, $3, $4, NULL)`,
      [threadKey, accountId, wakeAt, now],
    )
    // Saving it again answers the tombstone, so the tombstone goes. Leaving it
    // would let a merge weigh a clear the person has already superseded.
    await this.db.execute('DELETE FROM thread_defer_cleared WHERE thread_key = $1', [threadKey])
  }

  /**
   * Take the deferral off — an undo, a reply, an archive, or an explicit cancel.
   *
   * Returns how many deferrals actually came off, which is the whole reason it
   * is not `void`: the engine's reply-wake passes every thread that gained a
   * message, and almost none of them were deferred. A caller that pushes the
   * vault on a clear needs to know a clear happened.
   *
   * Writes a tombstone for each row it removes, and only for rows it removes
   * — a "clear" on a thread that was never saved is not an event, and a
   * tombstone for it would be a row that can never win a merge.
   */
  async clearDeferral(keys: string[], now: number = Date.now()): Promise<number> {
    if (keys.length === 0) return 0
    let cleared = 0
    for (const group of chunkRows(keys, 1)) {
      const list = placeholderList(group.length)
      const rows = await this.db.select<{ n: number }>(
        `SELECT COUNT(*) AS n FROM thread_defer WHERE thread_key IN (${list})`,
        group,
      )
      const hit = rows[0]?.n ?? 0
      if (hit === 0) continue
      cleared += hit
      // account_id comes from the row being deleted, in the same statement, so
      // the tombstone can never name an account the deferral did not belong to.
      await this.db.execute(
        `INSERT OR REPLACE INTO thread_defer_cleared (thread_key, account_id, cleared_at)
         SELECT thread_key, account_id, $${group.length + 1} FROM thread_defer
         WHERE thread_key IN (${list})`,
        [...group, now],
      )
      await this.db.execute(`DELETE FROM thread_defer WHERE thread_key IN (${list})`, group)
    }
    return cleared
  }

  /**
   * Every deferral fact this device holds, for the Maru vault — live rows and
   * tombstones in one list, in the shape MARU-ACCOUNT.md §4 travels in.
   *
   * Live rows only while they are live: a woken deferral is already true on
   * every device, because `wake_at > now` is the same predicate everywhere,
   * so re-asserting it across the vault would say nothing and cost bytes.
   */
  async deferralRecords(): Promise<DeferralRecord[]> {
    const live = await this.db.select<{ thread_key: string; account_id: string; wake_at: number; set_at: number }>(
      'SELECT thread_key, account_id, wake_at, set_at FROM thread_defer WHERE woke_at IS NULL',
    )
    const cleared = await this.db.select<{ thread_key: string; account_id: string; cleared_at: number }>(
      'SELECT thread_key, account_id, cleared_at FROM thread_defer_cleared',
    )
    return [
      ...live.map((r) => ({ threadKey: r.thread_key, accountId: r.account_id, until: r.wake_at, at: r.set_at })),
      ...cleared.map((r) => ({ threadKey: r.thread_key, accountId: r.account_id, until: null, at: r.cleared_at })),
    ]
  }

  /**
   * Write deferral facts that arrived from another device. Returns rows moved.
   *
   * A plain write, deliberately: the merge rule lives in `mergeDeferrals` and
   * has already run against this device's own rows by the time anything gets
   * here. Two stores implementing precedence twice is how they come to
   * disagree.
   */
  async applyDeferralRecords(records: DeferralRecord[]): Promise<number> {
    // Partitioned first, then two statements per side, the way every other
    // batch write in this file works: a pull that carries a hundred deferrals
    // used to cost two hundred round trips.
    const live = records.filter((record) => record.until !== null)
    const tombs = records.filter((record) => record.until === null)

    // `woke_at` is left out of the column list on purpose. INSERT OR REPLACE
    // rewrites the whole row, so an omitted nullable column lands as NULL —
    // which is what re-saving a thread means: a fresh deferral, not the old
    // wake stamp and its place at the top of Today.
    for (const group of chunkRows(live, DEFER_COLUMNS)) {
      await this.db.execute(
        `INSERT OR REPLACE INTO thread_defer (thread_key, account_id, wake_at, set_at)
         VALUES ${valueGroups(group.length, DEFER_COLUMNS)}`,
        group.flatMap((record) => [record.threadKey, record.accountId, record.until, record.at]),
      )
    }
    for (const group of chunkRows(live, 1)) {
      // Saving it again answers the tombstone, so the tombstone goes.
      await this.db.execute(
        `DELETE FROM thread_defer_cleared WHERE thread_key IN (${placeholderList(group.length)})`,
        group.map((record) => record.threadKey),
      )
    }

    for (const group of chunkRows(tombs, DEFER_CLEARED_COLUMNS)) {
      await this.db.execute(
        `INSERT OR REPLACE INTO thread_defer_cleared (thread_key, account_id, cleared_at)
         VALUES ${valueGroups(group.length, DEFER_CLEARED_COLUMNS)}`,
        group.flatMap((record) => [record.threadKey, record.accountId, record.at]),
      )
    }
    for (const group of chunkRows(tombs, 1)) {
      await this.db.execute(
        `DELETE FROM thread_defer WHERE thread_key IN (${placeholderList(group.length)})`,
        group.map((record) => record.threadKey),
      )
    }

    return records.length
  }

  /**
   * The lazy sweep. Two indexed statements, no timer, nothing to miss.
   *
   * The UPDATE stamps every deferral that has come due, which is what puts the
   * thread at the top of Today rather than wherever its last message would have
   * placed it. The DELETE is the garbage collection that ENDS that treatment 24
   * hours later — without it a thread woken in March would still be sorting by
   * its wake time in June.
   *
   * Returns how many threads actually moved, so a caller can invalidate only
   * when something changed rather than on every tick of a clock.
   */
  async sweepDeferrals(now: number): Promise<{ woken: number }> {
    const due = await this.db.select<{ n: number }>(
      'SELECT COUNT(*) AS n FROM thread_defer WHERE wake_at <= $1 AND woke_at IS NULL',
      [now],
    )
    const woken = due[0]?.n ?? 0
    if (woken > 0) {
      await this.db.execute(
        'UPDATE thread_defer SET woke_at = $1 WHERE wake_at <= $1 AND woke_at IS NULL',
        [now],
      )
    }
    await this.db.execute(
      'DELETE FROM thread_defer WHERE woke_at IS NOT NULL AND woke_at <= $1',
      [now - WOKE_RETENTION_MS],
    )
    // The tombstone's own garbage collection, on the same lazy sweep — see
    // DEFERRAL_TTL_MS.
    await this.db.execute(
      'DELETE FROM thread_defer_cleared WHERE cleared_at <= $1',
      [now - DEFERRAL_TTL_MS],
    )
    return { woken }
  }

  /**
   * Every thread holding a LIVE deferral, for `resyncWindow`'s eviction guard.
   * A thread whose last message is already 60 days old, saved 30 days out,
   * would otherwise be deleted at day 90 and take its deferral with it.
   */
  async deferredKeys(): Promise<string[]> {
    const rows = await this.db.select<{ thread_key: string }>(
      'SELECT thread_key FROM thread_defer WHERE woke_at IS NULL',
    )
    return rows.map((r) => r.thread_key)
  }

  async listThreadKeys(accountId: string): Promise<string[]> {
    const rows = await this.db.select<{ key: string }>('SELECT key FROM threads WHERE account_id = $1', [accountId])
    return rows.map((r) => r.key)
  }

  /**
   * SQL twin of threadMatchesView; both read the label rule from defaults.ts.
   *
   * `now` is what the deferral half is evaluated against. One clause covers the
   * unified inbox AND every per-account inbox, and `countUnread` gets the
   * sidebar badge right for free because it shares this method.
   */
  private viewClause(view: MailView, now: number): { where: string; params: unknown[] } {
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
    // INBOX only, and Later is the same subquery read the other way round. A
    // deferred thread that is also starred still appears under Starred:
    // deferral is about the inbox, not about the mailbox.
    if (view.kind === 'later' || label === 'INBOX') {
      params.push(now)
      const subquery = `(SELECT thread_key FROM thread_defer WHERE wake_at > $${params.length})`
      where += view.kind === 'later' ? ` AND t.key IN ${subquery}` : ` AND t.key NOT IN ${subquery}`
    }
    return { where, params }
  }

  async listThreads(view: MailView, opts: ListThreadsOptions = {}): Promise<Thread[]> {
    const now = opts.now ?? Date.now()
    const { where, params } = this.viewClause(view, now)
    const args = [...params]
    // Later orders by when each thread comes BACK — next to return, first.
    // Every other view orders by the sort key, which is `last_message_at`
    // except for a thread that has just woken: without the `woke_at` term a
    // thread from three weeks ago saved until this morning returns at list
    // position ninety and is never seen. The cursor compares against the SAME
    // expression, or paging would walk a different order than the one it sorts
    // by. (Nothing in src/ passes `before` today, so that half is a correctness
    // fix on a dormant path rather than a live break.)
    const later = view.kind === 'later'
    const order = later ? 'd.wake_at' : 'MAX(t.last_message_at, COALESCE(d.woke_at, 0))'
    let sql = `SELECT t.*, ${Store.DEFER_COLUMNS} FROM threads t ${Store.DEFER_JOIN} WHERE ${where}`
    if (opts.before !== undefined) {
      args.push(opts.before)
      sql += ` AND ${order} ${later ? '>' : '<'} $${args.length}`
    }
    args.push(opts.limit ?? DEFAULT_PAGE_SIZE)
    sql += ` ORDER BY ${order} ${later ? 'ASC' : 'DESC'}, t.key ASC LIMIT $${args.length}`
    const rows = await this.db.select<ThreadRow>(sql, args)
    return Promise.all(rows.map(async (row) => rowToThread(await this.decryptThreadRow(row))))
  }

  async countUnread(view: MailView, now: number = Date.now()): Promise<number> {
    const { where, params } = this.viewClause(view, now)
    const rows = await this.db.select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM threads t WHERE ${where} AND t.unread = 1`,
      params,
    )
    return rows[0]?.n ?? 0
  }

  /** How many threads are waiting in Later — the sidebar row's count. */
  async countDeferred(now: number = Date.now()): Promise<number> {
    const { where, params } = this.viewClause({ kind: 'later' }, now)
    const rows = await this.db.select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM threads t WHERE ${where}`,
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
