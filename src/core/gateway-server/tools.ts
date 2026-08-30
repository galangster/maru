// The tool surface — eleven tools, and the one path all of them take.
//
// M2 shipped two as transport proof. M3 is the surface itself: search, read,
// get an attachment, draft, ask to send, triage, and see what you asked for.
//
//   search_mail      read          summaries, never bodies
//   read_thread      read          one thread, plain text, capped
//   get_attachment   read          one file, base64, capped
//   list_accounts    read          ids, addresses, display names
//   draft_new        draft         a normalised draft, sent nowhere
//   draft_reply      draft         the composer's own reply rules
//   request_send     send*         queues for a human; never dispatches
//   archive_thread   archiveLabel  inbox in, inbox out, trash, untrash
//   modify_labels    archiveLabel  STARRED and UNREAD
//   list_pending     —             an agent's own submissions
//   wren_ping        —             am I connected, and what do I hold
//
// * `request_send` is authorised inside `AgentGateway.requestSend`, per
//   recipient, because M1 rule 9 needs the recipient list and one grant has to
//   admit every one of them. Every other tool is authorised here, once.
//
// THE SHARED PATH. `callTool` is the only place that authorises and the only
// place that writes to the audit log. A handler returns the row it wants and
// never appends one itself, so:
//
//   · a denial is logged exactly once, by `authorize`, which already writes it
//   · a success is logged exactly once, here
//   · a refusal is logged exactly once, here, unless a seam already did it
//
// Two rows for one call is the failure this shape exists to make impossible:
// the timeline is the human's only account of what an agent did, and a
// timeline that double-counts is one nobody can read for a number.
//
// Names are snake_case verb_noun and annotations are set, per the research
// notes §3. A Wren-hosted server is a trusted server from its own client's
// point of view, so its annotations can legitimately be relied on — which is
// exactly why `archive_thread` admits that it is destructive and
// `request_send` admits that it is not idempotent.

import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { Capability } from '../agents'
import type { Decision } from '../agents/grants'
import { READ_TOOLS } from './tools-read'
import { WRITE_TOOLS } from './tools-write'
import {
  argsOf,
  denied,
  ok,
  ToolRefusal,
  type ToolContext,
  type ToolSpec,
} from './tool-support'

export type { ToolContext, ToolSpec } from './tool-support'
export { ToolRefusal } from './tool-support'

const SPECS: ToolSpec[] = [...READ_TOOLS, ...WRITE_TOOLS]

const BY_NAME = new Map(SPECS.map((spec) => [spec.tool.name, spec]))

/** What `tools/list` answers with. */
export const TOOLS: Tool[] = SPECS.map((spec) => spec.tool)

/** The grant each tool needs, for the docs table and for the tests. */
export const TOOL_CAPABILITIES: Record<string, Capability | null> = Object.fromEntries(
  SPECS.map((spec) => [spec.tool.name, spec.capability]),
)

/**
 * Why a grant refused, in a sentence that says what to do about it.
 *
 * The agent is the reader. It cannot grant itself anything, so the useful
 * content is which capability is missing and who can hand it over.
 */
function grantDenial(tool: string, capability: Capability, agentName: string, decision: Decision): string {
  const reason = decision.allowed ? 'no-grant' : decision.reason
  const head = `Wren refused ${tool}: `
  const ask = 'Ask the person running Wren to grant it in Settings → Agents.'
  switch (reason) {
    case 'agent-revoked':
      return `${head}${agentName} has been revoked. Nothing will be accepted on this connection.`
    case 'revoked':
      return `${head}${agentName} held the ${capability} capability and it was revoked. ${ask}`
    default:
      return `${head}${agentName} does not hold the ${capability} capability. ${ask}`
  }
}

/**
 * One tool call, start to finish.
 *
 * `rawArgs` is whatever arrived in `params.arguments` — unvalidated, possibly
 * absent, possibly not an object. Every handler reads it through the checked
 * readers in tool-support.ts rather than trusting `inputSchema`, which the
 * spec does not oblige a client to enforce.
 */
export async function callTool(
  name: string,
  ctx: ToolContext,
  rawArgs?: unknown,
): Promise<CallToolResult> {
  const spec = BY_NAME.get(name)
  if (!spec) {
    await ctx.gateway.audit.append({
      agentId: ctx.agent.id,
      tool: name,
      summary: `Called ${name}, which Wren does not have.`,
      outcome: 'error',
    })
    return denied(
      `Wren has no tool named ${name}. It has: ${TOOLS.map((tool) => tool.name).join(', ')}.`,
    )
  }

  if (spec.restricted && !(await ctx.gateway.sessions.active(ctx.agent.id))) {
    await ctx.gateway.audit.append({
      agentId: ctx.agent.id,
      tool: name,
      summary: `Blocked: no active session, so ${name} is refused.`,
      threadKey: threadKeyOf(rawArgs),
      outcome: 'blocked',
    })
    ctx.gateway.requestSession(ctx.agent.id, ctx.agent.name)
    return denied(
      `Wren refused ${name}: no agent session is active. Sessions are a time-bounded consent the person running Wren starts in Settings → Agents. Ask them to start one; wren_ping shows session state.`,
    )
  }

  if (spec.capability) {
    const { decision } = await ctx.gateway.authorize(ctx.agent.id, spec.capability, {
      tool: name,
      threadKey: threadKeyOf(rawArgs),
    })
    // `authorize` has already written the blocked row; adding another here
    // would put every denial in the timeline twice.
    if (!decision.allowed) {
      return denied(grantDenial(name, spec.capability, ctx.agent.name, decision))
    }
  }

  try {
    const outcome = await spec.handler(ctx, argsOf(rawArgs))
    if (outcome.audit) {
      await ctx.gateway.audit.append({
        agentId: ctx.agent.id,
        tool: name,
        summary: outcome.audit.summary,
        threadKey: outcome.audit.threadKey,
        outcome: outcome.audit.outcome ?? 'ok',
      })
    }
    return ok(outcome.payload)
  } catch (cause) {
    const refusal =
      cause instanceof ToolRefusal
        ? cause
        : new ToolRefusal(
            `Wren could not finish ${name}: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
    if (!refusal.logged) {
      await ctx.gateway.audit.append({
        agentId: ctx.agent.id,
        tool: name,
        summary: `Refused: ${refusal.message}`,
        threadKey: refusal.threadKey ?? threadKeyOf(rawArgs),
        outcome: refusal.outcome,
      })
    }
    return denied(refusal.message)
  }
}

/**
 * The thread a call is about, if its arguments name one.
 *
 * Read defensively rather than validated: this runs *before* the handler, to
 * hang a blocked row on the right thread in the timeline, and a refusal whose
 * arguments were nonsense still has to be logged against something.
 */
function threadKeyOf(rawArgs: unknown): string | undefined {
  if (rawArgs === null || typeof rawArgs !== 'object') return undefined
  const key = (rawArgs as { thread_key?: unknown }).thread_key
  return typeof key === 'string' && key !== '' ? key : undefined
}
