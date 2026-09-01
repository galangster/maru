// The trust substrate. Four suites, in the order a request travels through it:
// who you are (registry), what you hold (grants), what a human still has to
// say (approvals), and what was written down (audit).
//
// Everything runs against the real SQL store over better-sqlite3, the same way
// the rest of core is tested — the in-memory store is exercised too, because
// demo mode is a shipping surface and not a stub.

import { describe, it, expect, beforeEach } from 'vitest'

import { Store, MIGRATIONS, SCHEMA_VERSION } from '../src/core/store/db'
import { NodePlatform, NodeSqlDb } from './helpers/node-platform'
import {
  AgentGateway,
  APPROVAL_TTL_MS,
  AUDIT_READ_CAP,
  AuditLog,
  CREDENTIAL_PREFIX,
  MemoryAgentStore,
  SqlAgentStore,
  domainOf,
  evaluate,
  hashCredential,
  issueCredential,
  liveGrants,
  recipientsOf,
  scopeAdmits,
  seedDemoAgents,
  DEMO_AGENT,
} from '../src/core/agents'
import type { AgentStore, Grant, GrantScope } from '../src/core/agents'
import type { ComposeDraft } from '../src/core/types'

// -- harness ------------------------------------------------------------------

async function sqlStore(): Promise<{ store: SqlAgentStore; db: NodeSqlDb }> {
  const platform = new NodePlatform()
  const db = (await platform.sqlOpen()) as NodeSqlDb
  // Store.open runs the migrations, including #2.
  await Store.open(platform)
  return { store: new SqlAgentStore(db), db }
}

/** A clock the test drives by hand, so nothing depends on wall time. */
function clock(start = 1_000_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
    set: (ms: number) => {
      t = ms
    },
  }
}

function ids(prefix = 'x') {
  let n = 0
  return () => `${prefix}-${(n += 1)}`
}

/** Records what was sent, and can be told to fail. */
class FakeMail {
  readonly sent: ComposeDraft[] = []
  failWith: Error | null = null
  send = async (draft: ComposeDraft): Promise<void> => {
    if (this.failWith) throw this.failWith
    this.sent.push(draft)
  }
}

function makeDraft(overrides: Partial<ComposeDraft> = {}): ComposeDraft {
  return {
    accountId: 'acc-1',
    to: [{ email: 'maya@fernwood.dev' }],
    cc: [],
    bcc: [],
    subject: 'Re: the deploy window',
    bodyHtml: '<p>Thursday works.</p>',
    attachments: [],
    ...overrides,
  }
}

function grant(over: Partial<Grant> = {}): Grant {
  return {
    agentId: 'a1',
    capability: 'send',
    scope: { kind: 'all' },
    grantedAt: 0,
    ...over,
  }
}

async function gatewayOn(
  store: AgentStore,
  mail: FakeMail,
  time = clock(),
): Promise<{ gateway: AgentGateway; time: ReturnType<typeof clock>; mail: FakeMail }> {
  const gateway = new AgentGateway({ store, mail, now: time.now, id: ids('g') })
  return { gateway, time, mail }
}

// -- migration ----------------------------------------------------------------

describe('migration 2', () => {
  it('appends rather than editing migration 1', () => {
    // Bump both when you add one. The point of the assertion is the two lines
    // below it: migration 1 must never be edited, because an existing install
    // has already run it and will never run it again.
    expect(MIGRATIONS).toHaveLength(4)
    expect(SCHEMA_VERSION).toBe(4)
    expect(MIGRATIONS[0]).toContain('CREATE TABLE IF NOT EXISTS accounts')
    expect(MIGRATIONS[0]).not.toContain('agents')
  })

  it('creates the four agent tables', async () => {
    const { db } = await sqlStore()
    const names = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of ['agents', 'grants', 'approvals', 'audit_log']) expect(names).toContain(t)
    // Migration 1's tables must still be there after the append.
    for (const t of ['accounts', 'threads', 'messages', 'settings']) expect(names).toContain(t)
  })

  it('refuses two agents sharing a credential digest', async () => {
    const { store } = await sqlStore()
    await store.putAgent({ id: 'a1', name: 'Scout', credentialHash: 'deadbeef', createdAt: 1 })
    await expect(
      store.putAgent({ id: 'a2', name: 'Rook', credentialHash: 'deadbeef', createdAt: 2 }),
    ).rejects.toThrow()
  })
})

// -- registry -----------------------------------------------------------------

describe('registry: credentials', () => {
  it('issues a prefixed, high-entropy token that differs every time', () => {
    const a = issueCredential()
    const b = issueCredential()
    expect(a.startsWith(CREDENTIAL_PREFIX)).toBe(true)
    expect(a).not.toBe(b)
    // 32 bytes base64url ⇒ 43 characters, no padding.
    expect(a.slice(CREDENTIAL_PREFIX.length)).toHaveLength(43)
    expect(a).not.toMatch(/[+/=]/)
  })

  it('hashes to a stable 64-character digest, ignoring surrounding space', async () => {
    const digest = await hashCredential('wren_agent_abc')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashCredential('  wren_agent_abc  ')).toBe(digest)
    expect(await hashCredential('wren_agent_abd')).not.toBe(digest)
  })

  it('stores only the digest — the token is never written', async () => {
    const { store, db } = await sqlStore()
    const { gateway } = await gatewayOn(store, new FakeMail())
    const { agent, credential } = await gateway.createAgent('Scout')

    const rows = db.raw.prepare('SELECT * FROM agents').all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0].credential_hash).toBe(await hashCredential(credential))
    expect(JSON.stringify(rows[0])).not.toContain(credential)
    // The public Agent must not carry the digest into a UI or an event.
    expect(Object.keys(agent)).toEqual(['id', 'name', 'createdAt', 'revokedAt'])
  })

  it('verifies a credential back to its agent', async () => {
    const { store } = await sqlStore()
    const { gateway } = await gatewayOn(store, new FakeMail())
    const { agent, credential } = await gateway.createAgent('Scout')
    const found = await gateway.registry.verifyCredential(credential)
    expect(found?.id).toBe(agent.id)
    // Whitespace from a copy-paste must not lock the agent out.
    expect((await gateway.registry.verifyCredential(` ${credential}\n`))?.id).toBe(agent.id)
  })

  it('returns null for an unknown, empty or revoked credential', async () => {
    const { store } = await sqlStore()
    const { gateway } = await gatewayOn(store, new FakeMail())
    const { agent, credential } = await gateway.createAgent('Scout')

    expect(await gateway.registry.verifyCredential('')).toBeNull()
    expect(await gateway.registry.verifyCredential('wren_agent_nope')).toBeNull()

    await gateway.revokeAgent(agent.id)
    expect(await gateway.registry.verifyCredential(credential)).toBeNull()
  })

  it('starts an agent with no capabilities at all', async () => {
    const { store } = await sqlStore()
    const { gateway } = await gatewayOn(store, new FakeMail())
    const { agent } = await gateway.createAgent('Scout')
    for (const capability of ['read', 'draft', 'archiveLabel', 'send'] as const) {
      const { decision } = await gateway.authorize(agent.id, capability, {
        recipients: ['maya@fernwood.dev'],
      })
      expect(decision.allowed).toBe(false)
    }
  })

  it('keeps the first revocation timestamp when revoked twice', async () => {
    const { store } = await sqlStore()
    const time = clock()
    const { gateway } = await gatewayOn(store, new FakeMail(), time)
    const { agent } = await gateway.createAgent('Scout')

    await gateway.revokeAgent(agent.id)
    const first = (await gateway.registry.get(agent.id))?.revokedAt
    time.advance(60_000)
    await gateway.revokeAgent(agent.id)
    expect((await gateway.registry.get(agent.id))?.revokedAt).toBe(first)
  })
})

// -- grants: the rule set -----------------------------------------------------

describe('grants: evaluate', () => {
  const now = 1000

  it('rule 1 — a capability grants only itself; read implies nothing else', () => {
    const grants = [grant({ capability: 'read' })]
    expect(evaluate(grants, 'read', { now }).allowed).toBe(true)
    for (const other of ['draft', 'archiveLabel', 'send'] as const) {
      const decision = evaluate(grants, other, { now, recipients: ['a@b.com'] })
      expect(decision.allowed).toBe(false)
      expect(decision.allowed === false && decision.reason).toBe('no-grant')
    }
  })

  it('rule 1 — a missing grant denies with no-grant, not with a throw', () => {
    const decision = evaluate([], 'archiveLabel', { now })
    expect(decision).toEqual({ allowed: false, reason: 'no-grant' })
  })

  it('rule 2 — a revoked agent is denied even where the grant is live', () => {
    const grants = [grant({ capability: 'read' })]
    const agent = { id: 'a1', name: 'Scout', createdAt: 0, revokedAt: 500 }
    expect(evaluate(grants, 'read', { now, agent })).toEqual({
      allowed: false,
      reason: 'agent-revoked',
    })
    // ...and is allowed again right up to the instant of revocation.
    expect(evaluate(grants, 'read', { now: 400, agent }).allowed).toBe(true)
  })

  it('rule 3 — a revoked grant is not a grant, and says it was revoked', () => {
    const grants = [grant({ capability: 'draft', grantedAt: 0, revokedAt: 500 })]
    expect(evaluate(grants, 'draft', { now })).toEqual({ allowed: false, reason: 'revoked' })
  })

  it('rule 4 — revocation wins over an older duplicate grant', () => {
    const grants = [
      grant({ capability: 'send', grantedAt: 100, revokedAt: 200 }),
      // An older, broader row the revoke never stamped. It must not survive.
      grant({ capability: 'send', grantedAt: 50 }),
    ]
    const decision = evaluate(grants, 'send', { now: 300, recipients: ['a@b.com'] })
    expect(decision).toEqual({ allowed: false, reason: 'revoked' })
  })

  it('rule 4 — a grant re-issued after the revocation restores the capability', () => {
    const grants = [
      grant({ capability: 'send', grantedAt: 100, revokedAt: 200 }),
      grant({ capability: 'send', grantedAt: 250 }),
    ]
    expect(evaluate(grants, 'send', { now: 300, recipients: ['a@b.com'] }).allowed).toBe(true)
  })

  it('rule 5 — a grant dated in the future is not yet a grant', () => {
    const grants = [grant({ capability: 'read', grantedAt: 5000 })]
    expect(evaluate(grants, 'read', { now: 1000 }).allowed).toBe(false)
    expect(evaluate(grants, 'read', { now: 5000 }).allowed).toBe(true)
  })

  it('rule 6 — non-send capabilities ignore recipients entirely', () => {
    const grants = [grant({ capability: 'archiveLabel', scope: { kind: 'recipients', emails: [] } })]
    expect(evaluate(grants, 'archiveLabel', { now, recipients: ['stranger@x.io'] }).allowed).toBe(
      true,
    )
    expect(evaluate(grants, 'archiveLabel', { now }).allowed).toBe(true)
  })

  it('rule 7 — a send with no recipients is denied', () => {
    const grants = [grant({ scope: { kind: 'all' } })]
    expect(evaluate(grants, 'send', { now })).toEqual({ allowed: false, reason: 'no-recipients' })
    expect(evaluate(grants, 'send', { now, recipients: [] })).toEqual({
      allowed: false,
      reason: 'no-recipients',
    })
    // A blank string is not a recipient.
    expect(evaluate(grants, 'send', { now, recipients: ['  '] }).allowed).toBe(false)
  })

  it('rule 8 — scope all admits anyone', () => {
    const grants = [grant({ scope: { kind: 'all' } })]
    expect(evaluate(grants, 'send', { now, recipients: ['anyone@anywhere.example'] }).allowed).toBe(
      true,
    )
  })

  it('rule 8 — domain scope matches the recipient domain, case-folded', () => {
    const scope: GrantScope = { kind: 'domains', domains: ['Fernwood.dev', '@northshoreapp.io'] }
    const grants = [grant({ scope })]
    for (const address of [
      'maya@fernwood.dev',
      'MAYA@FERNWOOD.DEV',
      ' dev.raman@Fernwood.dev ',
      'tom.okafor@northshoreapp.io',
    ]) {
      expect(evaluate(grants, 'send', { now, recipients: [address] }).allowed).toBe(true)
    }
  })

  it('rule 8 — domain scope is exact, never a suffix', () => {
    const grants = [grant({ scope: { kind: 'domains', domains: ['example.com'] } })]
    for (const address of [
      'a@evil-example.com',
      'a@notexample.com',
      'a@example.com.evil.io',
      'a@sub.example.com',
    ]) {
      const decision = evaluate(grants, 'send', { now, recipients: [address] })
      expect(decision.allowed).toBe(false)
      expect(decision.allowed === false && decision.reason).toBe('out-of-scope')
    }
  })

  it('rule 8 — recipient scope matches whole addresses only', () => {
    const grants = [grant({ scope: { kind: 'recipients', emails: ['Maya@Fernwood.dev'] } })]
    expect(evaluate(grants, 'send', { now, recipients: ['maya@fernwood.dev'] }).allowed).toBe(true)
    expect(evaluate(grants, 'send', { now, recipients: ['dev@fernwood.dev'] }).allowed).toBe(false)
  })

  it('rule 9 — one out-of-scope recipient denies the whole send, and is named', () => {
    const grants = [grant({ scope: { kind: 'domains', domains: ['fernwood.dev'] } })]
    const decision = evaluate(grants, 'send', {
      now,
      recipients: ['maya@fernwood.dev', 'stranger@elsewhere.io'],
    })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.reason).toBe('out-of-scope')
    expect(decision.allowed === false && decision.blocked).toEqual(['stranger@elsewhere.io'])
  })

  it('rule 9 — two narrow grants are not added together into one wide one', () => {
    const grants = [
      grant({ capability: 'send', grantedAt: 10, scope: { kind: 'domains', domains: ['a.com'] } }),
      grant({ capability: 'send', grantedAt: 20, scope: { kind: 'domains', domains: ['b.com'] } }),
    ]
    // Either alone is fine.
    expect(evaluate(grants, 'send', { now, recipients: ['x@a.com'] }).allowed).toBe(true)
    expect(evaluate(grants, 'send', { now, recipients: ['y@b.com'] }).allowed).toBe(true)
    // Both on one message is a union nobody agreed to.
    expect(evaluate(grants, 'send', { now, recipients: ['x@a.com', 'y@b.com'] }).allowed).toBe(false)
  })

  it('checks cc and bcc, not just to', () => {
    const draft = makeDraft({
      to: [{ email: 'maya@fernwood.dev' }],
      cc: [{ email: 'dev@fernwood.dev' }],
      bcc: [{ email: 'leak@elsewhere.io' }],
    })
    expect(recipientsOf(draft)).toEqual([
      'maya@fernwood.dev',
      'dev@fernwood.dev',
      'leak@elsewhere.io',
    ])
    const grants = [grant({ scope: { kind: 'domains', domains: ['fernwood.dev'] } })]
    expect(evaluate(grants, 'send', { now, recipients: recipientsOf(draft) }).allowed).toBe(false)
  })

  it('exposes the same live-grant filter the UI summary reads', () => {
    const grants = [
      grant({ capability: 'send', grantedAt: 100, revokedAt: 200 }),
      grant({ capability: 'send', grantedAt: 250 }),
      grant({ capability: 'read', grantedAt: 10 }),
    ]
    expect(liveGrants(grants, 'send', 300)).toHaveLength(1)
    expect(liveGrants(grants, 'send', 300)[0].grantedAt).toBe(250)
    expect(liveGrants(grants, 'read', 300)).toHaveLength(1)
    expect(liveGrants(grants, 'draft', 300)).toHaveLength(0)
  })

  it('parses domains defensively', () => {
    expect(domainOf('Maya@Fernwood.DEV')).toBe('fernwood.dev')
    expect(domainOf('not-an-address')).toBe('')
    expect(scopeAdmits({ kind: 'all' }, '')).toBe(false)
  })
})

describe('grants: the book', () => {
  it('replaces rather than stacks, so one revoke reaches the whole grant', async () => {
    const { store } = await sqlStore()
    const time = clock()
    const { gateway } = await gatewayOn(store, new FakeMail(), time)
    const { agent } = await gateway.createAgent('Scout')

    await gateway.grant(agent.id, 'send', { kind: 'domains', domains: ['a.com'] })
    time.advance(1000)
    await gateway.grant(agent.id, 'send', { kind: 'domains', domains: ['a.com', 'b.com'] })
    time.advance(1000)

    expect((await gateway.grants.held(agent.id))).toHaveLength(1)
    expect(
      (await gateway.authorize(agent.id, 'send', { recipients: ['y@b.com'] })).decision.allowed,
    ).toBe(true)

    await gateway.revokeGrant(agent.id, 'send')
    time.advance(1000)
    // The widened grant AND the row it replaced are both gone.
    for (const address of ['x@a.com', 'y@b.com']) {
      expect(
        (await gateway.authorize(agent.id, 'send', { recipients: [address] })).decision.allowed,
      ).toBe(false)
    }
  })

  it('grants are usable in the same instant they are issued', async () => {
    const { store } = await sqlStore()
    // A clock that never moves is the harshest version of this: the grant, the
    // revoke it replaces, and the check all land on one millisecond.
    const { gateway } = await gatewayOn(store, new FakeMail(), clock(500))
    const { agent } = await gateway.createAgent('Scout')
    await gateway.grant(agent.id, 'read')
    expect((await gateway.authorize(agent.id, 'read')).decision.allowed).toBe(true)
  })

  it('denies an agent id that does not exist', async () => {
    const { store } = await sqlStore()
    const { gateway } = await gatewayOn(store, new FakeMail())
    const { decision, agent } = await gateway.authorize('nobody', 'read')
    expect(decision.allowed).toBe(false)
    expect(agent).toBeNull()
  })

  it('writes a blocked audit row for every denial', async () => {
    const { store } = await sqlStore()
    const { gateway } = await gatewayOn(store, new FakeMail())
    const { agent } = await gateway.createAgent('Scout')
    await gateway.grant(agent.id, 'send', { kind: 'domains', domains: ['fernwood.dev'] })

    await gateway.authorize(agent.id, 'send', { recipients: ['stranger@elsewhere.io'] })
    const rows = await gateway.audit.query({ agentId: agent.id })
    const blocked = rows.filter((r) => r.outcome === 'blocked')
    expect(blocked).toHaveLength(1)
    expect(blocked[0].summary).toContain('stranger@elsewhere.io')
  })
})

// -- approvals ----------------------------------------------------------------

describe('approvals: lifecycle', () => {
  let store: SqlAgentStore
  let mail: FakeMail
  let time: ReturnType<typeof clock>
  let gateway: AgentGateway
  let agentId: string

  beforeEach(async () => {
    ;({ store } = await sqlStore())
    mail = new FakeMail()
    time = clock()
    gateway = new AgentGateway({ store, mail, now: time.now, id: ids('g') })
    const created = await gateway.createAgent('Scout')
    agentId = created.agent.id
    await gateway.grant(agentId, 'send', { kind: 'domains', domains: ['fernwood.dev'] })
  })

  it('submits a pending approval and sends nothing yet', async () => {
    const result = await gateway.requestSend(agentId, makeDraft())
    expect('approval' in result).toBe(true)
    expect(mail.sent).toHaveLength(0)
    expect(await gateway.approvals.pendingCount()).toBe(1)
  })

  it('never reaches the queue when the grant refuses', async () => {
    const result = await gateway.requestSend(
      agentId,
      makeDraft({ to: [{ email: 'stranger@elsewhere.io' }] }),
    )
    expect('denied' in result).toBe(true)
    expect(await gateway.approvals.pendingCount()).toBe(0)
    expect(mail.sent).toHaveLength(0)
  })

  it('approving dispatches the send, resolves, and audits', async () => {
    const submitted = await gateway.requestSend(agentId, makeDraft())
    if (!('approval' in submitted)) throw new Error('expected an approval')
    time.advance(5 * 60_000)

    const resolved = await gateway.approvals.approve(submitted.approval.id)
    expect(resolved.status).toBe('approved')
    expect(resolved.resolvedAt).toBe(time.now())
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].subject).toBe('Re: the deploy window')
    expect(await gateway.approvals.pendingCount()).toBe(0)

    const summaries = (await gateway.audit.query({ agentId })).map((r) => r.summary)
    expect(summaries.some((s) => s.startsWith('You approved'))).toBe(true)
  })

  it('denying resolves without sending', async () => {
    const submitted = await gateway.requestSend(agentId, makeDraft())
    if (!('approval' in submitted)) throw new Error('expected an approval')
    const resolved = await gateway.approvals.deny(submitted.approval.id)
    expect(resolved.status).toBe('denied')
    expect(mail.sent).toHaveLength(0)
    const denied = (await gateway.audit.query({ agentId })).filter((r) => r.outcome === 'denied')
    expect(denied).toHaveLength(1)
  })

  it('leaves the approval pending when the send itself fails', async () => {
    const submitted = await gateway.requestSend(agentId, makeDraft())
    if (!('approval' in submitted)) throw new Error('expected an approval')
    mail.failWith = new Error('network is down')

    await expect(gateway.approvals.approve(submitted.approval.id)).rejects.toThrow('network is down')
    // Nothing may be marked approved that did not actually go out.
    expect(await gateway.approvals.pendingCount()).toBe(1)
    const errors = (await gateway.audit.query({ agentId })).filter((r) => r.outcome === 'error')
    expect(errors).toHaveLength(1)
  })

  it('refuses to resolve the same approval twice', async () => {
    const submitted = await gateway.requestSend(agentId, makeDraft())
    if (!('approval' in submitted)) throw new Error('expected an approval')
    await gateway.approvals.approve(submitted.approval.id)
    await expect(gateway.approvals.approve(submitted.approval.id)).rejects.toThrow('already')
    await expect(gateway.approvals.deny(submitted.approval.id)).rejects.toThrow('already')
    expect(mail.sent).toHaveLength(1)
  })

  it('throws on an unknown approval id', async () => {
    await expect(gateway.approvals.approve('nope')).rejects.toThrow('No such approval')
  })

  it('expires a request left unanswered for 24 hours, lazily', async () => {
    const submitted = await gateway.requestSend(agentId, makeDraft())
    if (!('approval' in submitted)) throw new Error('expected an approval')

    // One millisecond short: still actionable.
    time.advance(APPROVAL_TTL_MS - 1)
    expect(await gateway.approvals.pendingCount()).toBe(1)

    time.advance(1)
    expect(await gateway.approvals.pendingCount()).toBe(0)
    const stored = await store.getApproval(submitted.approval.id)
    expect(stored?.status).toBe('expired')
    const expired = (await gateway.audit.query({ agentId })).filter((r) => r.outcome === 'expired')
    expect(expired).toHaveLength(1)
  })

  it('refuses to approve an expired request', async () => {
    const submitted = await gateway.requestSend(agentId, makeDraft())
    if (!('approval' in submitted)) throw new Error('expected an approval')
    time.advance(APPROVAL_TTL_MS + 1)
    await expect(gateway.approvals.approve(submitted.approval.id)).rejects.toThrow('expired')
    expect(mail.sent).toHaveLength(0)
  })

  it('expires each request only once, however often the queue is read', async () => {
    await gateway.requestSend(agentId, makeDraft())
    time.advance(APPROVAL_TTL_MS + 1)
    for (let i = 0; i < 4; i++) await gateway.approvals.listPending()
    const expired = (await gateway.audit.query({ agentId })).filter((r) => r.outcome === 'expired')
    expect(expired).toHaveLength(1)
  })

  it('emits a pending event carrying the agent name, then a count', async () => {
    const events: string[] = []
    let announced = -1
    gateway.onEvent((event) => {
      events.push(event.type)
      if (event.type === 'approvalPending') expect(event.agentName).toBe('Scout')
      if (event.type === 'approvalsChanged') announced = event.pending
    })
    await gateway.requestSend(agentId, makeDraft())
    expect(events).toContain('approvalPending')
    expect(announced).toBe(1)
  })
})

// -- audit --------------------------------------------------------------------

describe('audit log', () => {
  it('reads newest first', async () => {
    const { store } = await sqlStore()
    const time = clock()
    const log = new AuditLog({ store, now: time.now, id: ids('a') })
    for (const summary of ['first', 'second', 'third']) {
      await log.append({ agentId: 'a1', tool: 'read_thread', summary, outcome: 'ok' })
      time.advance(1000)
    }
    expect((await log.query()).map((r) => r.summary)).toEqual(['third', 'second', 'first'])
  })

  it('caps a read at 500 however many rows exist and however many are asked for', async () => {
    const { store } = await sqlStore()
    const time = clock()
    const log = new AuditLog({ store, now: time.now, id: ids('a') })
    for (let i = 0; i < AUDIT_READ_CAP + 40; i++) {
      await log.append({ agentId: 'a1', tool: 'search_mail', summary: `row ${i}`, outcome: 'ok' })
      time.advance(10)
    }
    expect(await log.query()).toHaveLength(AUDIT_READ_CAP)
    expect(await log.query({ limit: 10_000 })).toHaveLength(AUDIT_READ_CAP)
    expect(await log.query({ limit: 5 })).toHaveLength(5)
    // A zero or negative limit reads as a caller bug, not as "nothing happened".
    expect(await log.query({ limit: 0 })).toHaveLength(1)
    expect(await log.query({ limit: -3 })).toHaveLength(1)
  })

  it('filters by agent', async () => {
    const { store } = await sqlStore()
    const log = new AuditLog({ store, now: () => 1, id: ids('a') })
    await log.append({ agentId: 'a1', tool: 'archive', summary: 'one', outcome: 'ok' })
    await log.append({ agentId: 'a2', tool: 'archive', summary: 'two', outcome: 'ok' })
    expect(await log.query({ agentId: 'a1' })).toHaveLength(1)
    expect(await log.query()).toHaveLength(2)
  })

  it('keeps thread keys and outcomes through a round trip', async () => {
    const { store } = await sqlStore()
    const log = new AuditLog({ store, now: () => 7, id: ids('a') })
    await log.append({
      agentId: 'a1',
      tool: 'archive',
      summary: 'Archived a promo.',
      threadKey: 'demo-personal/p-trash-promo',
      outcome: 'blocked',
    })
    const [row] = await log.query()
    expect(row).toMatchObject({
      at: 7,
      threadKey: 'demo-personal/p-trash-promo',
      outcome: 'blocked',
    })
  })

  it('never lets a store failure take down the action it was recording', async () => {
    const broken: AgentStore = {
      ...new MemoryAgentStore(),
      appendAudit: async () => {
        throw new Error('disk full')
      },
    } as unknown as AgentStore
    const log = new AuditLog({ store: broken, now: () => 1, id: ids('a') })
    await expect(
      log.append({ agentId: 'a1', tool: 'send', summary: 'went out', outcome: 'ok' }),
    ).resolves.toMatchObject({ summary: 'went out' })
  })
})

// -- demo parity --------------------------------------------------------------

describe('demo fixtures', () => {
  it('seed Scout with grants, two pending sends and a two-day trail', async () => {
    const store = new MemoryAgentStore()
    const now = 1_700_000_000_000
    await seedDemoAgents(store, now)

    const mail = new FakeMail()
    const gateway = new AgentGateway({ store, mail, now: () => now, id: ids('g') })

    const agents = await gateway.registry.list()
    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({ id: DEMO_AGENT.id, name: 'Scout' })

    expect(await gateway.grants.held(DEMO_AGENT.id, now)).toHaveLength(4)
    expect(await gateway.approvals.pendingCount()).toBe(2)

    const trail = await gateway.audit.query({ agentId: DEMO_AGENT.id })
    expect(trail.length).toBeGreaterThanOrEqual(12)
    // Newest first, and spread over more than a day.
    expect(trail[0].at).toBeGreaterThan(trail[trail.length - 1].at)
    expect(trail[0].at - trail[trail.length - 1].at).toBeGreaterThan(24 * 60 * 60 * 1000)
    expect(trail.some((r) => r.outcome === 'blocked')).toBe(true)
  })

  it('approve works in demo mode and dispatches through MailService', async () => {
    const store = new MemoryAgentStore()
    const now = 1_700_000_000_000
    await seedDemoAgents(store, now)
    const mail = new FakeMail()
    const gateway = new AgentGateway({ store, mail, now: () => now, id: ids('g') })

    const [first, second] = await gateway.approvals.listPending()
    await gateway.approvals.approve(first.id)
    await gateway.approvals.deny(second.id)

    expect(mail.sent).toHaveLength(1)
    expect(await gateway.approvals.pendingCount()).toBe(0)
  })

  it('nothing in the fixture set is already stale', async () => {
    const store = new MemoryAgentStore()
    const now = 1_700_000_000_000
    await seedDemoAgents(store, now)
    const gateway = new AgentGateway({ store, mail: new FakeMail(), now: () => now, id: ids('g') })
    expect(await gateway.approvals.expireStale()).toBe(0)
  })
})
