// The earned-autonomy contract — M1.
//
// Wren's thesis is that an agent gets *more* rope by having behaved, and that
// the human can always see what it did. Four objects carry that:
//
//   Agent      an identity Wren issued a credential to
//   Grant      one capability that identity holds, with a scope
//   Approval   a side effect the identity asked for and a human must resolve
//   AuditEntry what actually happened, forever
//
// Two facts from docs/research/mcp-gateway-notes.md decide the shape here and
// are worth restating where they bind:
//
//  §2 — `clientInfo` on the MCP `initialize` call is self-reported and nothing
//       in the spec authenticates it. So a grant never attaches to a name a
//       client claims; it attaches to `Agent.id`, which is only ever reached
//       through a credential Wren issued (registry.ts).
//  §4 — there is no deferred-approval primitive in MCP. `tools/call` is
//       synchronous. So `Approval` is an app-level object with an ID the tool
//       call returns immediately, and the human resolves it in Wren's own UI.
//
// This file is additive to src/core/types.ts and does not change it. The agent
// event bus is its own union rather than new `MailEvent` variants: MailService
// has two implementations that would both have to learn to emit them, and the
// gateway already holds a MailService rather than the other way round.

import type { ComposeDraft } from '../types'

// -- agents -------------------------------------------------------------------

/**
 * A registered agent. The credential digest is deliberately NOT on this type —
 * it lives on `AgentRecord`, which never leaves the store layer, so no UI
 * component or event payload can carry it by accident.
 */
export interface Agent {
  id: string
  name: string
  createdAt: number
  /** Set once, never cleared. A revoked agent is history, not a free id. */
  revokedAt?: number
}

/** The stored row. `credentialHash` is SHA-256 hex of the issued token. */
export interface AgentRecord extends Agent {
  credentialHash: string
}

// -- grants -------------------------------------------------------------------

/**
 * The four things an agent can be trusted with, in increasing consequence.
 *
 * `read` is the floor and it implies nothing else: the whole point of an
 * earned-autonomy model is that reading a mailbox never quietly buys the
 * ability to write to it. `archiveLabel` is one capability because Gmail has
 * one verb underneath both. `send` is the only one that can reach a stranger,
 * and it is the only one that carries a scope.
 */
export type Capability = 'read' | 'draft' | 'archiveLabel' | 'send'

export const CAPABILITIES: readonly Capability[] = ['read', 'draft', 'archiveLabel', 'send']

/**
 * How far a `send` grant reaches.
 *
 *  · `all`        — anyone. The most a human can hand over, and it still goes
 *                   through the approval queue unless the queue is bypassed.
 *  · `domains`    — "my company and nobody else". Matched on the recipient's
 *                   own domain, case-folded, exact — never a suffix match, or
 *                   `evil-example.com` would satisfy a grant for `example.com`.
 *  · `recipients` — a named list of addresses.
 *
 * The three non-send capabilities take `{ kind: 'all' }`: they have no
 * recipient to scope against, and inventing a second empty shape for them
 * would put a branch in every reader of a Grant.
 */
export type GrantScope =
  | { kind: 'all' }
  | { kind: 'domains'; domains: string[] }
  | { kind: 'recipients'; emails: string[] }

export const SCOPE_ALL: GrantScope = { kind: 'all' }

export interface Grant {
  agentId: string
  capability: Capability
  scope: GrantScope
  grantedAt: number
  /** Stamped on revoke. The row survives so the audit log stays explainable. */
  revokedAt?: number
}

// -- approvals ----------------------------------------------------------------

/**
 * What is waiting on a human. Only `send` today; the column is a string in the
 * schema so an `archiveLabel` approval can join it without a migration.
 */
export type ApprovalKind = 'send'

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired'

export interface Approval {
  id: string
  agentId: string
  kind: ApprovalKind
  /** The draft exactly as the agent composed it. Never edited on approval. */
  payload: ComposeDraft
  status: ApprovalStatus
  createdAt: number
  resolvedAt?: number
}

// -- audit --------------------------------------------------------------------

/**
 * What the row says happened. `denied` is a human saying no; `blocked` is the
 * grant model saying no before a human ever saw it. Keeping them apart is what
 * lets the timeline answer "did I refuse this, or was it never allowed?"
 */
export type AuditOutcome = 'ok' | 'pending' | 'denied' | 'blocked' | 'expired' | 'error'

export interface AuditEntry {
  id: string
  agentId: string
  at: number
  /** The tool name as the agent called it — `request_send`, `search_mail`. */
  tool: string
  /** One line, already written for a human. The timeline never re-phrases. */
  summary: string
  threadKey?: string
  outcome: AuditOutcome
}

/** What `AuditLog.append` is handed. The id and the clock are the log's. */
export interface AuditDraft {
  agentId: string
  tool: string
  summary: string
  threadKey?: string
  outcome: AuditOutcome
  /** Fixtures and tests only. Live callers let the log stamp the time. */
  at?: number
}

// -- events -------------------------------------------------------------------

/**
 * The agent bus. Separate from `MailEvent` on purpose (see the file header),
 * and subscribed to through `AgentGateway.onEvent`.
 */
export type AgentEvent =
  /** An agent was created or revoked, or its grants moved. */
  | { type: 'agentsChanged' }
  /** The queue's contents moved. `pending` is the badge's number. */
  | { type: 'approvalsChanged'; pending: number }
  /**
   * A new approval landed. Carries the agent's display name so the OS
   * notification does not have to go back to the store to write its title.
   */
  | { type: 'approvalPending'; approval: Approval; agentName: string }
  /**
   * This agent's credential was used for the first time ever. The one
   * connection that deserves an OS notification: it is the moment a copied
   * credential would first show itself (M10, notice tier). Carries the name
   * for the same reason `approvalPending` does.
   */
  | { type: 'agentFirstConnected'; agentName: string }
  | { type: 'auditAppended'; entry: AuditEntry }

// -- the persistence port -----------------------------------------------------

/**
 * The narrow seam every module below sits on. Two implementations: SQL over
 * the `SqlDb` seam for the app and the tests, and an in-memory one for demo
 * mode, which has no Platform at all.
 *
 * It is row-shaped rather than query-shaped on purpose — the rules live in
 * grants.ts and approvals.ts, and a store that could also decide things would
 * be a second place for them to be decided.
 */
export interface AgentStore {
  putAgent(record: AgentRecord): Promise<void>
  listAgents(): Promise<AgentRecord[]>
  /** The verification path. Exact digest match, revoked rows included. */
  findAgentByHash(credentialHash: string): Promise<AgentRecord | null>
  getAgent(id: string): Promise<AgentRecord | null>
  revokeAgent(id: string, at: number): Promise<void>

  putGrant(grant: Grant): Promise<void>
  /** Every grant row, live and revoked. Filtering is `evaluate`'s job. */
  listGrants(agentId?: string): Promise<Grant[]>
  /** Stamps `revokedAt` on every live row for this (agent, capability). */
  revokeGrants(agentId: string, capability: Capability, at: number): Promise<void>

  putApproval(approval: Approval): Promise<void>
  getApproval(id: string): Promise<Approval | null>
  listApprovals(status?: ApprovalStatus): Promise<Approval[]>
  setApprovalStatus(id: string, status: ApprovalStatus, resolvedAt: number): Promise<void>

  appendAudit(entry: AuditEntry): Promise<void>
  listAudit(opts: { agentId?: string; tool?: string; limit: number }): Promise<AuditEntry[]>
}
