// The live rig — the pieces a test needs to drive the product from outside.
//
// Extracted from the M3 smoke so the M4 triage test is the same product path
// rather than a second copy of it: a real unix domain socket on disk, the real
// `bin/wren-mcp.mjs` shim launched as a child process exactly as an agent host
// launches it, the real `GatewayServer`, the real `AgentGateway` over the store
// demo mode seeds, and the real `DemoMailService` underneath.
//
// One thing is stood in for: `src-tauri/src/gateway.rs`, which cannot run
// inside a Node test. `SocketRelay` below is the same contract in ~60 lines —
// first frame is the credential, `{"type":"auth_ok"}` acknowledges it, and
// every later line is relayed tagged with the agent that credential resolved
// to. The Rust implementation is the one the app ships; this one is the one
// that lets a test assert the steps no tool can reach: a human approving a
// queued send, and the mail actually going out.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach } from 'vitest'

import {
  AgentGateway,
  DEMO_AGENT_CREDENTIAL,
  MemoryAgentStore,
  seedDemoAgents,
} from '../../src/core/agents'
import type { AuditEntry } from '../../src/core/agents/types'
import { FrameReader, GatewayServer, encodeFrame } from '../../src/core/gateway-server'
import type {
  AuthEvent,
  CloseEvent,
  FrameEvent,
  GatewayInfo,
  GatewayRelay,
} from '../../src/core/gateway-server'
import { DemoMailService } from '../../src/core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SHIM = join(ROOT, 'bin/wren-mcp.mjs')

/**
 * The real shim, launched exactly as an agent host launches it. The one place
 * that knows its argument contract; a test that studies the process itself
 * (exit codes, stderr) takes the child from here.
 */
export function spawnShim(socketPath: string, token: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [SHIM, '--token', token, '--socket', socketPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

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

  constructor(
    readonly socketPath: string,
    private readonly version: string,
  ) {}

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
    return { socketPath: this.socketPath, running: true, version: this.version }
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
  private nextId = 1

  constructor(socketPath: string, token: string) {
    this.child = spawnShim(socketPath, token)
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => {
      for (const frame of this.reader.push(chunk)) {
        const message = JSON.parse(frame) as Record<string, unknown>
        const id = message.id as number | undefined
        if (id !== undefined) this.pending.get(id)?.(message)
      }
    })
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

/** The draft payload `draft_new` and `draft_reply` hand back over the wire. */
export interface Draft {
  account_id: string
  to: { email: string }[]
  cc: { email: string }[]
  subject: string
  body_html: string
  reply: Record<string, string>
}

/** `request_send`, fed from a draft exactly as a well-behaved agent feeds it. */
export function requestSend(client: ShimClient, draft: Draft): Promise<Record<string, unknown>> {
  return client.call('request_send', {
    account_id: draft.account_id,
    to: draft.to.map((a) => a.email),
    cc: draft.cc.map((a) => a.email),
    subject: draft.subject,
    body_html: draft.body_html,
    reply: draft.reply,
  })
}

export interface RigCore {
  relay: SocketRelay
  server: GatewayServer
  gateway: AgentGateway
  mail: DemoMailService
  socketPath: string
}

export interface Rig extends RigCore {
  client: ShimClient
}

/**
 * The app's half: store seeded as demo mode seeds it, mail, gateway, relay on
 * a real socket, server. No shim — a test that studies the handshake itself
 * spawns its own with `spawnShim`.
 *
 * The clock is monotonic rather than frozen: the trail assertions are about
 * the *order* of rows, and a frozen clock gives every row the same timestamp.
 */
export async function bootCore(base: number, version: string): Promise<RigCore> {
  // Short and outside the repo: a unix socket path has ~104 bytes to live in.
  const socketPath = `/tmp/wren-smoke-${randomBytes(4).toString('hex')}.sock`
  const store = new MemoryAgentStore()
  await seedDemoAgents(store, base)
  const mail = new DemoMailService({ now: base })
  let tick = base
  const gateway = new AgentGateway({ store, mail, now: () => ++tick })

  const relay = new SocketRelay(socketPath, version)
  await relay.listen()
  const server = await GatewayServer.start({
    relay,
    gateway,
    mail,
    appVersion: version,
    now: () => tick,
  })
  return { relay, server, gateway, mail, socketPath }
}

export async function stopCore(core: RigCore): Promise<void> {
  await core.server.stop()
  await core.relay.stop()
  await rm(core.socketPath, { force: true })
}

/**
 * The whole rig with its teardown owned here: call at the test file's top
 * level (it registers the `afterEach`), and the returned boot gives back a
 * connected rig — shim up, MCP handshake done.
 */
export function useLiveRig(): (base: number, version: string) => Promise<Rig> {
  let rig: Rig | null = null

  afterEach(async () => {
    if (!rig) return
    rig.client.stop()
    await stopCore(rig)
    rig = null
  })

  return async (base, version) => {
    const core = await bootCore(base, version)
    const client = new ShimClient(core.socketPath, DEMO_AGENT_CREDENTIAL)
    await client.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'wren-live-smoke', version: '1.0.0' },
    })
    client.notify('notifications/initialized')
    rig = { ...core, client }
    return rig
  }
}

/** The agent's rows since `base`, oldest first — the trail as the human reads it. */
export async function trailSince(
  gateway: AgentGateway,
  agentId: string,
  base: number,
): Promise<AuditEntry[]> {
  const rows = await gateway.audit.query({ agentId })
  return rows
    .slice()
    .reverse()
    .filter((row) => row.at > base)
}

/** Printed so the gate's operator can read the arc rather than infer it. */
export function printTrail(label: string, trail: AuditEntry[]): void {
  console.log(`\n--- ${label} ---`)
  for (const row of trail)
    console.log(`${row.tool.padEnd(14)} ${row.outcome.padEnd(8)} ${row.summary}`)
  console.log('--- end ---\n')
}
