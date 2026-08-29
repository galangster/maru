// The live smoke — M3's final gate, and the only test that leaves the process.
//
// Everything else in this suite drives objects. This one drives the product:
// a real unix domain socket on disk, the real `bin/wren-mcp.mjs` shim launched
// as a child process exactly as an agent host launches it, the real MCP SDK
// client handshake over its stdio, the real `GatewayServer`, the real
// `AgentGateway` over the store demo mode seeds, and the real
// `DemoMailService` underneath.
//
// One thing is stood in for: `src-tauri/src/gateway.rs`, which cannot run
// inside a Node test. `SocketRelay` below is the same contract in ~60 lines —
// first frame is the credential, `{"type":"auth_ok"}` acknowledges it, and
// every later line is relayed tagged with the agent that credential resolved
// to. The Rust implementation is the one the app ships; this one is the one
// that lets a test assert the whole arc, including the two steps no tool can
// reach: a human approving a queued send, and the mail actually going out.
//
// The arc it asserts, connected end to end:
//
//   connect → search_mail → read_thread → draft_reply → request_send
//           → (a person approves in Wren) → sent → the audit trail says so
//
// Run it on its own, with output, as the gate:
//
//   npx vitest run tests/smoke-live.test.ts --reporter=verbose

import { describe, it, expect, afterEach } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AgentGateway,
  DEMO_AGENT,
  DEMO_AGENT_CREDENTIAL,
  MemoryAgentStore,
  seedDemoAgents,
} from '../src/core/agents'
import type { AuditEntry } from '../src/core/agents/types'
import { FrameReader, GatewayServer, encodeFrame } from '../src/core/gateway-server'
import type { AuthEvent, CloseEvent, FrameEvent, GatewayInfo, GatewayRelay } from '../src/core/gateway-server'
import { DemoMailService } from '../src/core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHIM = join(ROOT, 'bin/wren-mcp.mjs')
const APP_VERSION = '0.1.0-smoke'
const BASE = Date.parse('2026-08-29T09:00:00Z')

/**
 * The relay contract of `src-tauri/src/gateway.rs`, over a real socket.
 *
 * Deliberately not clever: it exists so the shim on the other end is talking
 * to something that behaves exactly like the app, and so the *frames* are
 * real. Anything smarter here would be testing this file.
 */
class SocketRelay implements GatewayRelay {
  private readonly server = net.createServer()
  private readonly conns = new Map<number, net.Socket>()
  private readonly agents = new Map<number, string>()
  private nextId = 1

  private authCbs: ((event: AuthEvent) => void)[] = []
  private frameCbs: ((event: FrameEvent) => void)[] = []
  private closeCbs: ((event: CloseEvent) => void)[] = []

  constructor(readonly socketPath: string) {}

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.socketPath, () => {
        this.server.on('connection', (socket) => this.accept(socket))
        resolve()
      })
    })
  }

  private accept(socket: net.Socket): void {
    const connId = this.nextId++
    this.conns.set(connId, socket)
    socket.setEncoding('utf8')
    const reader = new FrameReader()
    let authenticated = false

    socket.on('data', (chunk: string) => {
      for (const frame of reader.push(chunk)) {
        if (!authenticated) {
          authenticated = true
          for (const cb of [...this.authCbs]) cb({ connId, frame })
          continue
        }
        // The agent id comes from the credential this connection resolved to,
        // never from the frame. That is the whole point of the relay.
        const agentId = this.agents.get(connId) ?? ''
        for (const cb of [...this.frameCbs]) cb({ connId, agentId, frame })
      }
    })
    socket.on('close', () => {
      this.conns.delete(connId)
      this.agents.delete(connId)
      for (const cb of [...this.closeCbs]) cb({ connId })
    })
    socket.on('error', () => socket.destroy())
  }

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
    const socket = this.conns.get(connId)
    if (!socket) return
    if (verdict.accepted && verdict.agentId) {
      this.agents.set(connId, verdict.agentId)
      socket.write(encodeFrame({ type: 'auth_ok', message: 'connected' }))
      return
    }
    socket.write(encodeFrame({ type: 'auth_failed', message: verdict.message ?? 'refused' }))
    socket.end()
  }

  async reply(connId: number, frame: string): Promise<void> {
    this.conns.get(connId)?.write(frame.endsWith('\n') ? frame : `${frame}\n`)
  }

  async close(connId: number): Promise<void> {
    this.conns.get(connId)?.end()
  }

  async info(): Promise<GatewayInfo> {
    return { socketPath: this.socketPath, running: true, version: APP_VERSION }
  }

  async stop(): Promise<void> {
    for (const socket of this.conns.values()) socket.destroy()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}

/** The agent's side: one shim process, spoken to over stdio, like a host does. */
class ShimClient {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly reader = new FrameReader()
  private readonly pending = new Map<number, (message: Record<string, unknown>) => void>()
  readonly stderr: string[] = []
  private nextId = 1

  constructor(socketPath: string, token: string) {
    this.child = spawn(process.execPath, [SHIM, '--token', token, '--socket', socketPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => {
      for (const frame of this.reader.push(chunk)) {
        const message = JSON.parse(frame) as Record<string, unknown>
        const id = message.id as number | undefined
        if (id !== undefined) this.pending.get(id)?.(message)
      }
    })
    this.child.stderr.on('data', (chunk: string) => this.stderr.push(chunk))
  }

  request(method: string, params?: unknown): Promise<Record<string, unknown>> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 10_000)
      this.pending.set(id, (message) => {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve(message)
      })
      this.child.stdin.write(encodeFrame({ jsonrpc: '2.0', id, method, params }))
    })
  }

  notify(method: string, params?: unknown): void {
    this.child.stdin.write(encodeFrame({ jsonrpc: '2.0', method, params }))
  }

  /** A tool call, with its JSON payload already parsed back out. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const response = await this.request('tools/call', { name, arguments: args })
    const result = response.result as
      | { content: { text: string }[]; isError?: boolean }
      | undefined
    if (!result) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`)
    if (result.isError) throw new Error(`${name} refused: ${result.content[0].text}`)
    return JSON.parse(result.content[0].text) as Record<string, unknown>
  }

  stop(): void {
    this.child.stdin.end()
    this.child.kill()
  }
}

interface Rig {
  relay: SocketRelay
  server: GatewayServer
  gateway: AgentGateway
  mail: DemoMailService
  client: ShimClient
  socketPath: string
}

let rig: Rig | null = null

afterEach(async () => {
  if (!rig) return
  rig.client.stop()
  await rig.server.stop()
  await rig.relay.stop()
  await rm(rig.socketPath, { force: true })
  rig = null
})

async function boot(): Promise<Rig> {
  // Short and outside the repo: a unix socket path has ~104 bytes to live in.
  const socketPath = `/tmp/wren-smoke-${randomBytes(4).toString('hex')}.sock`
  const store = new MemoryAgentStore()
  await seedDemoAgents(store, BASE)
  const mail = new DemoMailService({ now: BASE })
  // Monotonic rather than frozen: the assertion at the end is about the *order*
  // of the trail, and a frozen clock gives every row the same timestamp.
  let tick = BASE
  const gateway = new AgentGateway({ store, mail, now: () => ++tick })

  const relay = new SocketRelay(socketPath)
  await relay.listen()
  const server = await GatewayServer.start({
    relay,
    gateway,
    mail,
    appVersion: APP_VERSION,
    now: () => tick,
  })
  const client = new ShimClient(socketPath, DEMO_AGENT_CREDENTIAL)

  await client.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'wren-live-smoke', version: '1.0.0' },
  })
  client.notify('notifications/initialized')

  rig = { relay, server, gateway, mail, client, socketPath }
  return rig
}

describe('live smoke: shim, socket, tools, approval, send', () => {
  it('carries an agent from search to a sent message, and writes the arc down', async () => {
    const { client, gateway, mail } = await boot()

    // 1. The surface arrives over the socket.
    const listed = (await client.request('tools/list')).result as { tools: { name: string }[] }
    expect(listed.tools.map((t) => t.name)).toContain('request_send')

    // 2. search_mail — summaries only.
    const search = (await client.call('search_mail', { query: 'latency', limit: 5 })) as {
      threads: { thread_key: string; subject: string }[]
    }
    const hit = search.threads.find((t) => t.subject.includes('p95 latency'))
    expect(hit).toBeDefined()
    expect(JSON.stringify(search)).not.toContain('<p')

    // 3. read_thread — plain text, hydrated.
    const thread = (await client.call('read_thread', { thread_key: hit!.thread_key })) as {
      messages: { id: string; body_text: string }[]
    }
    expect(thread.messages.length).toBeGreaterThan(0)
    expect(thread.messages[0].body_text.length).toBeGreaterThan(0)

    // 4. draft_reply — the composer's own rules, nothing stored.
    const drafted = (await client.call('draft_reply', {
      thread_key: hit!.thread_key,
      mode: 'replyAll',
      body_markdown: 'Persisting the index sounds right. **Ship it** if it is under a gigabyte.',
    })) as {
      draft: {
        account_id: string
        to: { email: string }[]
        cc: { email: string }[]
        subject: string
        body_html: string
        reply: Record<string, string>
      }
    }
    expect(drafted.draft.subject).toMatch(/^Re: /)
    expect(drafted.draft.body_html).toContain('<strong>Ship it</strong>')

    // 5. request_send — queued for a human, dispatched to nobody.
    const sentBefore = await mail.listThreads({ kind: 'unified', folder: 'sent' })
    const requested = (await client.call('request_send', {
      account_id: drafted.draft.account_id,
      to: drafted.draft.to.map((a) => a.email),
      cc: drafted.draft.cc.map((a) => a.email),
      subject: drafted.draft.subject,
      body_html: drafted.draft.body_html,
      reply: drafted.draft.reply,
    })) as { approval_id: string; status: string }
    expect(requested.status).toBe('pending')
    expect(await mail.listThreads({ kind: 'unified', folder: 'sent' })).toHaveLength(
      sentBefore.length,
    )

    // 6. The approval really landed in the queue — asked over the wire, and
    //    asked of the gateway itself.
    const seen = (await client.call('list_pending')) as {
      requests: { approval_id: string; status: string }[]
    }
    expect(seen.requests.find((r) => r.approval_id === requested.approval_id)?.status).toBe(
      'pending',
    )
    const queued = await gateway.approvals.listPending()
    expect(queued.map((a) => a.id)).toContain(requested.approval_id)

    // 7. A person approves it in Wren. There is no tool for this, on purpose.
    const approved = await gateway.approvals.approve(requested.approval_id)
    expect(approved.status).toBe('approved')

    // 8. It went out: the demo mailbox's Sent list carries it.
    const sentAfter = await mail.listThreads({ kind: 'unified', folder: 'sent' })
    expect(sentAfter.length).toBeGreaterThan(sentBefore.length)
    // A reply joins the thread it answers, so Sent gains that thread rather
    // than a new one titled "Re: …" — the same behaviour the composer has.
    expect(sentAfter.map((t) => t.key)).toContain(hit!.thread_key)
    const conversation = await mail.getThread(hit!.thread_key)
    const outgoing = conversation.messages[conversation.messages.length - 1]
    expect(outgoing.bodyHtml).toContain('<strong>Ship it</strong>')
    expect(outgoing.subject).toBe(drafted.draft.subject)

    // 9. The trail, connected, in order.
    const trail: AuditEntry[] = (await gateway.audit.query({ agentId: DEMO_AGENT.id }))
      .slice()
      .reverse()
      .filter((row) => row.at > BASE)

    expect(trail.map((row) => row.tool)).toEqual([
      'connected',
      'initialize',
      'search_mail',
      'read_thread',
      'draft_reply',
      'request_send',
      'list_pending',
      'send',
    ])
    expect(trail.map((row) => row.outcome)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'pending',
      'ok',
      'ok',
    ])

    // Printed so the gate's operator can read the arc rather than infer it.
    console.log('\n--- audit trail ---')
    for (const row of trail) console.log(`${row.tool.padEnd(14)} ${row.outcome.padEnd(8)} ${row.summary}`)
    console.log('--- end ---\n')
  }, 30_000)

  it('refuses a credential Wren never issued, and the shim exits 4', async () => {
    const socketPath = `/tmp/wren-smoke-${randomBytes(4).toString('hex')}.sock`
    const store = new MemoryAgentStore()
    await seedDemoAgents(store, BASE)
    const mail = new DemoMailService({ now: BASE })
    const gateway = new AgentGateway({ store, mail, now: () => BASE })
    const relay = new SocketRelay(socketPath)
    await relay.listen()
    const server = await GatewayServer.start({
      relay,
      gateway,
      mail,
      appVersion: APP_VERSION,
      now: () => BASE,
    })

    const child = spawn(process.execPath, [SHIM, '--token', 'wren_agent_nope', '--socket', socketPath])
    const code = await new Promise<number>((resolve) => child.on('exit', (value) => resolve(value ?? -1)))
    expect(code).toBe(4)

    await server.stop()
    await relay.stop()
    await rm(socketPath, { force: true })
  }, 30_000)
})
