// The v1 tool surface — M3. Ten suites, one per promise the surface makes.
//
// These drive `callTool` directly rather than over the relay: the wire is M2's
// and tests/gateway.test.ts still proves it end to end. What is proved here is
// everything a frame cannot see — that a schema and its handler agree, that a
// missing grant refuses in a sentence, that a size cap holds, that a scope
// denial names the address that caused it, and that one tool call writes
// exactly one row in the audit log.

import { describe, it, expect, beforeEach } from 'vitest'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import {
  AgentGateway,
  DEFAULT_SESSION_MS,
  DEMO_AGENT,
  MemoryAgentStore,
  seedDemoAgents,
  type Agent,
  type Capability,
} from '../src/core/agents'
import type { AuditEntry } from '../src/core/agents/types'
import {
  ATTACHMENT_BYTES_MAX,
  BODY_CHARS_MAX,
  callTool,
  markdownToHtml,
  SEARCH_LIMIT_MAX,
  SNIPPET_CHARS,
  TOOLS,
  TOOL_CAPABILITIES,
  UNTRUSTED_CLOSE,
  UNTRUSTED_NOTE,
  UNTRUSTED_OPEN,
  type ToolContext,
} from '../src/core/gateway-server'
import { DemoMailService } from '../src/core'
import { deriveRecipients, quoteOriginal, replySubject } from '../src/lib/compose'
import { fullTimestamp } from '../src/lib/format'
import type { MailService, Message, Thread } from '../src/core/types'

const NOW = Date.parse('2026-08-29T09:00:00Z')
const APP_VERSION = '0.1.0-test'

// Fixture landmarks, addressed by key so a reordered fixture set cannot
// silently change what a test is about.
const THREAD_WITH_ATTACHMENT = 'demo-work/w-calendar'
const BIG_ATTACHMENT_THREAD = 'demo-personal/p-mum' // sunday-01.jpg, 2.4 MB
const REPLY_THREAD = 'demo-work/w-design-review'
const IN_SCOPE = 'dev.raman@fernwood.dev' // Scout's send grant covers fernwood.dev
const OUT_OF_SCOPE = 'rosa@quillfield.example'

interface Fixture {
  gateway: AgentGateway
  mail: DemoMailService
  ctx: ToolContext
  store: MemoryAgentStore
}

function contextFor(f: Omit<Fixture, 'ctx'>, agent: Agent): ToolContext {
  return { gateway: f.gateway, mail: f.mail, agent, appVersion: APP_VERSION, now: () => NOW }
}

/** Scout, with every grant the demo seeds. */
async function scout(): Promise<Fixture> {
  const store = new MemoryAgentStore()
  await seedDemoAgents(store, NOW)
  const mail = new DemoMailService({ now: NOW })
  const gateway = new AgentGateway({ store, mail, now: () => NOW })
  const agent: Agent = { id: DEMO_AGENT.id, name: DEMO_AGENT.name, createdAt: NOW }
  await gateway.sessions.start(agent.id, DEFAULT_SESSION_MS)
  return { store, mail, gateway, ctx: contextFor({ store, mail, gateway }, agent) }
}

/** A fresh agent holding exactly the capabilities named, and nothing else. */
async function agentHolding(f: Fixture, name: string, held: Capability[]): Promise<ToolContext> {
  const issued = await f.gateway.createAgent(name)
  for (const capability of held) await f.gateway.grant(issued.agent.id, capability)
  await f.gateway.sessions.start(issued.agent.id, DEFAULT_SESSION_MS)
  return contextFor(f, issued.agent)
}

function payloadOf(result: CallToolResult): Record<string, unknown> {
  const block = result.content[0] as { text: string }
  return JSON.parse(block.text) as Record<string, unknown>
}

function textOf(result: CallToolResult): string {
  return (result.content[0] as { text: string }).text
}

/**
 * Runs a call and returns the audit rows it wrote.
 *
 * By id difference rather than by position: the whole suite runs on a frozen
 * clock, so every row it writes shares one timestamp and "the newest row" is
 * not a thing the store can answer.
 */
async function rowsWritten(
  f: Fixture,
  ctx: ToolContext,
  name: string,
  args?: unknown,
): Promise<{ result: CallToolResult; written: number; rows: AuditEntry[] }> {
  const before = new Set(
    (await f.gateway.audit.query({ agentId: ctx.agent.id })).map((row) => row.id),
  )
  const result = await callTool(name, ctx, args)
  const rows = (await f.gateway.audit.query({ agentId: ctx.agent.id })).filter(
    (row) => !before.has(row.id),
  )
  return { result, written: rows.length, rows }
}

// -- 1. the surface itself ----------------------------------------------------

describe('the tool surface', () => {
  it('names every tool snake_case and annotates all four hints', () => {
    expect(TOOLS).toHaveLength(11)
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(tool.description && tool.description.length).toBeGreaterThan(40)
      expect(typeof tool.annotations?.readOnlyHint).toBe('boolean')
      expect(typeof tool.annotations?.destructiveHint).toBe('boolean')
      expect(typeof tool.annotations?.idempotentHint).toBe('boolean')
      expect(typeof tool.annotations?.openWorldHint).toBe('boolean')
    }
  })

  it('closes every schema and describes every argument for a model reader', () => {
    const thin: string[] = []
    for (const tool of TOOLS) {
      const schema = tool.inputSchema as {
        additionalProperties?: boolean
        properties?: Record<string, { description?: string }>
      }
      expect(schema.additionalProperties).toBe(false)
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        if ((property.description ?? '').length < 24) thin.push(`${tool.name}.${name}`)
      }
    }
    expect(thin).toEqual([])
  })

  it('gates each tool on the capability the trust model names for it', () => {
    expect(TOOL_CAPABILITIES).toEqual({
      search_mail: 'read',
      read_thread: 'read',
      get_attachment: 'read',
      list_accounts: 'read',
      draft_new: 'draft',
      draft_reply: 'draft',
      archive_thread: 'archiveLabel',
      modify_labels: 'archiveLabel',
      // Authorised inside AgentGateway.requestSend, per recipient.
      request_send: null,
      // Deliberately ungated: identity, and an agent's own submissions.
      maru_ping: null,
      list_pending: null,
    })
  })

  it('answers an unknown tool with the list it does have', async () => {
    const f = await scout()
    const { result, written } = await rowsWritten(f, f.ctx, 'delete_everything', {})
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('search_mail')
    expect(written).toBe(1)
  })
})

// -- sessions -----------------------------------------------------------------

describe('agent sessions', () => {
  async function fixture() {
    let at = NOW
    const store = new MemoryAgentStore()
    const mail = new DemoMailService({ now: NOW })
    const gateway = new AgentGateway({ store, mail, now: () => at })
    const issued = await gateway.createAgent('Probe')
    await gateway.grant(issued.agent.id, 'read')
    const base = { store, mail, gateway }
    return {
      ...base,
      ctx: { ...contextFor(base, issued.agent), now: () => at },
      advance(ms: number) {
        at += ms
      },
    }
  }

  it('refuses restricted tools once per call and throttles session requests', async () => {
    const f = await fixture()
    const events: string[] = []
    f.gateway.onEvent((event) => events.push(event.type))

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { result, written, rows } = await rowsWritten(f, f.ctx, 'search_mail', { query: '' })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain('no agent session is active')
      expect(textOf(result)).toContain('Ask them to start one')
      expect(written).toBe(1)
      expect(rows[0]).toMatchObject({
        tool: 'search_mail',
        summary: 'Blocked: no active session, so search_mail is refused.',
        outcome: 'blocked',
      })
    }

    expect(events.filter((type) => type === 'sessionRequested')).toHaveLength(1)
  })

  it('allows the call after start and reports the session in maru_ping', async () => {
    const f = await fixture()
    const first = await f.gateway.sessions.start(f.ctx.agent.id, 15 * 60_000)
    f.advance(5 * 60_000)
    const session = await f.gateway.sessions.start(f.ctx.agent.id, DEFAULT_SESSION_MS)
    expect(session.startedAt).toBeGreaterThan(first.startedAt)
    expect(await f.gateway.sessions.listActive()).toEqual([session])

    const search = await callTool('search_mail', f.ctx, { query: '' })
    expect(search.isError).toBeUndefined()

    const ping = payloadOf(await callTool('maru_ping', f.ctx, {})) as {
      session: { expires_at: string; minutes_left: number }
      summary: string
    }
    expect(ping.session).toEqual({
      expires_at: new Date(session.expiresAt).toISOString(),
      minutes_left: 60,
    })
    expect(ping.summary).toContain('Session active for 60 more minutes.')
  })

  it('expires lazily, emits the change, and writes the expiry once', async () => {
    const f = await fixture()
    const events: string[] = []
    f.gateway.onEvent((event) => events.push(event.type))
    await f.gateway.sessions.start(f.ctx.agent.id, 15 * 60_000)
    f.advance(15 * 60_000 + 1)

    const result = await callTool('search_mail', f.ctx, { query: '' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('no agent session is active')
    await callTool('search_mail', f.ctx, { query: '' })

    const expired = (await f.gateway.audit.query({ agentId: f.ctx.agent.id })).filter(
      (row) => row.tool === 'session.expired',
    )
    expect(expired).toHaveLength(1)
    expect(expired[0]).toMatchObject({
      summary: 'The session expired after 15 minutes.',
      outcome: 'ok',
    })
    expect(events.filter((type) => type === 'sessionsChanged')).toHaveLength(2)
  })

  it('locks immediately on end and removes a session on revocation', async () => {
    const f = await fixture()
    await f.gateway.sessions.start(f.ctx.agent.id, DEFAULT_SESSION_MS)
    await f.gateway.sessions.end(f.ctx.agent.id)
    expect(await f.gateway.sessions.active(f.ctx.agent.id)).toBeNull()
    expect((await callTool('search_mail', f.ctx, { query: '' })).isError).toBe(true)

    await f.gateway.sessions.start(f.ctx.agent.id, DEFAULT_SESSION_MS)
    await f.gateway.revokeAgent(f.ctx.agent.id)
    expect(await f.gateway.sessions.active(f.ctx.agent.id)).toBeNull()
    const ended = (await f.gateway.audit.query({ agentId: f.ctx.agent.id })).filter(
      (row) => row.tool === 'session.end',
    )
    expect(ended).toHaveLength(2)
  })

  it('keeps maru_ping available without a session, and gates list_pending', async () => {
    const f = await fixture()
    const ping = payloadOf(await callTool('maru_ping', f.ctx, {})) as { session: unknown }
    expect(ping.session).toBeNull()
    // A queued reply draft quotes mail content, so the queue is session data
    // like everything else that can carry it.
    expect((await callTool('list_pending', f.ctx, {})).isError).toBe(true)
  })
})

// -- 2. search_mail -----------------------------------------------------------

describe('search_mail', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await scout()
  })

  it('returns compact summaries and never a body', async () => {
    const result = await callTool('search_mail', f.ctx, { query: 'latency' })
    const payload = payloadOf(result) as {
      untrusted_note: string
      threads: Record<string, unknown>[]
    }
    expect(payload.untrusted_note).toBe(UNTRUSTED_NOTE)
    expect(payload.threads.length).toBeGreaterThan(0)
    for (const summary of payload.threads) {
      expect(Object.keys(summary).sort()).toEqual([
        'account',
        'date',
        'from',
        'has_attachments',
        'message_count',
        'snippet',
        'starred',
        'subject',
        'thread_key',
        'unread',
      ])
      const snippet = String(summary.snippet)
      expect(snippet.startsWith(`${UNTRUSTED_OPEN}\n`)).toBe(true)
      expect(snippet.endsWith(`\n${UNTRUSTED_CLOSE}`)).toBe(true)
      expect(snippet.slice(UNTRUSTED_OPEN.length + 1, -(UNTRUSTED_CLOSE.length + 1)).length).toBeLessThanOrEqual(
        SNIPPET_CHARS + 1,
      )
      expect(String(summary.date)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('defaults to 20 results and refuses a limit past the cap', async () => {
    const all = await callTool('search_mail', f.ctx, { query: '' })
    expect((payloadOf(all) as { threads: unknown[] }).threads.length).toBeLessThanOrEqual(20)

    const refused = await callTool('search_mail', f.ctx, { query: '', limit: 500 })
    expect(refused.isError).toBe(true)
    expect(textOf(refused)).toContain(String(SEARCH_LIMIT_MAX))

    const three = await callTool('search_mail', f.ctx, { query: '', limit: 3 })
    expect((payloadOf(three) as { threads: unknown[] }).threads).toHaveLength(3)
  })

  it('lists the newest inbox mail for an empty query rather than nothing', async () => {
    const payload = payloadOf(await callTool('search_mail', f.ctx, { query: '' })) as {
      threads: { date: string }[]
    }
    expect(payload.threads.length).toBeGreaterThan(1)
    const dates = payload.threads.map((t) => Date.parse(t.date))
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
  })

  it('filters to one account and names the ids when given a wrong one', async () => {
    const scoped = payloadOf(
      await callTool('search_mail', f.ctx, { query: '', account_id: 'demo-work' }),
    ) as { threads: { thread_key: string }[] }
    expect(scoped.threads.length).toBeGreaterThan(0)
    for (const thread of scoped.threads) expect(thread.thread_key.startsWith('demo-work/')).toBe(true)

    const wrong = await callTool('search_mail', f.ctx, { query: '', account_id: 'nope' })
    expect(wrong.isError).toBe(true)
    expect(textOf(wrong)).toContain('demo-work')
  })

  it('refuses an invented argument and lists the ones it takes', async () => {
    const result = await callTool('search_mail', f.ctx, { query: 'x', account: 'demo-work' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('account_id')
  })

  it('refuses a query of the wrong type', async () => {
    const result = await callTool('search_mail', f.ctx, { query: 12 })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('query as a string')
  })
})

// -- 3. read_thread -----------------------------------------------------------

describe('read_thread', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await scout()
  })

  it('returns plain text bodies and attachment metadata without the data', async () => {
    const payload = payloadOf(
      await callTool('read_thread', f.ctx, { thread_key: THREAD_WITH_ATTACHMENT }),
    ) as {
      subject: string
      untrusted_note: string
      messages: { body_text: string; attachments: Record<string, unknown>[] }[]
    }

    expect(payload.messages.length).toBeGreaterThan(0)
    expect(payload.untrusted_note).toBe(UNTRUSTED_NOTE)
    const withAttachment = payload.messages.find((m) => m.attachments.length > 0)!
    expect(Object.keys(withAttachment.attachments[0]).sort()).toEqual([
      'filename',
      'id',
      'inline',
      'mime_type',
      'size_bytes',
    ])
    for (const message of payload.messages) {
      expect(message.body_text.startsWith(`${UNTRUSTED_OPEN}\n`)).toBe(true)
      expect(message.body_text.endsWith(`\n${UNTRUSTED_CLOSE}`)).toBe(true)
      expect(message.body_text).not.toContain('<p')
      expect(message.body_text).not.toContain('&nbsp;')
    }
  })

  it('names the thread in one audit row', async () => {
    const { written, rows } = await rowsWritten(f, f.ctx, 'read_thread', {
      thread_key: REPLY_THREAD,
    })
    expect(written).toBe(1)
    expect(rows[0].tool).toBe('read_thread')
    expect(rows[0].summary).toBe('Read “Design review: settings surface”.')
    expect(rows[0].threadKey).toBe(REPLY_THREAD)
  })

  it('refuses an unknown thread key with the shape a key has', async () => {
    const result = await callTool('read_thread', f.ctx, { thread_key: 'demo-work/nope' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('account-id/thread-id')
  })

  it('cuts a very long body at the cap and says that it did', async () => {
    const long = 'word '.repeat(20_000)
    const ctx = { ...f.ctx, mail: stubMail({ bodyText: long }) }
    const payload = payloadOf(await callTool('read_thread', ctx, { thread_key: 'stub/1' })) as {
      messages: { body_text: string; body_truncated?: boolean; body_total_chars?: number }[]
    }
    const body = payload.messages[0].body_text
    expect(body.startsWith(`${UNTRUSTED_OPEN}\n`)).toBe(true)
    expect(body.endsWith(`\n${UNTRUSTED_CLOSE}`)).toBe(true)
    expect(body.slice(UNTRUSTED_OPEN.length + 1, -(UNTRUSTED_CLOSE.length + 1))).toHaveLength(
      BODY_CHARS_MAX,
    )
    expect(payload.messages[0].body_truncated).toBe(true)
    expect(payload.messages[0].body_total_chars).toBe(long.length)
  })
})

// -- 4. get_attachment --------------------------------------------------------

describe('get_attachment', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await scout()
  })

  it('returns base64 with its media type, and audits the filename', async () => {
    const thread = payloadOf(
      await callTool('read_thread', f.ctx, { thread_key: THREAD_WITH_ATTACHMENT }),
    ) as { messages: { id: string; attachments: { id: string; filename: string }[] }[] }
    const message = thread.messages.find((m) => m.attachments.length > 0)!

    const { result, written, rows } = await rowsWritten(f, f.ctx, 'get_attachment', {
      thread_key: THREAD_WITH_ATTACHMENT,
      message_id: message.id,
      attachment_id: message.attachments[0].id,
    })
    const payload = payloadOf(result) as { data_base64: string; mime_type: string }
    expect(payload.mime_type).toBe('text/calendar')
    expect(payload.data_base64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    expect(written).toBe(1)
    expect(rows[0].summary).toContain(message.attachments[0].filename)
  })

  it('refuses a file too large for one gateway response', async () => {
    const thread = payloadOf(
      await callTool('read_thread', f.ctx, { thread_key: BIG_ATTACHMENT_THREAD }),
    ) as { messages: { id: string; attachments: { id: string }[] }[] }
    const message = thread.messages.find((m) => m.attachments.length > 0)!

    const result = await callTool('get_attachment', f.ctx, {
      thread_key: BIG_ATTACHMENT_THREAD,
      message_id: message.id,
      attachment_id: message.attachments[0].id,
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('gateway response')
  })

  it('refuses anything over the 5 MB cap before it fetches a byte', async () => {
    let fetched = false
    const mail = stubMail({
      attachmentSize: ATTACHMENT_BYTES_MAX + 1,
      onFetch: () => {
        fetched = true
      },
    })
    const result = await callTool('get_attachment', { ...f.ctx, mail }, {
      thread_key: 'stub/1',
      message_id: 'stub-m1',
      attachment_id: 'stub-att1',
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('5.0 MB')
    expect(fetched).toBe(false)
  })

  it('lists what a message does carry when the attachment id is wrong', async () => {
    const thread = payloadOf(
      await callTool('read_thread', f.ctx, { thread_key: THREAD_WITH_ATTACHMENT }),
    ) as { messages: { id: string; attachments: { filename: string }[] }[] }
    const message = thread.messages.find((m) => m.attachments.length > 0)!

    const result = await callTool('get_attachment', f.ctx, {
      thread_key: THREAD_WITH_ATTACHMENT,
      message_id: message.id,
      attachment_id: 'not-an-id',
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(message.attachments[0].filename)
  })
})

// -- 5. drafting --------------------------------------------------------------

describe('draft_new and draft_reply', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await scout()
  })

  it('normalises recipients, resolves the account and renders Markdown', async () => {
    const payload = payloadOf(
      await callTool('draft_new', f.ctx, {
        account_id: 'demo-work',
        to: ['Dev Raman <dev.raman@fernwood.dev>'],
        cc: ['maya@fernwood.dev'],
        subject: 'Thursday',
        body_markdown: 'Two things:\n\n- the index size\n- the **cold start**',
      }),
    ) as { draft: Record<string, unknown> }

    expect(payload.draft.account_id).toBe('demo-work')
    expect(payload.draft.from).toBe('nick.galang@gmail.com')
    expect(payload.draft.to).toEqual([{ name: 'Dev Raman', email: 'dev.raman@fernwood.dev' }])
    expect(payload.draft.cc).toEqual([{ email: 'maya@fernwood.dev' }])
    expect(payload.draft.body_html).toContain('<li>the index size</li>')
    expect(payload.draft.body_html).toContain('<strong>cold start</strong>')
    expect(payload.draft.reply).toBeNull()
  })

  it('names every unreadable address at once', async () => {
    const result = await callTool('draft_new', f.ctx, {
      account_id: 'demo-work',
      to: ['dev@', 'hello world', 'maya@fernwood.dev'],
      subject: 'x',
      body_text: 'x',
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('“dev@”')
    expect(textOf(result)).toContain('“hello world”')
  })

  it('asks which account when several exist and none was named', async () => {
    const result = await callTool('draft_new', f.ctx, {
      to: ['maya@fernwood.dev'],
      subject: 'x',
      body_text: 'x',
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('account_id')
    expect(textOf(result)).toContain('demo-work')
  })

  it('refuses two bodies rather than picking one', async () => {
    const result = await callTool('draft_new', f.ctx, {
      account_id: 'demo-work',
      to: ['maya@fernwood.dev'],
      subject: 'x',
      body_text: 'one',
      body_markdown: 'another',
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('exactly one body')
  })

  it('escapes markup an agent wrote instead of passing it through', () => {
    const html = markdownToHtml('<script>alert(1)</script> and [ok](javascript:alert(2))')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('href="javascript:')
  })

  it('resolves a reply exactly as the composer does', async () => {
    const { thread, messages } = await f.mail.getThread(REPLY_THREAD, { hydrate: true })
    const message = messages[messages.length - 1]
    const accounts = await f.mail.listAccounts()
    const expected = deriveRecipients(message, 'replyAll', accounts.map((a) => a.email))

    const payload = payloadOf(
      await callTool('draft_reply', f.ctx, {
        thread_key: REPLY_THREAD,
        mode: 'replyAll',
        body_text: 'Agreed.',
      }),
    ) as {
      untrusted_note: string
      draft: {
        to: { email: string }[]
        cc: { email: string }[]
        subject: string
        body_html: string
        reply: unknown
      }
    }

    expect(payload.untrusted_note).toBe(UNTRUSTED_NOTE)
    expect(payload.draft.to.map((a) => a.email)).toEqual(expected.to.map((a) => a.email))
    expect(payload.draft.cc.map((a) => a.email)).toEqual(expected.cc.map((a) => a.email))
    expect(payload.draft.subject).toBe(replySubject(thread.subject, 'replyAll'))
    expect(payload.draft.body_html).toContain(quoteOriginal(message, 'replyAll', fullTimestamp))
    expect(payload.draft.reply).toEqual({
      thread_key: REPLY_THREAD,
      message_id: message.id,
      mode: 'replyAll',
    })
  })

  it('refuses a forward with nobody to forward it to', async () => {
    const result = await callTool('draft_reply', f.ctx, {
      thread_key: REPLY_THREAD,
      mode: 'forward',
      body_text: 'FYI',
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('Give to')
  })

  it('sends nothing and queues nothing', async () => {
    const sentBefore = await f.mail.listThreads({ kind: 'unified', folder: 'sent' })
    await callTool('draft_reply', f.ctx, {
      thread_key: REPLY_THREAD,
      mode: 'reply',
      body_text: 'Agreed.',
    })
    const sentAfter = await f.mail.listThreads({ kind: 'unified', folder: 'sent' })
    expect(sentAfter).toHaveLength(sentBefore.length)
    expect(await f.gateway.approvals.listForAgent(DEMO_AGENT.id)).toHaveLength(2) // the seeded pair
  })
})

// -- 6. request_send ----------------------------------------------------------

describe('request_send', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await scout()
  })

  it('queues for a human, returns a pending id, and dispatches nothing', async () => {
    const sentBefore = await f.mail.listThreads({ kind: 'unified', folder: 'sent' })
    const { result, written, rows } = await rowsWritten(f, f.ctx, 'request_send', {
      account_id: 'demo-work',
      to: [IN_SCOPE],
      subject: 'Thursday',
      body_text: 'Sounds right.',
    })

    const payload = payloadOf(result) as { approval_id: string; status: string; note: string }
    expect(payload.status).toBe('pending')
    expect(payload.note).toContain('approve')

    const queued = await f.gateway.approvals.listForAgent(DEMO_AGENT.id)
    expect(queued.some((a) => a.id === payload.approval_id)).toBe(true)

    expect(await f.mail.listThreads({ kind: 'unified', folder: 'sent' })).toHaveLength(
      sentBefore.length,
    )
    // One row: the queue's own `pending`. The tool adds none of its own.
    expect(written).toBe(1)
    expect(rows[0].outcome).toBe('pending')
  })

  it('carries attachments into the queue, and the human sees what would go out', async () => {
    const data = btoa('hello attachment')
    const { result } = await rowsWritten(f, f.ctx, 'request_send', {
      account_id: 'demo-work',
      to: [IN_SCOPE],
      subject: 'With a file',
      body_text: 'Attached.',
      attachments: [{ filename: 'notes.txt', mime_type: 'text/plain', data_base64: data }],
    })
    const payload = payloadOf(result) as { approval_id: string; attachments: string[] }
    expect(payload.attachments).toEqual(['notes.txt'])

    const approval = (await f.gateway.approvals.listForAgent(DEMO_AGENT.id)).find(
      (a) => a.id === payload.approval_id,
    )
    expect(approval?.payload.attachments).toEqual([
      { filename: 'notes.txt', mimeType: 'text/plain', dataBase64: data },
    ])

    // Approve it: the demo mailbox's sent message really carries the file.
    await f.gateway.approvals.approve(payload.approval_id)
    const sent = await f.mail.listThreads({ kind: 'unified', folder: 'sent' })
    const conversation = await f.mail.getThread(sent[0].key)
    const outgoing = conversation.messages[conversation.messages.length - 1]
    expect(outgoing.attachments.map((a) => a.filename)).toContain('notes.txt')
  })

  it('refuses an oversized attachment with the real numbers', async () => {
    const big = 'A'.repeat(Math.ceil((501 * 1024 * 4) / 3))
    const result = await callTool('request_send', f.ctx, {
      account_id: 'demo-work',
      to: [IN_SCOPE],
      subject: 'Too big',
      body_text: 'x',
      attachments: [{ filename: 'big.bin', data_base64: big }],
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('500 KB')
    expect(textOf(result)).toContain('big.bin')
  })

  it('refuses attachment data that is not base64', async () => {
    const result = await callTool('request_send', f.ctx, {
      account_id: 'demo-work',
      to: [IN_SCOPE],
      subject: 'Bad data',
      body_text: 'x',
      attachments: [{ filename: 'x.bin', data_base64: 'not base64!!' }],
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('not valid base64')
  })

  it('names the recipient that failed the scope, and queues nothing', async () => {
    const { result, written, rows } = await rowsWritten(f, f.ctx, 'request_send', {
      account_id: 'demo-work',
      to: [IN_SCOPE],
      cc: [OUT_OF_SCOPE],
      subject: 'Thursday',
      body_text: 'Sounds right.',
    })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(OUT_OF_SCOPE)
    expect(textOf(result)).not.toContain(IN_SCOPE)
    expect(textOf(result)).toContain('single grant')
    // Blocked, once, by `authorize` inside requestSend.
    expect(written).toBe(1)
    expect(rows[0].outcome).toBe('blocked')
    expect(await f.gateway.approvals.listForAgent(DEMO_AGENT.id)).toHaveLength(2)
  })

  it('carries the reply block through so an approved send threads correctly', async () => {
    const drafted = payloadOf(
      await callTool('draft_reply', f.ctx, {
        thread_key: REPLY_THREAD,
        mode: 'reply',
        body_text: 'Agreed.',
      }),
    ) as { draft: Record<string, unknown> }
    const draft = drafted.draft as {
      account_id: string
      to: { email: string }[]
      subject: string
      body_html: string
      reply: Record<string, string>
    }

    const payload = payloadOf(
      await callTool('request_send', f.ctx, {
        account_id: draft.account_id,
        to: draft.to.map((a) => a.email),
        subject: draft.subject,
        body_html: draft.body_html,
        reply: draft.reply,
      }),
    ) as { approval_id: string }

    const approval = (await f.gateway.approvals.listForAgent(DEMO_AGENT.id)).find(
      (a) => a.id === payload.approval_id,
    )!
    expect(approval.payload.reply?.threadKey).toBe(REPLY_THREAD)
    expect(approval.payload.reply?.mode).toBe('reply')
  })
})

// -- 7. triage ----------------------------------------------------------------

describe('archive_thread and modify_labels', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await scout()
  })

  it('archives through the same action the UI uses, and says which thread', async () => {
    const { written, rows } = await rowsWritten(f, f.ctx, 'archive_thread', {
      thread_key: REPLY_THREAD,
      action: 'archive',
    })
    const { thread } = await f.mail.getThread(REPLY_THREAD)
    expect(thread.labelIds).not.toContain('INBOX')
    expect(written).toBe(1)
    expect(rows[0].summary).toBe('Archived “Design review: settings surface”.')
  })

  it('refuses INBOX and TRASH by pointing at the tool that owns them', async () => {
    const result = await callTool('modify_labels', f.ctx, {
      thread_key: REPLY_THREAD,
      add: ['INBOX'],
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('archive_thread')
  })

  it('applies two label changes in one call and logs one line naming both', async () => {
    const { written, rows } = await rowsWritten(f, f.ctx, 'modify_labels', {
      thread_key: REPLY_THREAD,
      add: ['STARRED'],
      remove: ['UNREAD'],
    })
    const { thread } = await f.mail.getThread(REPLY_THREAD)
    expect(thread.starred).toBe(true)
    expect(thread.unread).toBe(false)
    expect(written).toBe(1)
    expect(rows[0].summary).toBe(
      'Starred “Design review: settings surface” and marked it as read.',
    )
  })

  it('refuses a label in both add and remove, and an unknown one by name', async () => {
    const both = await callTool('modify_labels', f.ctx, {
      thread_key: REPLY_THREAD,
      add: ['STARRED'],
      remove: ['STARRED'],
    })
    expect(both.isError).toBe(true)
    expect(textOf(both)).toContain('both add and remove')

    const unknown = await callTool('modify_labels', f.ctx, {
      thread_key: REPLY_THREAD,
      add: ['Invoices'],
    })
    expect(unknown.isError).toBe(true)
    // The refusal names the label as given and lists what the account has,
    // so the agent's next call can be right instead of guessed.
    expect(textOf(unknown)).toContain('“Invoices”')
    expect(textOf(unknown)).toContain('Hiring')
  })

  it('applies a user label by name, case-insensitively, in one audited call', async () => {
    const { result, written, rows } = await rowsWritten(f, f.ctx, 'modify_labels', {
      thread_key: REPLY_THREAD,
      add: ['hiring'],
      remove: ['UNREAD'],
    })
    expect(payloadOf(result)).toMatchObject({ done: true })
    expect(written).toBe(1)
    expect(rows[0].summary).toContain('Added Hiring')
    expect(rows[0].summary).toContain('marked it as read')

    const { thread } = await f.mail.getThread(REPLY_THREAD)
    expect(thread.labelIds).toContain('Label_hiring')
    expect(thread.labelIds).not.toContain('UNREAD')
  })
})

// -- 8. list_pending ----------------------------------------------------------

describe('list_pending', () => {
  it('answers an agent holding nothing, and shows only its own requests', async () => {
    const f = await scout()
    const bare = await agentHolding(f, 'Probe', [])

    const empty = payloadOf(await callTool('list_pending', bare)) as {
      pending_count: number
      requests: unknown[]
    }
    expect(empty.pending_count).toBe(0)
    expect(empty.requests).toEqual([])

    const mine = payloadOf(await callTool('list_pending', f.ctx)) as {
      pending_count: number
      requests: { status: string; resolved_at: string | null }[]
    }
    expect(mine.pending_count).toBe(2)
    expect(mine.requests.every((r) => r.status === 'pending' && r.resolved_at === null)).toBe(true)
  })
})

// -- 9. grants ----------------------------------------------------------------

describe('grant denial', () => {
  const CASES: { tool: string; args: Record<string, unknown>; capability: Capability }[] = [
    { tool: 'search_mail', args: { query: 'x' }, capability: 'read' },
    { tool: 'read_thread', args: { thread_key: REPLY_THREAD }, capability: 'read' },
    {
      tool: 'get_attachment',
      args: { thread_key: REPLY_THREAD, message_id: 'm', attachment_id: 'a' },
      capability: 'read',
    },
    { tool: 'list_accounts', args: {}, capability: 'read' },
    {
      tool: 'draft_new',
      args: { to: ['maya@fernwood.dev'], subject: 'x', body_text: 'x' },
      capability: 'draft',
    },
    {
      tool: 'draft_reply',
      args: { thread_key: REPLY_THREAD, mode: 'reply', body_text: 'x' },
      capability: 'draft',
    },
    {
      tool: 'archive_thread',
      args: { thread_key: REPLY_THREAD, action: 'archive' },
      capability: 'archiveLabel',
    },
    {
      tool: 'modify_labels',
      args: { thread_key: REPLY_THREAD, add: ['STARRED'] },
      capability: 'archiveLabel',
    },
  ]

  for (const testCase of CASES) {
    it(`refuses ${testCase.tool} without ${testCase.capability}, once, in a sentence`, async () => {
      const f = await scout()
      const bare = await agentHolding(f, 'Probe', [])
      const { result, written, rows } = await rowsWritten(f, bare, testCase.tool, testCase.args)

      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain(`does not hold the ${testCase.capability} capability`)
      expect(textOf(result)).toContain('Settings → Agents')
      expect(written).toBe(1)
      expect(rows[0].outcome).toBe('blocked')
      expect(rows[0].tool).toBe(testCase.tool)
    })
  }

  it('refuses request_send without the send grant, and says drafting still works', async () => {
    const f = await scout()
    const drafter = await agentHolding(f, 'Drafter', ['read', 'draft'])
    const { result, written } = await rowsWritten(f, drafter, 'request_send', {
      account_id: 'demo-work',
      to: [IN_SCOPE],
      subject: 'x',
      body_text: 'x',
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('does not hold the send capability')
    expect(textOf(result)).toContain('draft_new')
    expect(written).toBe(1)
    expect(await f.gateway.approvals.listForAgent(drafter.agent.id)).toHaveLength(0)
  })

  it('lets a read grant read and still refuses it a draft', async () => {
    const f = await scout()
    const reader = await agentHolding(f, 'Reader', ['read'])

    const allowed = await callTool('search_mail', reader, { query: 'latency' })
    expect(allowed.isError).toBeUndefined()

    const refused = await callTool('draft_new', reader, {
      account_id: 'demo-work',
      to: [IN_SCOPE],
      subject: 'x',
      body_text: 'x',
    })
    expect(refused.isError).toBe(true)
    expect(textOf(refused)).toContain('draft capability')
  })
})

// -- 10. one row per call -----------------------------------------------------

describe('the audit log', () => {
  it('writes exactly one row for every call, refusals included', async () => {
    const f = await scout()
    const calls: [string, Record<string, unknown>][] = [
      ['maru_ping', {}],
      ['list_accounts', {}],
      ['search_mail', { query: 'latency' }],
      ['search_mail', { query: 'latency', nonsense: true }],
      ['read_thread', { thread_key: REPLY_THREAD }],
      ['read_thread', { thread_key: 'demo-work/nope' }],
      ['draft_new', { account_id: 'demo-work', to: [IN_SCOPE], subject: 's', body_text: 'b' }],
      ['draft_reply', { thread_key: REPLY_THREAD, mode: 'reply', body_text: 'b' }],
      ['request_send', { account_id: 'demo-work', to: [IN_SCOPE], subject: 's', body_text: 'b' }],
      ['request_send', { account_id: 'demo-work', to: [OUT_OF_SCOPE], subject: 's', body_text: 'b' }],
      ['archive_thread', { thread_key: REPLY_THREAD, action: 'archive' }],
      ['modify_labels', { thread_key: REPLY_THREAD, add: ['STARRED'] }],
      ['list_pending', {}],
    ]

    for (const [name, args] of calls) {
      const { written } = await rowsWritten(f, f.ctx, name, args)
      expect(`${name}: ${written}`).toBe(`${name}: 1`)
    }
  })
})

// -- 11. hydration ------------------------------------------------------------

describe('body hydration', () => {
  it('hydrates only the two tools that read a body', async () => {
    const f = await scout()
    const cases: [string, Record<string, unknown>, boolean][] = [
      ['read_thread', { thread_key: 'stub/1' }, true],
      ['draft_reply', { thread_key: 'stub/1', mode: 'reply', body_text: 'x' }, true],
      ['archive_thread', { thread_key: 'stub/1', action: 'archive' }, false],
      ['modify_labels', { thread_key: 'stub/1', add: ['STARRED'] }, false],
      [
        'get_attachment',
        { thread_key: 'stub/1', message_id: 'stub-m1', attachment_id: 'stub-att1' },
        false,
      ],
    ]

    for (const [tool, args, expected] of cases) {
      const hydrations: (boolean | undefined)[] = []
      const result = await callTool(tool, { ...f.ctx, mail: stubMail({ hydrations }) }, args)
      expect(`${tool}: ${result.isError ?? false}`).toBe(`${tool}: false`)
      // A quoted original needs the body; an audit line needs the subject. On
      // the Gmail path the difference is every message in the thread, fetched.
      expect(`${tool}: ${hydrations[0]}`).toBe(`${tool}: ${expected}`)
    }
  })
})

// -- the stub -----------------------------------------------------------------

/**
 * A MailService with one thread, one message and one attachment, whose size and
 * body are dialled by the test. The demo fixtures are a mailbox, not a test
 * rig: nothing in them is 5 MB, and nothing in them should be.
 */
function stubMail(opts: {
  bodyText?: string
  attachmentSize?: number
  onFetch?: () => void
  /** Each getThread call's `hydrate`, in order. */
  hydrations?: (boolean | undefined)[]
}): MailService {
  const message: Message = {
    id: 'stub-m1',
    threadId: '1',
    accountId: 'stub',
    from: { email: 'someone@example.com' },
    to: [{ email: 'me@example.com' }],
    cc: [],
    bcc: [],
    replyTo: [],
    date: NOW,
    subject: 'Stub',
    snippet: 'stub',
    bodyText: opts.bodyText ?? 'stub',
    bodyState: 'full',
    labelIds: ['INBOX'],
    attachments: [
      {
        id: 'stub-att1',
        messageId: 'stub-m1',
        filename: 'huge.bin',
        mimeType: 'application/octet-stream',
        sizeBytes: opts.attachmentSize ?? 10,
        inline: false,
      },
    ],
    unread: false,
    starred: false,
  }
  const thread: Thread = {
    key: 'stub/1',
    gmailThreadId: '1',
    accountId: 'stub',
    subject: 'Stub',
    snippet: 'stub',
    lastMessageAt: NOW,
    participants: [{ email: 'someone@example.com' }],
    labelIds: ['INBOX'],
    unread: false,
    starred: false,
    messageCount: 1,
    hasAttachments: true,
  }

  const unsupported = () => {
    throw new Error('the stub does not implement this')
  }
  return {
    listAccounts: async () => [
      { id: 'stub', email: 'me@example.com', displayName: 'Me', color: '#000', addedAt: NOW },
    ],
    getThread: async (_key, getOpts) => {
      opts.hydrations?.push(getOpts?.hydrate)
      return { thread, messages: [message] }
    },
    getAttachment: async () => {
      opts.onFetch?.()
      return new Uint8Array(opts.attachmentSize ?? 10)
    },
    listThreads: async () => [thread],
    search: async () => [thread],
    ensureBodies: async () => [message],
    performAction: async () => {},
    modifyLabels: async () => {},
    addAccount: unsupported,
    removeAccount: unsupported,
    listLabels: async () => [],
    unreadCount: async () => 0,
    send: unsupported,
    refresh: async () => {},
    getSettings: unsupported,
    setSettings: unsupported,
    onEvent: () => () => {},
  } as MailService
}
