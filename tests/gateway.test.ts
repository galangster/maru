// The MCP gateway — M2. Four suites, in the order a connection travels:
// framing, credential, protocol, authorisation.
//
// Everything below the relay seam runs here for real: the SDK's own Server,
// the real RelayTransport, the real GatewayServer and the real AgentGateway
// over the in-memory store demo mode ships. The only stand-in is the socket
// itself, which is Rust and is exercised by the live smoke instead.

import type { AgentEvent } from '../src/core/agents/types'
import { describe, it, expect, beforeEach } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'

import {
  AgentGateway,
  DEMO_AGENT,
  DEMO_AGENT_CREDENTIAL,
  MemoryAgentStore,
  seedDemoAgents,
} from '../src/core/agents'
import {
  encodeFrame,
  FrameReader,
  FrameTooLargeError,
  GatewayServer,
  MAX_FRAME_BYTES,
  parseFrame,
  RelayTransport,
  TOOLS,
  UNKNOWN_CREDENTIAL_ID,
} from '../src/core/gateway-server'
import type {
  AuthEvent,
  CloseEvent,
  FrameEvent,
  GatewayInfo,
  GatewayRelay,
} from '../src/core/gateway-server'
import { DemoMailService } from '../src/core'

// -- harness ------------------------------------------------------------------

/**
 * The relay, in memory. It records what the app pushed at the socket and lets
 * a test push frames the other way, which is exactly the surface Rust has.
 */
class MockRelay implements GatewayRelay {
  readonly verdicts: { connId: number; accepted: boolean; agentId?: string; message?: string }[] =
    []
  readonly outbound: { connId: number; frame: string }[] = []
  readonly closed: number[] = []

  private authCbs: ((event: AuthEvent) => void)[] = []
  private frameCbs: ((event: FrameEvent) => void)[] = []
  private closeCbs: ((event: CloseEvent) => void)[] = []

  async onAuth(cb: (event: AuthEvent) => void): Promise<() => void> {
    this.authCbs.push(cb)
    return () => {
      this.authCbs = this.authCbs.filter((h) => h !== cb)
    }
  }

  async onFrame(cb: (event: FrameEvent) => void): Promise<() => void> {
    this.frameCbs.push(cb)
    return () => {
      this.frameCbs = this.frameCbs.filter((h) => h !== cb)
    }
  }

  async onClose(cb: (event: CloseEvent) => void): Promise<() => void> {
    this.closeCbs.push(cb)
    return () => {
      this.closeCbs = this.closeCbs.filter((h) => h !== cb)
    }
  }

  async authResult(
    connId: number,
    verdict: { accepted: boolean; agentId?: string; message?: string },
  ): Promise<void> {
    this.verdicts.push({ connId, ...verdict })
  }

  async reply(connId: number, frame: string): Promise<void> {
    this.outbound.push({ connId, frame })
  }

  async close(connId: number): Promise<void> {
    this.closed.push(connId)
  }

  async info(): Promise<GatewayInfo> {
    return { socketPath: '/tmp/wren-test.sock', running: true, version: '0.1.0-test' }
  }

  // -- the socket's side --

  connect(connId: number, token: string): void {
    for (const cb of [...this.authCbs]) cb({ connId, frame: JSON.stringify({ token }) })
  }

  sendRaw(connId: number, agentId: string, frame: string): void {
    for (const cb of [...this.frameCbs]) cb({ connId, agentId, frame })
  }

  send(connId: number, agentId: string, message: unknown): void {
    this.sendRaw(connId, agentId, JSON.stringify(message))
  }

  hangUp(connId: number): void {
    for (const cb of [...this.closeCbs]) cb({ connId })
  }

  /** Every JSON-RPC message the app wrote to this connection. */
  messages(connId: number): Record<string, unknown>[] {
    return this.outbound
      .filter((entry) => entry.connId === connId)
      .map((entry) => parseFrame(entry.frame.trim()) as Record<string, unknown>)
  }

  reply_for(connId: number, id: number): Record<string, unknown> | undefined {
    return this.messages(connId).find((m) => m.id === id)
  }
}

/** Spin the event loop until `check` passes, or fail with what we did see. */
async function until(check: () => boolean, describeFailure: () => string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error(`Timed out waiting: ${describeFailure()}`)
}

interface Harness {
  relay: MockRelay
  gateway: AgentGateway
  server: GatewayServer
  mail: DemoMailService
}

const NOW = Date.parse('2026-08-29T09:00:00Z')

async function harness(): Promise<Harness> {
  const store = new MemoryAgentStore()
  await seedDemoAgents(store, NOW)
  const mail = new DemoMailService({ now: NOW })
  const gateway = new AgentGateway({ store, mail, now: () => NOW })
  await gateway.sessions.start(DEMO_AGENT.id, 60 * 60_000)
  const relay = new MockRelay()
  const server = await GatewayServer.start({
    relay,
    gateway,
    mail,
    appVersion: '0.1.0-test',
    now: () => NOW,
  })
  return { relay, gateway, server, mail }
}

/** Connect, handshake, and leave the session ready for tool calls. */
async function connected(h: Harness, connId: number, credential: string): Promise<void> {
  h.relay.connect(connId, credential)
  await until(
    () => h.relay.verdicts.some((v) => v.connId === connId),
    () => 'no auth verdict',
  )
  const verdict = h.relay.verdicts.find((v) => v.connId === connId)
  if (!verdict?.accepted || !verdict.agentId) throw new Error('the credential was refused')

  h.relay.send(connId, verdict.agentId, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'wren-test-harness', version: '9.9.9' },
    },
  })
  await until(
    () => h.relay.reply_for(connId, 1) !== undefined,
    () => 'no initialize response',
  )
  h.relay.send(connId, verdict.agentId, { jsonrpc: '2.0', method: 'notifications/initialized' })
}

function agentIdOf(h: Harness, connId: number): string {
  const verdict = h.relay.verdicts.find((v) => v.connId === connId)
  if (!verdict?.agentId) throw new Error('connection is not authenticated')
  return verdict.agentId
}

/** The JSON payload a tool returned, parsed back out of its text block. */
function toolPayload(response: Record<string, unknown>): Record<string, unknown> {
  const result = response.result as { content: { type: string; text: string }[] }
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

function toolText(response: Record<string, unknown>): string {
  const result = response.result as { content: { type: string; text: string }[] }
  return result.content[0].text
}

// -- 1. framing ---------------------------------------------------------------

describe('frames', () => {
  it('round-trips a message through encode and parse', () => {
    const message = { jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} }
    const frame = encodeFrame(message)
    expect(frame.endsWith('\n')).toBe(true)
    expect(parseFrame(frame.trim())).toEqual(message)
  })

  it('reassembles frames split across chunk boundaries', () => {
    const reader = new FrameReader()
    const frame = encodeFrame({ id: 1, method: 'ping' })
    const cut = Math.floor(frame.length / 2)

    expect(reader.push(frame.slice(0, cut))).toEqual([])
    expect(reader.pendingBytes).toBeGreaterThan(0)
    const done = reader.push(frame.slice(cut))
    expect(done).toHaveLength(1)
    expect(parseFrame(done[0])).toEqual({ id: 1, method: 'ping' })
    expect(reader.pendingBytes).toBe(0)
  })

  it('splits several frames out of one chunk and drops blank lines', () => {
    const reader = new FrameReader()
    const chunk = `${encodeFrame({ id: 1 })}\n${encodeFrame({ id: 2 })}`
    expect(reader.push(chunk).map((line) => parseFrame(line))).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('tolerates CRLF, which a Windows pipe can deliver', () => {
    const reader = new FrameReader()
    expect(reader.push('{"id":3}\r\n').map((line) => parseFrame(line))).toEqual([{ id: 3 }])
  })

  it('refuses to encode a frame over the cap', () => {
    const huge = { blob: 'x'.repeat(MAX_FRAME_BYTES + 10) }
    expect(() => encodeFrame(huge)).toThrow(FrameTooLargeError)
  })

  it('refuses to buffer a partial frame over the cap', () => {
    const reader = new FrameReader()
    expect(() => reader.push('x'.repeat(MAX_FRAME_BYTES + 1))).toThrow(FrameTooLargeError)
    // The buffer is dropped rather than kept: after an overflow the reader can
    // no longer tell where the next frame starts.
    expect(reader.pendingBytes).toBe(0)
  })

  it('returns null for a frame that is not JSON', () => {
    expect(parseFrame('not json')).toBeNull()
  })
})

// -- 2. the transport in isolation -------------------------------------------

describe('RelayTransport', () => {
  it('encodes outbound messages and reports inbound ones', async () => {
    const sent: string[] = []
    const transport = new RelayTransport(
      {
        send: async (frame) => {
          sent.push(frame)
        },
        close: async () => {},
      },
      'test-1',
    )
    const received: unknown[] = []
    transport.onmessage = (message) => received.push(message)
    await transport.start()

    await transport.send({ jsonrpc: '2.0', id: 1, result: {} })
    expect(sent).toEqual(['{"jsonrpc":"2.0","id":1,"result":{}}\n'])

    transport.deliver('{"jsonrpc":"2.0","id":2,"method":"ping"}\n')
    expect(received).toEqual([{ jsonrpc: '2.0', id: 2, method: 'ping' }])
  })

  it('reports a malformed frame without closing the session', async () => {
    const errors: Error[] = []
    const received: unknown[] = []
    const transport = new RelayTransport(
      { send: async () => {}, close: async () => {} },
      'test-2',
    )
    transport.onerror = (error) => errors.push(error)
    transport.onmessage = (message) => received.push(message)
    await transport.start()

    transport.deliver('nonsense')
    transport.deliver('{"jsonrpc":"2.0","id":9,"method":"ping"}')

    expect(errors).toHaveLength(1)
    // The frame after the bad one still lands: one malformed line from a buggy
    // client must not take a working session down with it.
    expect(received).toEqual([{ jsonrpc: '2.0', id: 9, method: 'ping' }])
  })

  it('fires onclose exactly once when the socket goes away', () => {
    let closes = 0
    const transport = new RelayTransport(
      { send: async () => {}, close: async () => {} },
      'test-3',
    )
    transport.onclose = () => {
      closes += 1
    }
    transport.handleDisconnect()
    transport.handleDisconnect()
    expect(closes).toBe(1)
  })
})

// -- 3. connection auth -------------------------------------------------------

describe('gateway auth', () => {
  let h: Harness

  beforeEach(async () => {
    h = await harness()
  })

  it('accepts a credential Wren issued and tags the connection with its agent', async () => {
    h.relay.connect(1, DEMO_AGENT_CREDENTIAL)
    await until(
      () => h.relay.verdicts.length === 1,
      () => 'no verdict',
    )

    expect(h.relay.verdicts[0]).toEqual({
      connId: 1,
      accepted: true,
      agentId: DEMO_AGENT.id,
    })

    const trail = await h.gateway.audit.query({ agentId: DEMO_AGENT.id })
    expect(trail.some((row) => row.tool === 'connected' && row.outcome === 'ok')).toBe(true)
  })

  it('refuses an unknown credential and writes an unattributable blocked row', async () => {
    h.relay.connect(2, 'wren_agent_not-a-real-token')
    await until(
      () => h.relay.verdicts.length === 1,
      () => 'no verdict',
    )

    expect(h.relay.verdicts[0].accepted).toBe(false)
    expect(h.relay.verdicts[0].agentId).toBeUndefined()
    expect(h.relay.verdicts[0].message).toMatch(/Settings/)

    const trail = await h.gateway.audit.query({ agentId: UNKNOWN_CREDENTIAL_ID })
    expect(trail).toHaveLength(1)
    expect(trail[0].tool).toBe('auth_failed')
    expect(trail[0].outcome).toBe('blocked')
    expect(h.server.sessionCount).toBe(0)
  })

  it('refuses a first frame that is not a credential at all', async () => {
    h.relay.connect(3, '')
    await until(
      () => h.relay.verdicts.length === 1,
      () => 'no verdict',
    )
    expect(h.relay.verdicts[0].accepted).toBe(false)
  })

  it('refuses a revoked agent, and says no more than it says to a wrong token', async () => {
    const issued = await h.gateway.createAgent('Temp')
    await h.gateway.revokeAgent(issued.agent.id)

    h.relay.connect(4, issued.credential)
    await until(
      () => h.relay.verdicts.length === 1,
      () => 'no verdict',
    )
    expect(h.relay.verdicts[0].accepted).toBe(false)
    expect(h.relay.verdicts[0].message).toMatch(/does not recognise/)
  })

  it('drops the session when the socket hangs up', async () => {
    await connected(h, 5, DEMO_AGENT_CREDENTIAL)
    expect(h.server.sessionCount).toBe(1)
    h.relay.hangUp(5)
    await until(
      () => h.server.sessionCount === 0,
      () => 'session still open',
    )
  })
})

// -- 4. the protocol over the relay ------------------------------------------

describe('MCP over the relay', () => {
  let h: Harness

  beforeEach(async () => {
    h = await harness()
  })

  it('answers initialize as wren and records the client it was told about', async () => {
    await connected(h, 10, DEMO_AGENT_CREDENTIAL)

    const response = h.relay.reply_for(10, 1) as {
      result: { serverInfo: { name: string; version: string }; capabilities: unknown }
    }
    expect(response.result.serverInfo.name).toBe('wren')
    expect(response.result.serverInfo.version).toBe('0.1.0-test')

    // clientInfo is display metadata: it reaches the audit log and nothing
    // else. No grant lookup anywhere takes a name the client chose for itself.
    let introduced: { tool: string; summary: string }[] = []
    await until(
      () => {
        void h.gateway.audit.query({ agentId: DEMO_AGENT.id }).then((rows) => {
          introduced = rows
        })
        return introduced.some((row) => row.tool === 'initialize')
      },
      () => `audit rows: ${introduced.map((r) => r.tool).join(', ')}`,
    )
    expect(introduced.find((row) => row.tool === 'initialize')?.summary).toContain(
      'wren-test-harness 9.9.9',
    )
  })

  it('lists the whole surface over the wire, snake_case and annotated', async () => {
    await connected(h, 11, DEMO_AGENT_CREDENTIAL)
    h.relay.send(11, agentIdOf(h, 11), { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    await until(
      () => h.relay.reply_for(11, 2) !== undefined,
      () => 'no tools/list response',
    )

    const result = h.relay.reply_for(11, 2)!.result as {
      tools: { name: string; annotations?: { readOnlyHint?: boolean } }[]
    }
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      'archive_thread',
      'draft_new',
      'draft_reply',
      'get_attachment',
      'list_accounts',
      'list_pending',
      'modify_labels',
      'read_thread',
      'request_send',
      'search_mail',
      'wren_ping',
    ])
    for (const tool of result.tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/)
      // Set on every tool, both ways: an unset hint is "unknown" per the spec,
      // and a client that has to guess will guess conservatively about mail.
      expect(typeof tool.annotations?.readOnlyHint).toBe('boolean')
    }
    expect(result.tools).toHaveLength(TOOLS.length)
  })

  it('answers wren_ping with the version and the capabilities the agent holds', async () => {
    await connected(h, 12, DEMO_AGENT_CREDENTIAL)
    h.relay.send(12, agentIdOf(h, 12), {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'wren_ping', arguments: {} },
    })
    await until(
      () => h.relay.reply_for(12, 3) !== undefined,
      () => 'no wren_ping response',
    )

    const payload = toolPayload(h.relay.reply_for(12, 3)!)
    expect(payload.app).toBe('Wren')
    expect(payload.version).toBe('0.1.0-test')
    expect(payload.agent).toEqual({ id: DEMO_AGENT.id, name: DEMO_AGENT.name })
    // Scout's seeded grants, in capability order.
    expect(payload.capabilities).toEqual(['read', 'draft', 'archiveLabel', 'send'])
  })

  it('answers list_accounts with ids, addresses, display names and label names', async () => {
    await connected(h, 13, DEMO_AGENT_CREDENTIAL)
    h.relay.send(13, agentIdOf(h, 13), {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'list_accounts', arguments: {} },
    })
    await until(
      () => h.relay.reply_for(13, 4) !== undefined,
      () => 'no list_accounts response',
    )

    const payload = toolPayload(h.relay.reply_for(13, 4)!) as {
      accounts: Record<string, unknown>[]
    }
    const expected = await h.mail.listAccounts()
    expect(payload.accounts).toHaveLength(expected.length)
    expect(payload.accounts.length).toBeGreaterThan(0)
    for (const account of payload.accounts) {
      expect(Object.keys(account).sort()).toEqual(['displayName', 'email', 'id', 'labels'])
    }
  })

  it('reports an unknown tool as a tool error rather than a protocol error', async () => {
    await connected(h, 14, DEMO_AGENT_CREDENTIAL)
    h.relay.send(14, agentIdOf(h, 14), {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'delete_everything', arguments: {} },
    })
    await until(
      () => h.relay.reply_for(14, 5) !== undefined,
      () => 'no response',
    )
    const response = h.relay.reply_for(14, 5)!
    expect((response.result as { isError?: boolean }).isError).toBe(true)
  })
})

// -- 5. authorisation ---------------------------------------------------------

describe('tool authorisation', () => {
  let h: Harness

  beforeEach(async () => {
    h = await harness()
  })

  it('refuses list_accounts to an agent with no read grant, and logs the block', async () => {
    const issued = await h.gateway.createAgent('Probe')
    await connected(h, 20, issued.credential)
    await h.gateway.sessions.start(issued.agent.id, 60 * 60_000)

    h.relay.send(20, issued.agent.id, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'list_accounts', arguments: {} },
    })
    await until(
      () => h.relay.reply_for(20, 6) !== undefined,
      () => 'no response',
    )

    const response = h.relay.reply_for(20, 6)!
    expect((response.result as { isError?: boolean }).isError).toBe(true)
    expect(toolText(response)).toMatch(/read capability/)

    const trail = await h.gateway.audit.query({ agentId: issued.agent.id })
    const blocked = trail.filter((row) => row.outcome === 'blocked')
    expect(blocked).toHaveLength(1)
    expect(blocked[0].tool).toBe('list_accounts')
    // The denial is written once, by `authorize`. A second row here would
    // double every refusal in the timeline.
    expect(blocked[0].summary).toMatch(/never been granted/)
  })

  it('still answers wren_ping for an agent that holds nothing', async () => {
    const issued = await h.gateway.createAgent('Probe')
    await connected(h, 21, issued.credential)

    h.relay.send(21, issued.agent.id, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'wren_ping', arguments: {} },
    })
    await until(
      () => h.relay.reply_for(21, 7) !== undefined,
      () => 'no response',
    )

    const payload = toolPayload(h.relay.reply_for(21, 7)!)
    expect(payload.capabilities).toEqual([])
    expect(payload.summary).toMatch(/No capabilities granted yet/)
  })

  it('grants take effect on the next call, without a reconnect', async () => {
    const issued = await h.gateway.createAgent('Probe')
    await connected(h, 22, issued.credential)
    await h.gateway.grant(issued.agent.id, 'read')
    await h.gateway.sessions.start(issued.agent.id, 60 * 60_000)

    h.relay.send(22, issued.agent.id, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'list_accounts', arguments: {} },
    })
    await until(
      () => h.relay.reply_for(22, 8) !== undefined,
      () => 'no response',
    )

    const response = h.relay.reply_for(22, 8)!
    expect((response.result as { isError?: boolean }).isError).toBeUndefined()
  })

  it('a revoked agent is refused mid-session', async () => {
    const issued = await h.gateway.createAgent('Probe')
    await h.gateway.grant(issued.agent.id, 'read')
    await connected(h, 23, issued.credential)
    await h.gateway.sessions.start(issued.agent.id, 60 * 60_000)
    await h.gateway.revokeAgent(issued.agent.id)

    h.relay.send(23, issued.agent.id, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'list_accounts', arguments: {} },
    })
    await until(
      () => h.relay.reply_for(23, 9) !== undefined,
      () => 'no response',
    )
    expect((h.relay.reply_for(23, 9)!.result as { isError?: boolean }).isError).toBe(true)
  })
})

describe('first-connection notice (M10)', () => {
  it('gives a fresh credential its own words and its own event, once', async () => {
    const h = await harness()
    const issued = await h.gateway.createAgent('Fresh')
    const events: AgentEvent[] = []
    h.gateway.onEvent((event) => {
      if (event.type === 'agentFirstConnected') events.push(event)
    })

    await connected(h, 41, issued.credential)
    let rows = await h.gateway.audit.query({ agentId: issued.agent.id })
    expect(rows.find((r) => r.tool === 'connected')?.summary).toBe(
      'Fresh connected for the first time.',
    )
    expect(events).toHaveLength(1)

    // The second connection is routine: plain words, no event.
    await connected(h, 42, issued.credential)
    rows = await h.gateway.audit.query({ agentId: issued.agent.id })
    const connections = rows.filter((r) => r.tool === 'connected').map((r) => r.summary)
    // The harness clock is frozen, so equal timestamps make the order between
    // the two rows unstable — the pin is one of each, and one event total.
    expect(connections.sort()).toEqual([
      'Fresh connected for the first time.',
      'Fresh connected over the local gateway socket.',
    ])
    expect(events).toHaveLength(1)

    await h.server.stop()
  })

  it('Scout, with a seeded history, never reads as first', async () => {
    const h = await harness()
    const events: AgentEvent[] = []
    h.gateway.onEvent((event) => {
      if (event.type === 'agentFirstConnected') events.push(event)
    })
    await connected(h, 43, DEMO_AGENT_CREDENTIAL)
    expect(events).toHaveLength(0)
    await h.server.stop()
  })
})
