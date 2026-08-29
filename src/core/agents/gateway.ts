// The trust substrate, assembled. One object the UI holds and M2's MCP server
// will hold, over the same four modules.
//
// The gateway owns three things the modules deliberately do not: the clock,
// the id generator, and the event bus. Injecting all three at this one seam is
// what lets the whole substrate run deterministically under test and under a
// frozen screenshot clock, without any module reaching for `Date.now()`.

import type { ComposeDraft } from '../types'
import type { SqlDb } from '../platform'
import { AuditLog } from './audit'
import { evaluate, recipientsOf, GrantBook, type Decision, type DenyReason } from './grants'
import { AgentRegistry } from './registry'
import { ApprovalQueue, type SendSeam } from './approvals'
import { SqlAgentStore, publicAgent } from './store'
import type { Agent, AgentEvent, AgentStore, Approval, Capability, Grant } from './types'

export interface AgentGatewayOptions {
  store: AgentStore
  /** Only `send` is used, and only from `ApprovalQueue.approve`. */
  mail: SendSeam
  /** Frozen for captures and tests; `Date.now` otherwise. */
  now?: () => number
  /** Deterministic ids for fixtures and tests. */
  id?: () => string
}

/** `crypto.randomUUID` where it exists, and a counter where it does not. */
function defaultIdFactory(): () => string {
  let n = 0
  return () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    n += 1
    return `id-${Date.now().toString(36)}-${n}`
  }
}

/**
 * What a tool call gets back. `authorize` never throws on a denial — a denial
 * is an ordinary answer that the agent has to be able to read and report.
 */
export interface AuthorizeResult {
  decision: Decision
  agent: Agent | null
}

export class AgentGateway {
  readonly registry: AgentRegistry
  readonly grants: GrantBook
  readonly approvals: ApprovalQueue
  readonly audit: AuditLog

  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private readonly store: AgentStore
  private readonly clock: () => number

  constructor(opts: AgentGatewayOptions) {
    const now = opts.now ?? (() => Date.now())
    const id = opts.id ?? defaultIdFactory()
    this.store = opts.store
    this.clock = now

    const emit = (event: AgentEvent) => this.emit(event)

    // One log, shared by every module: an action that is not written down did
    // not happen, as far as the human is concerned. `onAppend` is what puts
    // each row on the bus, so no caller of `append` has to remember to emit.
    this.audit = new AuditLog({
      store: opts.store,
      now,
      id,
      onAppend: (entry) => emit({ type: 'auditAppended', entry }),
    })

    this.registry = new AgentRegistry({ store: opts.store, audit: this.audit, now, id })
    this.grants = new GrantBook({ store: opts.store, now })
    this.approvals = new ApprovalQueue({
      store: opts.store,
      audit: this.audit,
      mail: opts.mail,
      nameOf: (agentId) => this.nameOf(agentId),
      emit,
      now,
      id,
    })
  }

  // -- events -----------------------------------------------------------------

  /** Returns an unsubscribe function, exactly like MailService.onEvent. */
  onEvent(cb: (event: AgentEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(event: AgentEvent): void {
    for (const cb of [...this.listeners]) cb(event)
  }

  // -- identity and grants ----------------------------------------------------

  /** The name the log and the queue print. Falls back to the id, never blank. */
  async nameOf(agentId: string): Promise<string> {
    const record = await this.store.getAgent(agentId)
    return record?.name ?? agentId
  }

  /**
   * Create an agent and, in one step, tell the human it exists. The credential
   * is inside the returned object and is never emitted, logged or stored.
   */
  async createAgent(name: string) {
    const issued = await this.registry.create(name)
    this.emit({ type: 'agentsChanged' })
    return issued
  }

  async revokeAgent(id: string): Promise<void> {
    await this.registry.revoke(id)
    this.emit({ type: 'agentsChanged' })
  }

  async grant(...args: Parameters<GrantBook['grant']>): Promise<Grant> {
    const grant = await this.grants.grant(...args)
    await this.audit.append({
      agentId: grant.agentId,
      tool: 'grant.set',
      summary: `You granted ${grant.capability}${describeScope(grant)}.`,
      outcome: 'ok',
    })
    this.emit({ type: 'agentsChanged' })
    return grant
  }

  async revokeGrant(agentId: string, capability: Capability): Promise<void> {
    await this.grants.revoke(agentId, capability)
    await this.audit.append({
      agentId,
      tool: 'grant.revoke',
      summary: `You revoked ${capability}.`,
      outcome: 'ok',
    })
    this.emit({ type: 'agentsChanged' })
  }

  // -- the M2 seam ------------------------------------------------------------

  /**
   * The one question every tool call asks: may this credential do this, to
   * these recipients, now?
   *
   * M2 calls `registry.verifyCredential` once per connection and then calls
   * this per tool call with the resolved agent id. It is written to be safe if
   * that discipline slips: an unknown id denies, and a revoked agent denies
   * whatever its grant rows say.
   *
   * Every denial is written to the log with outcome `blocked`, so an agent
   * quietly probing for capabilities it does not hold is visible in the
   * timeline rather than invisible in a return value.
   */
  async authorize(
    agentId: string,
    capability: Capability,
    context: { recipients?: string[]; tool?: string; threadKey?: string } = {},
  ): Promise<AuthorizeResult> {
    const record = await this.store.getAgent(agentId)
    const agent = record ? publicAgent(record) : null
    const now = this.clock()

    if (!agent) {
      return { decision: { allowed: false, reason: 'agent-revoked' }, agent: null }
    }

    const grants = await this.grants.list(agentId)
    const decision = evaluate(grants, capability, {
      now,
      agent,
      recipients: context.recipients,
    })

    if (!decision.allowed) {
      await this.audit.append({
        agentId,
        tool: context.tool ?? capability,
        summary: `Blocked: ${denialSentence(capability, decision.reason, decision.blocked)}`,
        threadKey: context.threadKey,
        outcome: 'blocked',
      })
    }
    return { decision, agent }
  }

  /**
   * The full `request_send` path: check the grant, then queue for a human.
   *
   * Both gates, in that order, in one place — so M2 cannot accidentally queue
   * a send from an agent that was never granted one, and cannot accidentally
   * dispatch one that a human never saw.
   */
  async requestSend(
    agentId: string,
    draft: ComposeDraft,
  ): Promise<{ approval: Approval } | { denied: Decision }> {
    const { decision } = await this.authorize(agentId, 'send', {
      recipients: recipientsOf(draft),
      tool: 'request_send',
      threadKey: draft.reply?.threadKey,
    })
    if (!decision.allowed) return { denied: decision }
    return { approval: await this.approvals.submit(draft, agentId) }
  }
}

function describeScope(grant: Grant): string {
  if (grant.capability !== 'send') return ''
  const scope = grant.scope
  if (scope.kind === 'all') return ' to anyone'
  if (scope.kind === 'domains') return ` to ${scope.domains.join(', ')}`
  return ` to ${scope.emails.join(', ')}`
}

/** Human-readable denial, for the log. One sentence, no jargon. */
function denialSentence(
  capability: Capability,
  reason: DenyReason,
  blocked?: string[],
): string {
  switch (reason) {
    case 'agent-revoked':
      return `this agent is revoked, so ${capability} is refused.`
    case 'no-grant':
      return `${capability} has never been granted.`
    case 'revoked':
      return `${capability} was granted and then revoked.`
    case 'no-recipients':
      return 'a send with no recipients.'
    case 'out-of-scope':
      return `${(blocked ?? []).join(', ') || 'a recipient'} is outside the send scope.`
  }
}

// -- construction -------------------------------------------------------------

/** The app's gateway: SQL-backed, on the same database the mail store uses. */
export function createSqlGateway(
  db: SqlDb,
  mail: SendSeam,
  opts: { now?: () => number; id?: () => string } = {},
): AgentGateway {
  return new AgentGateway({ store: new SqlAgentStore(db), mail, ...opts })
}

// Demo mode has no equivalent factory: it constructs `new AgentGateway` over a
// `MemoryAgentStore` directly in core/index.ts, because it has to seed the
// store *before* the gateway starts sweeping it for expiry.
