// The tool surface — two tools, deliberately.
//
// M3 owns the real eight (search_mail, read_thread, draft_reply, request_send
// and the rest). What M2 has to prove is that a frame leaving `claude mcp` on
// one side of a unix socket arrives at `AgentGateway.authorize` on the other,
// and comes back. Two tools prove that better than eight: one that needs a
// grant and one that does not, so both the allow path and the deny path are
// exercised by the transport itself rather than by a unit test standing in for
// it.
//
//   list_accounts  requires `read`. Ids, addresses and display names only —
//                  the list-summaries-then-fetch-detail shape the research
//                  notes record as the converged convention (§3).
//   wren_ping      requires nothing. Answers "am I connected, as whom, and
//                  what am I allowed to do" — the first question any agent
//                  operator asks, and one an agent with zero grants must be
//                  able to ask, or a fresh agent has no way to find out that
//                  it has no grants.
//
// Names are snake_case verb_noun, per §3. Annotations are set: a Wren-hosted
// server is a trusted server from its own client's point of view, so its
// annotations can legitimately be relied on.

import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { AgentGateway, Agent, Capability } from '../agents'
import { CAPABILITIES, liveGrants } from '../agents'
import type { MailService } from '../types'

export interface ToolContext {
  gateway: AgentGateway
  mail: MailService
  /** Resolved once, at connection time, from the credential. Never a claim. */
  agent: Agent
  appVersion: string
  now: () => number
}

export const TOOLS: Tool[] = [
  {
    name: 'list_accounts',
    title: 'List accounts',
    description:
      'List the mail accounts connected to Wren. Returns each account id, email address and display name. Account ids are what every other Wren tool takes; call this first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: {
      title: 'List accounts',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'wren_ping',
    title: 'Ping Wren',
    description:
      'Check the connection to Wren and report who this connection is authenticated as. Returns the Wren version, this agent name and the capabilities it currently holds. Needs no grant. Call this when a tool is refused, to see what has been granted.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: {
      title: 'Ping Wren',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
]

/** JSON in a text block. `structuredContent` carries the same object typed. */
function ok(payload: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  }
}

/**
 * A refusal is an ordinary answer, not an exception. The agent has to be able
 * to read it and say so — an MCP error would surface as a transport-level
 * failure and tell the model nothing about what to ask the human for.
 */
function denied(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

export async function callTool(
  name: string,
  ctx: ToolContext,
): Promise<CallToolResult> {
  switch (name) {
    case 'list_accounts':
      return listAccounts(ctx)
    case 'wren_ping':
      return ping(ctx)
    default:
      return denied(`Wren has no tool named ${name}.`)
  }
}

async function listAccounts(ctx: ToolContext): Promise<CallToolResult> {
  const { decision } = await ctx.gateway.authorize(ctx.agent.id, 'read', {
    tool: 'list_accounts',
  })
  // `authorize` has already written the blocked row; adding another here would
  // put every denial in the timeline twice.
  if (!decision.allowed) {
    return denied(
      `Wren refused list_accounts: ${ctx.agent.name} does not hold the read capability. Ask the person running Wren to grant it in Settings → Agents.`,
    )
  }

  const accounts = await ctx.mail.listAccounts()
  const payload = {
    accounts: accounts.map((account) => ({
      id: account.id,
      email: account.email,
      displayName: account.displayName,
    })),
  }
  await ctx.gateway.audit.append({
    agentId: ctx.agent.id,
    tool: 'list_accounts',
    summary: `Listed ${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}.`,
    outcome: 'ok',
  })
  return ok(payload)
}

async function ping(ctx: ToolContext): Promise<CallToolResult> {
  const grants = await ctx.gateway.grants.list(ctx.agent.id)
  const now = ctx.now()
  const held: Capability[] = CAPABILITIES.filter(
    (capability) => liveGrants(grants, capability, now).length > 0,
  )

  const payload = {
    app: 'Wren',
    version: ctx.appVersion,
    agent: { id: ctx.agent.id, name: ctx.agent.name },
    capabilities: held,
    // Named for the human reading the audit log over the operator's shoulder,
    // not for the model: "nothing yet" is the honest answer for a fresh agent.
    summary:
      held.length === 0
        ? `Connected as ${ctx.agent.name}. No capabilities granted yet.`
        : `Connected as ${ctx.agent.name}. Holds ${held.join(', ')}.`,
  }

  await ctx.gateway.audit.append({
    agentId: ctx.agent.id,
    tool: 'wren_ping',
    summary: 'Checked its connection and capabilities.',
    outcome: 'ok',
  })
  return ok(payload)
}
