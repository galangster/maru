// One MCP server per connection.
//
// A session exists only after the credential resolved to an Agent, so every
// object in here can take that Agent as a given. It is held for the life of
// the connection and never re-derived from anything the client sends — the
// discipline registry.ts asks M2 for, in one place where it can be read.
//
// `clientInfo` from `initialize` is captured here and goes exactly one place:
// the audit log, as display metadata on the `connected` row. It never reaches
// a grant lookup. docs/research/mcp-gateway-notes.md §2 — it is self-reported,
// SEP-1289 is open and dormant, and a name anyone can type is not an identity.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import type { Agent, AgentGateway } from '../agents'
import type { MailService } from '../types'
import { RelayTransport, type FrameLink } from './transport'
import { callTool, TOOLS, type ToolContext } from './tools'

export interface SessionDeps {
  connId: number
  agent: Agent
  gateway: AgentGateway
  mail: MailService
  appVersion: string
  now: () => number
  link: FrameLink
}

/** What the audit row says about a client that has just introduced itself. */
function describeClient(info: { name?: string; version?: string } | undefined): string {
  if (!info?.name) return 'an unnamed client'
  return info.version ? `${info.name} ${info.version}` : info.name
}

export class GatewaySession {
  readonly transport: RelayTransport
  readonly server: Server

  private constructor(private readonly deps: SessionDeps) {
    this.transport = new RelayTransport(deps.link, `wren-${deps.connId}`)
    this.server = new Server(
      { name: 'wren', title: 'Wren', version: deps.appVersion },
      {
        capabilities: { tools: {} },
        instructions:
          'Wren is a local-first mail client. Every tool call is authorised against the capabilities the person running Wren granted this agent, and anything that leaves the machine waits for their approval. Call wren_ping to see what this connection currently holds.',
      },
    )

    this.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }))
    this.server.setRequestHandler(CallToolRequestSchema, (request) =>
      callTool(request.params.name, this.context(), request.params.arguments),
    )

    // Fires once the client's `initialized` notification lands, which is the
    // first moment `getClientVersion()` has anything in it.
    this.server.oninitialized = () => {
      const client = this.server.getClientVersion()
      void this.deps.gateway.audit.append({
        agentId: this.deps.agent.id,
        tool: 'initialize',
        summary: `Introduced itself as ${describeClient(client)}.`,
        outcome: 'ok',
      })
    }
  }

  static async open(deps: SessionDeps): Promise<GatewaySession> {
    const session = new GatewaySession(deps)
    await session.server.connect(session.transport)
    return session
  }

  /** One inbound frame from the relay. */
  deliver(frame: string): void {
    this.transport.deliver(frame)
  }

  /** The socket went away. Tears the protocol layer down without writing. */
  handleDisconnect(): void {
    this.transport.handleDisconnect()
  }

  async close(): Promise<void> {
    await this.server.close()
  }

  private context(): ToolContext {
    return {
      gateway: this.deps.gateway,
      mail: this.deps.mail,
      agent: this.deps.agent,
      appVersion: this.deps.appVersion,
      now: this.deps.now,
    }
  }
}
