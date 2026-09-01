import { describe, it, expect, beforeEach } from 'vitest'
import { Store, MIGRATIONS, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../src/core/store/db'
import { NodePlatform, NodeSqlDb } from './helpers/node-platform'
import { makeAccount, makeLabel, makeMessage, makeThread } from './fixtures/domain'

async function openStore(): Promise<{ store: Store; db: NodeSqlDb }> {
  const platform = new NodePlatform()
  const db = (await platform.sqlOpen()) as NodeSqlDb
  const store = await Store.open(platform)
  return { store, db }
}

describe('migrations', () => {
  it('stamps user_version with the migration count', async () => {
    const { db } = await openStore()
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length)
    expect(db.raw.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
  })

  it('creates every table the engine reads', async () => {
    const { db } = await openStore()
    const names = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of ['accounts', 'threads', 'thread_labels', 'messages', 'labels', 'sync_state', 'settings']) {
      expect(names).toContain(t)
    }
  })

  it('is idempotent when reopened against the same database', async () => {
    const platform = new NodePlatform()
    const db = (await platform.sqlOpen()) as NodeSqlDb
    await Store.open(platform)
    const store = await Store.open(platform)
    await store.upsertAccount(makeAccount())
    expect(db.raw.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(await store.listAccounts()).toHaveLength(1)
  })
})

describe('accounts', () => {
  it('upserts and lists in insertion order', async () => {
    const { store } = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertAccount(makeAccount({ id: 'acct-2', email: 'nick.galang@gmail.com', displayName: 'Work', addedAt: 1_700_000_100_000 }))
    expect((await store.listAccounts()).map((a) => a.id)).toEqual(['acct-1', 'acct-2'])
  })

  it('replaces an existing row rather than duplicating it', async () => {
    const { store } = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertAccount(makeAccount({ displayName: 'Renamed', color: '#8b5cf6' }))
    const accounts = await store.listAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ displayName: 'Renamed', color: '#8b5cf6' })
  })

  it('removes the account and everything hanging off it', async () => {
    const { store } = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.upsertMessages([makeMessage()])
    await store.deleteAccount('acct-1', 1_700_000_200_000)
    expect(await store.listAccounts()).toEqual([])
    expect(await store.listThreads({ kind: 'unified', folder: 'inbox' })).toEqual([])
    expect(await store.listMessages('acct-1/t-1')).toEqual([])
  })
})

describe('threads', () => {
  let store: Store
  beforeEach(async () => {
    store = (await openStore()).store
  })

  it('round-trips a thread including json columns', async () => {
    const thread = makeThread({
      participants: [
        { name: 'Maya Ellison', email: 'maya@fernwood.dev' },
        { email: 'ops@fernwood.dev' },
      ],
      labelIds: ['INBOX', 'UNREAD', 'Label_12'],
      unread: true,
      starred: true,
      messageCount: 4,
      hasAttachments: true,
    })
    await store.upsertThreads([thread])
    const back = await store.getThread('acct-1/t-1')
    expect(back).toEqual(thread)
  })

  it('updates in place on a second upsert', async () => {
    await store.upsertThreads([makeThread()])
    await store.upsertThreads([makeThread({ snippet: 'Newer', lastMessageAt: 1_755_999_000_000, messageCount: 2 })])
    const all = await store.allThreads()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ snippet: 'Newer', messageCount: 2 })
  })

  it('replaces label membership rows instead of accumulating them', async () => {
    await store.upsertThreads([makeThread({ labelIds: ['INBOX', 'UNREAD'] })])
    await store.upsertThreads([makeThread({ labelIds: ['INBOX'] })])
    const inbox = await store.listThreads({ kind: 'account', accountId: 'acct-1', labelId: 'INBOX' })
    const unread = await store.listThreads({ kind: 'account', accountId: 'acct-1', labelId: 'UNREAD' })
    expect(inbox).toHaveLength(1)
    expect(unread).toHaveLength(0)
  })

  it('deletes a thread and its messages', async () => {
    await store.upsertThreads([makeThread()])
    await store.upsertMessages([makeMessage()])
    await store.deleteThreads(['acct-1/t-1'])
    expect(await store.getThread('acct-1/t-1')).toBeNull()
    expect(await store.listMessages('acct-1/t-1')).toEqual([])
    expect(await store.listThreads({ kind: 'account', accountId: 'acct-1', labelId: 'INBOX' })).toEqual([])
  })

  it('lists the thread keys held for one account only', async () => {
    await store.upsertThreads([
      makeThread({ gmailThreadId: 'a' }),
      makeThread({ gmailThreadId: 'b' }),
      makeThread({ accountId: 'acct-2', gmailThreadId: 'c' }),
    ])
    expect((await store.listThreadKeys('acct-1')).sort()).toEqual(['acct-1/a', 'acct-1/b'])
  })
})

describe('views', () => {
  let store: Store
  beforeEach(async () => {
    store = (await openStore()).store
    await store.upsertAccount(makeAccount())
    await store.upsertAccount(makeAccount({ id: 'acct-2', email: 'nick.galang@gmail.com', displayName: 'Work' }))
    await store.upsertThreads([
      makeThread({ accountId: 'acct-1', gmailThreadId: 'p1', lastMessageAt: 300, labelIds: ['INBOX'] }),
      makeThread({ accountId: 'acct-2', gmailThreadId: 'w1', lastMessageAt: 400, labelIds: ['INBOX', 'UNREAD'], unread: true }),
      makeThread({ accountId: 'acct-1', gmailThreadId: 'p2', lastMessageAt: 500, labelIds: ['INBOX', 'STARRED'], starred: true }),
      makeThread({ accountId: 'acct-2', gmailThreadId: 'w2', lastMessageAt: 600, labelIds: ['SENT'] }),
      makeThread({ accountId: 'acct-1', gmailThreadId: 'p3', lastMessageAt: 700, labelIds: ['TRASH'] }),
      makeThread({ accountId: 'acct-2', gmailThreadId: 'w3', lastMessageAt: 800, labelIds: ['INBOX', 'Label_9'] }),
    ])
  })

  it('unifies the inbox across accounts, newest first', async () => {
    const threads = await store.listThreads({ kind: 'unified', folder: 'inbox' })
    expect(threads.map((t) => t.key)).toEqual(['acct-2/w3', 'acct-1/p2', 'acct-2/w1', 'acct-1/p1'])
  })

  it('keeps trashed threads out of every folder but trash', async () => {
    expect((await store.listThreads({ kind: 'unified', folder: 'trash' })).map((t) => t.key)).toEqual(['acct-1/p3'])
    const inboxKeys = (await store.listThreads({ kind: 'unified', folder: 'inbox' })).map((t) => t.key)
    expect(inboxKeys).not.toContain('acct-1/p3')
  })

  it('serves the starred and sent folders', async () => {
    expect((await store.listThreads({ kind: 'unified', folder: 'starred' })).map((t) => t.key)).toEqual(['acct-1/p2'])
    expect((await store.listThreads({ kind: 'unified', folder: 'sent' })).map((t) => t.key)).toEqual(['acct-2/w2'])
  })

  it('scopes an account view to one label on one account', async () => {
    expect((await store.listThreads({ kind: 'account', accountId: 'acct-2', labelId: 'INBOX' })).map((t) => t.key)).toEqual([
      'acct-2/w3',
      'acct-2/w1',
    ])
    expect((await store.listThreads({ kind: 'account', accountId: 'acct-2', labelId: 'Label_9' })).map((t) => t.key)).toEqual([
      'acct-2/w3',
    ])
  })

  it('honours the limit and the before cursor', async () => {
    const page1 = await store.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 2 })
    expect(page1.map((t) => t.key)).toEqual(['acct-2/w3', 'acct-1/p2'])
    const page2 = await store.listThreads(
      { kind: 'unified', folder: 'inbox' },
      { limit: 2, before: page1[1].lastMessageAt },
    )
    expect(page2.map((t) => t.key)).toEqual(['acct-2/w1', 'acct-1/p1'])
  })

  it('counts unread threads in a view', async () => {
    expect(await store.countUnread({ kind: 'unified', folder: 'inbox' })).toBe(1)
    expect(await store.countUnread({ kind: 'account', accountId: 'acct-1', labelId: 'INBOX' })).toBe(0)
  })
})

describe('messages', () => {
  it('round-trips a full message ordered oldest first', async () => {
    const { store } = await openStore()
    const withBody = makeMessage({
      id: 'm-2',
      date: 1_755_000_100_000,
      bodyHtml: '<p>hi</p>',
      bodyText: 'hi',
      bodyState: 'full',
      attachments: [
        { id: 'att-1', messageId: 'm-2', filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 12, inline: false },
      ],
      rfcMessageId: '<x@y>',
      references: '<a@b>',
      inReplyTo: '<a@b>',
      unread: true,
      labelIds: ['INBOX', 'UNREAD'],
    })
    await store.upsertMessages([withBody, makeMessage()])
    const messages = await store.listMessages('acct-1/t-1')
    expect(messages.map((m) => m.id)).toEqual(['m-1', 'm-2'])
    expect(messages[1]).toEqual(withBody)
  })

  it('upgrades a metadata message to full on re-upsert', async () => {
    const { store } = await openStore()
    await store.upsertMessages([makeMessage()])
    await store.upsertMessages([makeMessage({ bodyHtml: '<p>full</p>', bodyState: 'full' })])
    const messages = await store.listMessages('acct-1/t-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].bodyState).toBe('full')
  })

  it('moves flags without touching the body, and hands back what was there', async () => {
    const { store } = await openStore()
    await store.upsertMessages([
      makeMessage({ id: 'm-1', bodyHtml: '<p>keep me</p>', bodyState: 'full', labelIds: ['INBOX'], unread: false }),
      makeMessage({ id: 'm-2', date: 1_755_000_100_000, labelIds: ['INBOX', 'UNREAD'], unread: true }),
    ])

    const before = await store.setMessageFlags('acct-1/t-1', { add: ['UNREAD'], remove: [] })
    expect(before.map((f) => f.unread)).toEqual([false, true])

    const after = await store.listMessages('acct-1/t-1')
    expect(after.map((m) => m.unread)).toEqual([true, true])
    // The columns an action never names must survive it untouched.
    expect(after[0].bodyHtml).toBe('<p>keep me</p>')
    expect(after[0].bodyState).toBe('full')
  })

  it('restores the exact prior flags rather than inverting the delta', async () => {
    const { store } = await openStore()
    await store.upsertMessages([
      makeMessage({ id: 'm-1', labelIds: ['INBOX'], unread: false }),
      makeMessage({ id: 'm-2', date: 1_755_000_100_000, labelIds: ['INBOX', 'UNREAD'], unread: true }),
    ])

    const before = await store.setMessageFlags('acct-1/t-1', { add: [], remove: ['UNREAD'] })
    await store.restoreMessageFlags(before)

    const back = await store.listMessages('acct-1/t-1')
    expect(back.map((m) => m.unread)).toEqual([false, true])
    expect(back[0].labelIds).toEqual(['INBOX'])
    expect(back[1].labelIds.sort()).toEqual(['INBOX', 'UNREAD'])
  })

  it('lists the thread keys whose bodies are still metadata-only', async () => {
    const { store } = await openStore()
    await store.upsertThreads([makeThread({ gmailThreadId: 'a', lastMessageAt: 100 }), makeThread({ gmailThreadId: 'b', lastMessageAt: 200 })])
    await store.upsertMessages([
      makeMessage({ id: 'm-a', threadId: 'a' }),
      makeMessage({ id: 'm-b', threadId: 'b', bodyState: 'full', bodyText: 'done' }),
    ])
    expect(await store.threadsNeedingBodies(10)).toEqual(['acct-1/a'])
  })
})

describe('labels', () => {
  it('replaces the label set for one account without touching another', async () => {
    const { store } = await openStore()
    await store.replaceLabels('acct-1', [makeLabel(), makeLabel({ id: 'Label_9', name: 'Receipts', type: 'user' })])
    await store.replaceLabels('acct-2', [makeLabel({ accountId: 'acct-2' })])
    await store.replaceLabels('acct-1', [makeLabel()])

    expect((await store.listLabels('acct-1')).map((l) => l.id)).toEqual(['INBOX'])
    expect((await store.listLabels('acct-2')).map((l) => l.id)).toEqual(['INBOX'])
  })
})

describe('sync state', () => {
  it('round-trips the history cursor', async () => {
    const { store } = await openStore()
    expect(await store.getSyncState('acct-1')).toBeNull()
    await store.setSyncState({ accountId: 'acct-1', historyId: '5150', lastFullSync: 99 })
    expect(await store.getSyncState('acct-1')).toEqual({ accountId: 'acct-1', historyId: '5150', lastFullSync: 99 })
    await store.setSyncState({ accountId: 'acct-1', historyId: '5200', lastFullSync: 100 })
    expect((await store.getSyncState('acct-1'))?.historyId).toBe('5200')
  })
})

describe('settings', () => {
  it('returns defaults before anything is written', async () => {
    const { store } = await openStore()
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('merges a patch over the stored row', async () => {
    const { store } = await openStore()
    await store.setSettings({ theme: 'dark' })
    await store.setSettings({ googleClientId: 'cid' })
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', googleClientId: 'cid' })
  })

  it('keeps exactly one settings row', async () => {
    const { store, db } = await openStore()
    await store.setSettings({ theme: 'light' })
    await store.setSettings({ pollIntervalSec: 30 })
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 1 })
  })
})

// A single deleted reply used to hide a whole conversation from every view:
// mapGmailThread unioned TRASH across the thread's messages, and every
// non-trash view excludes TRASH. Fixing the mapping only helps a thread the
// next sync happens to touch, and a thread nobody replies to is never touched
// again — so migration 4 repairs what is already stored, from the messages
// already stored, offline. Found on the owner's mailbox 2026-08-31: 58 threads.
describe('migration 4 — the trash union repair', () => {
  it('frees a thread whose older reply was trashed, and leaves a fully trashed one alone', async () => {
    const platform = new NodePlatform()
    const db = (await platform.sqlOpen()) as NodeSqlDb
    // Migration 4 runs inside Store.open, so the rows have to predate it. Write
    // them with the raw driver against the schema the earlier migrations built,
    // then open the Store to trigger the repair.
    await Store.open(platform)
    const write = (sql: string) => db.raw.prepare(sql).run()

    // t-mixed: an old trashed reply plus a live inbox message. The bug.
    write(`INSERT INTO threads (key, account_id, gmail_thread_id, label_ids)
           VALUES ('a/t-mixed','a','t-mixed','["INBOX","TRASH","IMPORTANT"]')`)
    write(`INSERT INTO thread_labels (thread_key, account_id, label_id) VALUES
           ('a/t-mixed','a','INBOX'), ('a/t-mixed','a','TRASH'), ('a/t-mixed','a','IMPORTANT')`)
    write(`INSERT INTO messages (id, thread_key, thread_id, account_id, label_ids)
           VALUES ('m1','a/t-mixed','t-mixed','a','["TRASH"]')`)
    write(`INSERT INTO messages (id, thread_key, thread_id, account_id, label_ids)
           VALUES ('m2','a/t-mixed','t-mixed','a','["INBOX","IMPORTANT"]')`)

    // t-gone: genuinely deleted. Every message is trashed, so it must STAY in
    // the trash — the repair must not resurrect real deletions.
    write(`INSERT INTO threads (key, account_id, gmail_thread_id, label_ids)
           VALUES ('a/t-gone','a','t-gone','["TRASH"]')`)
    write(`INSERT INTO thread_labels (thread_key, account_id, label_id)
           VALUES ('a/t-gone','a','TRASH')`)
    write(`INSERT INTO messages (id, thread_key, thread_id, account_id, label_ids)
           VALUES ('m3','a/t-gone','t-gone','a','["TRASH"]')`)

    // t-bare: no stored messages. The repair must not invent an answer.
    write(`INSERT INTO threads (key, account_id, gmail_thread_id, label_ids)
           VALUES ('a/t-bare','a','t-bare','["TRASH"]')`)
    write(`INSERT INTO thread_labels (thread_key, account_id, label_id)
           VALUES ('a/t-bare','a','TRASH')`)

    // Re-run the repair by hand: Store.open already stamped user_version, so a
    // second open is a no-op. This is the migration's own SQL.
    db.raw.exec(MIGRATIONS[3])

    const labels = (key: string) =>
      (db.raw.prepare('SELECT label_ids FROM threads WHERE key = ?').get(key) as { label_ids: string })
        .label_ids
    const joined = (key: string) =>
      (db.raw.prepare('SELECT label_id FROM thread_labels WHERE thread_key = ?').all(key) as {
        label_id: string
      }[]).map((r) => r.label_id)

    expect(labels('a/t-mixed'), 'the union artefact comes off').not.toContain('TRASH')
    expect(labels('a/t-mixed')).toContain('INBOX')
    expect(joined('a/t-mixed')).not.toContain('TRASH')
    expect(joined('a/t-mixed')).toContain('INBOX')

    expect(labels('a/t-gone'), 'a real deletion stays deleted').toContain('TRASH')
    expect(joined('a/t-gone')).toContain('TRASH')

    expect(labels('a/t-bare'), 'no messages means no opinion').toContain('TRASH')
  })
})

// Remote images now load by default (owner, 2026-08-31). Flipping
// DEFAULT_SETTINGS alone reaches nobody who has ever saved a setting:
// setSettings writes the WHOLE merged object, so an existing row literally
// stores "imagePolicy":"block", and getSettings spreads that row OVER the
// defaults. Migration 5 clears the key so the default applies again.
describe('migration 5 — the image-policy default flip', () => {
  const settingsRow = (db: NodeSqlDb) =>
    (db.raw.prepare('SELECT json FROM settings WHERE id = 1').get() as { json: string } | undefined)
      ?.json

  it('clears a stored block, leaves a stored block chosen later alone, and keeps siblings', async () => {
    const platform = new NodePlatform()
    const db = (await platform.sqlOpen()) as NodeSqlDb
    await Store.open(platform)

    // A row as an existing install carries it: the dead 'block' plus real
    // settings a person did choose.
    db.raw
      .prepare('INSERT OR REPLACE INTO settings (id, json) VALUES (1, ?)')
      .run(
        JSON.stringify({
          theme: 'light',
          imagePolicy: 'block',
          sounds: true,
          googleClientId: 'cid-123',
        }),
      )

    db.raw.exec(MIGRATIONS[4])

    const after = JSON.parse(settingsRow(db) as string) as Record<string, unknown>
    expect(after, 'the key is REMOVED, not overwritten — defaults.ts stays the only copy').not.toHaveProperty(
      'imagePolicy',
    )
    // Everything the person actually chose survives byte-intact.
    expect(after.theme).toBe('light')
    expect(after.sounds).toBe(true)
    expect(after.googleClientId).toBe('cid-123')

    // And with the key gone, the store reports the default.
    const store = await Store.open(platform)
    expect((await store.getSettings()).imagePolicy).toBe(DEFAULT_SETTINGS.imagePolicy)
    expect(DEFAULT_SETTINGS.imagePolicy).toBe('allow')
  })

  it('does not touch a row that already reads allow', async () => {
    const platform = new NodePlatform()
    const db = (await platform.sqlOpen()) as NodeSqlDb
    await Store.open(platform)
    db.raw
      .prepare('INSERT OR REPLACE INTO settings (id, json) VALUES (1, ?)')
      .run(JSON.stringify({ theme: 'dark', imagePolicy: 'allow' }))

    db.raw.exec(MIGRATIONS[4])

    const after = JSON.parse(settingsRow(db) as string) as Record<string, unknown>
    expect(after.imagePolicy, 'an explicit allow is not a dead value to clear').toBe('allow')
    expect(after.theme).toBe('dark')
  })

  it('is a no-op on a fresh database with no settings row', async () => {
    const platform = new NodePlatform()
    const db = (await platform.sqlOpen()) as NodeSqlDb
    const store = await Store.open(platform)
    expect(settingsRow(db)).toBeUndefined()
    expect((await store.getSettings()).imagePolicy).toBe('allow')
  })
})
