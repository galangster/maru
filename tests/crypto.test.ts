import { describe, expect, it } from 'vitest'

import { CIPHERTEXT_PREFIX, Keyring, keyringFor } from '../src/core/crypto/keyring'
import { SqlAgentStore } from '../src/core/agents/store'
import type { Approval, AuditEntry } from '../src/core/agents/types'
import type { Platform, SqlDb } from '../src/core/platform'
import { migrate, Store } from '../src/core/store/db'
import { makeAccount, makeLabel, makeMessage, makeThread } from './fixtures/domain'
import { NodePlatform, NodeSqlDb } from './helpers/node-platform'

class CountingSqlDb implements SqlDb {
  encryptionWrites = 0
  track = false

  constructor(readonly inner = new NodeSqlDb()) {}

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (this.track && /\bUPDATE (threads|messages|labels|approvals|audit_log)\b/.test(sql)) {
      this.encryptionWrites += 1
    }
    await this.inner.execute(sql, params)
  }

  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.inner.select<T>(sql, params)
  }
}

class CountingPlatform extends NodePlatform {
  constructor(readonly countingDb: CountingSqlDb) {
    super()
  }

  override async sqlOpen(): Promise<SqlDb> {
    return this.countingDb
  }
}

function expectEncrypted(value: unknown): void {
  expect(value).toEqual(expect.stringMatching(/^wrenc1:/))
}

describe('account keyring', () => {
  it('round-trips, binds ciphertext to its account, passes plaintext through, and destroys keys', async () => {
    const platform = new NodePlatform()
    const keyring = new Keyring(platform)
    const ciphertext = await keyring.encrypt('acct-1', 'private mail')

    expect(ciphertext.startsWith(CIPHERTEXT_PREFIX)).toBe(true)
    expect(await keyring.decrypt('acct-1', ciphertext)).toBe('private mail')
    expect(await keyring.decrypt('acct-2', ciphertext)).toBeNull()
    expect(await keyring.decrypt('acct-1', 'legacy plaintext')).toBe('legacy plaintext')

    await keyring.destroy('acct-1')
    expect(await keyring.decrypt('acct-1', ciphertext)).toBeNull()
  })

  it('shares one keyring per Platform instance', () => {
    const platform = new NodePlatform()
    expect(keyringFor(platform)).toBe(keyringFor(platform))
    expect(keyringFor(new NodePlatform())).not.toBe(keyringFor(platform))
  })
})

describe('encrypted mail store', () => {
  it('encrypts content columns at rest and restores values with label ordering', async () => {
    const platform = new NodePlatform()
    const db = (await platform.sqlOpen()) as NodeSqlDb
    const store = await Store.open(platform)
    const thread = makeThread()
    const message = makeMessage({
      bodyHtml: '<p>Private</p>',
      bodyText: 'Private',
      bodyState: 'full',
      attachments: [
        {
          id: 'att-1',
          messageId: 'm-1',
          filename: 'private.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 42,
          inline: false,
        },
      ],
      rfcMessageId: '<message@example.com>',
      references: '<parent@example.com>',
      inReplyTo: '<parent@example.com>',
    })
    const labels = [
      makeLabel({ id: 'Label_B', name: 'Beta', type: 'user' }),
      makeLabel({ id: 'STARRED', name: 'Starred', type: 'system' }),
      makeLabel({ id: 'Label_A', name: 'Alpha', type: 'user' }),
    ]

    await store.upsertThreads([thread])
    await store.upsertMessages([message])
    await store.replaceLabels('acct-1', labels)

    const [rawThread] = await db.select<Record<string, unknown>>('SELECT * FROM threads')
    for (const column of ['subject', 'snippet', 'participants']) {
      expectEncrypted(rawThread[column])
    }
    expect(rawThread.key).toBe(thread.key)
    expect(rawThread.account_id).toBe(thread.accountId)
    expect(rawThread.label_ids).toBe(JSON.stringify(thread.labelIds))

    const [rawMessage] = await db.select<Record<string, unknown>>('SELECT * FROM messages')
    for (const column of [
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
    ]) {
      expectEncrypted(rawMessage[column])
    }
    expect(rawMessage.id).toBe(message.id)
    expect(rawMessage.date).toBe(message.date)
    expect(rawMessage.label_ids).toBe(JSON.stringify(message.labelIds))

    const rawLabels = await db.select<Record<string, unknown>>('SELECT * FROM labels')
    for (const row of rawLabels) {
      expectEncrypted(row.name)
      expect(row.account_id).toBe('acct-1')
      expect(typeof row.id).toBe('string')
      expect(['system', 'user']).toContain(row.type)
    }

    await store.upsertMessages([makeMessage({ id: 'm-empty', attachments: [] })])
    const [emptyAttachments] = await db.select<{ attachments: string }>(
      'SELECT attachments FROM messages WHERE id = $1',
      ['m-empty'],
    )
    expect(emptyAttachments.attachments).toBe('[]')

    expect(await store.getThread(thread.key)).toEqual(thread)
    expect(await store.listMessages(thread.key)).toContainEqual(message)
    expect((await store.listLabels('acct-1')).map((label) => label.name)).toEqual([
      'Starred',
      'Alpha',
      'Beta',
    ])
  })

  it('sweeps legacy mail and agent rows once', async () => {
    const countingDb = new CountingSqlDb()
    await migrate(countingDb)
    const plaintextStore = new Store(countingDb, null)
    await plaintextStore.upsertAccount(makeAccount())
    await plaintextStore.upsertThreads([makeThread()])
    await plaintextStore.upsertMessages([makeMessage({ bodyText: 'Legacy body' })])
    await plaintextStore.replaceLabels('acct-1', [makeLabel()])

    const legacyPayload = {
      accountId: 'acct-1',
      to: [],
      cc: [],
      bcc: [],
      subject: 'Legacy approval',
      bodyHtml: '<p>Legacy</p>',
      attachments: [],
    }
    await countingDb.execute(
      `INSERT INTO approvals
         (id, agent_id, kind, payload_json, status, created_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['approval-1', 'agent-1', 'send', JSON.stringify(legacyPayload), 'pending', 1, null],
    )
    await countingDb.execute(
      `INSERT INTO audit_log (id, agent_id, at, tool, summary, thread_key, outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['audit-1', 'agent-1', 2, 'read_thread', 'Legacy audit', 'acct-1/t-1', 'ok'],
    )

    const platform = new CountingPlatform(countingDb)
    countingDb.track = true
    const encryptedStore = await Store.open(platform)
    expect(countingDb.encryptionWrites).toBeGreaterThan(0)

    const [thread] = await countingDb.select<{ subject: string }>('SELECT subject FROM threads')
    const [approval] = await countingDb.select<{ account_id: string; payload_json: string }>(
      'SELECT account_id, payload_json FROM approvals',
    )
    const [audit] = await countingDb.select<{ account_id: string; summary: string }>(
      'SELECT account_id, summary FROM audit_log',
    )
    expectEncrypted(thread.subject)
    expect(approval.account_id).toBe('acct-1')
    expectEncrypted(approval.payload_json)
    expect(audit.account_id).toBe('acct-1')
    expectEncrypted(audit.summary)
    expect((await encryptedStore.getThread('acct-1/t-1'))?.subject).toBe('Tuesday walkthrough')
    expect((await encryptedStore.listMessages('acct-1/t-1'))[0].bodyText).toBe('Legacy body')

    countingDb.encryptionWrites = 0
    await Store.open(platform)
    expect(countingDb.encryptionWrites).toBe(0)
  })
})

describe('encrypted agent store and account removal', () => {
  it('encrypts account content and erases only the removed account', async () => {
    const platform = new NodePlatform()
    const db = (await platform.sqlOpen()) as NodeSqlDb
    const mailStore = await Store.open(platform)
    const keyring = keyringFor(platform)
    const agents = new SqlAgentStore(db, keyring)
    await mailStore.upsertAccount(makeAccount())
    await mailStore.upsertAccount(makeAccount({ id: 'acct-2', email: 'other@example.com' }))

    const auditRows: AuditEntry[] = [
      {
        id: 'audit-1',
        agentId: 'agent-1',
        at: 10,
        tool: 'read_thread',
        summary: 'Read private mail.',
        threadKey: 'acct-1/t-1',
        outcome: 'ok',
      },
      {
        id: 'audit-2',
        agentId: 'agent-1',
        at: 20,
        tool: 'read_thread',
        summary: 'Read other mail.',
        threadKey: 'acct-2/t-2',
        outcome: 'blocked',
      },
    ]
    const approvals: Approval[] = [
      {
        id: 'approval-1',
        agentId: 'agent-1',
        kind: 'send',
        payload: {
          accountId: 'acct-1',
          to: [],
          cc: [],
          bcc: [],
          subject: 'Private draft',
          bodyHtml: '<p>Private</p>',
          attachments: [],
        },
        status: 'pending',
        createdAt: 30,
      },
      {
        id: 'approval-2',
        agentId: 'agent-1',
        kind: 'send',
        payload: {
          accountId: 'acct-2',
          to: [],
          cc: [],
          bcc: [],
          subject: 'Other draft',
          bodyHtml: '<p>Other</p>',
          attachments: [],
        },
        status: 'pending',
        createdAt: 40,
      },
    ]
    await Promise.all(auditRows.map((row) => agents.appendAudit(row)))
    await Promise.all(approvals.map((row) => agents.putApproval(row)))

    const [rawAudit] = await db.select<{ account_id: string; summary: string }>(
      'SELECT account_id, summary FROM audit_log WHERE id = $1',
      ['audit-1'],
    )
    const [rawApproval] = await db.select<{ account_id: string; payload_json: string }>(
      'SELECT account_id, payload_json FROM approvals WHERE id = $1',
      ['approval-1'],
    )
    expect(rawAudit.account_id).toBe('acct-1')
    expectEncrypted(rawAudit.summary)
    expect(rawApproval.account_id).toBe('acct-1')
    expectEncrypted(rawApproval.payload_json)

    await mailStore.deleteAccount('acct-1', 99)
    expect(platform.secrets.has('wren:key:account:acct-1')).toBe(false)

    const statuses = await db.select<{ id: string; status: string; resolved_at: number | null }>(
      'SELECT id, status, resolved_at FROM approvals ORDER BY id',
    )
    expect(statuses).toEqual([
      { id: 'approval-1', status: 'expired', resolved_at: 99 },
      { id: 'approval-2', status: 'pending', resolved_at: null },
    ])
    expect(await agents.getApproval('approval-1')).toBeNull()
    expect((await agents.listApprovals()).map((approval) => approval.id)).toEqual(['approval-2'])

    const audit = await agents.listAudit({ limit: 10 })
    expect(audit[0]).toMatchObject({
      id: 'audit-2',
      at: 20,
      tool: 'read_thread',
      summary: 'Read other mail.',
      threadKey: 'acct-2/t-2',
      outcome: 'blocked',
    })
    expect(audit[1]).toEqual({
      id: 'audit-1',
      agentId: 'agent-1',
      at: 10,
      tool: 'read_thread',
      summary: 'Content erased when its account was removed.',
      threadKey: undefined,
      outcome: 'ok',
    })

    await Store.open(platform)
    expect(platform.secrets.has('wren:key:account:acct-1')).toBe(false)
  })
})
