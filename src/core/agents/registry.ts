// Agent identity: issue a credential once, store only its digest, and turn a
// presented token back into an Agent.
//
// WHY THIS EXISTS AT ALL
//
// The MCP `initialize` call carries `clientInfo: { name, title, version }` and
// nothing in the spec authenticates any of it (docs/research/mcp-gateway-notes
// .md §2 — the fix, SEP-1289, is open and dormant). So `clientInfo` is a
// display label. A grant that attached to it would be a grant any process on
// the machine could claim by typing the right name.
//
// Wren therefore issues its own credential. The human creates an agent in
// Settings, copies the token once, and pastes it into that agent's own config.
// Everything downstream — grants, the approval queue, every audit row — hangs
// off the `Agent.id` that token resolves to, and off nothing the client said
// about itself.
//
// THE M2 SEAM
//
// M2's stdio shim connects over a user-restricted local channel and presents
// the token once, at connection time. That call is `verifyCredential(token)`.
// It returns the Agent or null, and it is the *only* way an agent id enters
// the system. M2 holds the returned Agent for the life of the connection and
// passes its id to `AgentGateway.authorize` on every tool call; it never
// re-reads the token, and it never trusts a client-supplied id.

import type { AgentStore, Agent, AgentRecord } from './types'
import { publicAgent } from './store'
import type { AuditLog } from './audit'

/**
 * 32 bytes of CSPRNG. Well past the 128-bit floor, and short enough to survive
 * being copied out of a one-time dialog by hand.
 */
export const CREDENTIAL_BYTES = 32

/** Names the token in a config file, and makes a leaked one greppable. */
export const CREDENTIAL_PREFIX = 'wren_agent_'

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A fresh credential. Returned to the human once and never stored. */
export function issueCredential(): string {
  const bytes = new Uint8Array(CREDENTIAL_BYTES)
  crypto.getRandomValues(bytes)
  return `${CREDENTIAL_PREFIX}${base64url(bytes)}`
}

/**
 * SHA-256, hex. Web Crypto, so the same code runs in the Tauri webview, in a
 * browser and under Node's vitest without a polyfill.
 *
 * No salt and no KDF, deliberately: this is a 256-bit random token, not a
 * human-chosen password. There is no dictionary to run against it, and a
 * per-row salt would only stop the digest being the index that makes
 * verification a single keyed lookup rather than a table scan.
 */
export async function hashCredential(token: string): Promise<string> {
  const data = new TextEncoder().encode(token.trim())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface AgentRegistryDeps {
  store: AgentStore
  audit: AuditLog
  now: () => number
  id: () => string
}

/** What `create` hands back. The credential is in this object and nowhere else. */
export interface IssuedAgent {
  agent: Agent
  /**
   * Shown once, in the create dialog, with a copy button. Wren cannot show it
   * again: only the digest was written.
   */
  credential: string
}

export class AgentRegistry {
  constructor(private readonly deps: AgentRegistryDeps) {}

  /**
   * Register an agent and issue its credential.
   *
   * A new agent holds **no** capabilities. Earned autonomy starts at zero, so
   * creating one and forgetting to grant it anything fails closed.
   */
  async create(name: string): Promise<IssuedAgent> {
    const trimmed = name.trim()
    if (trimmed === '') throw new Error('An agent needs a name.')

    const credential = issueCredential()
    const record: AgentRecord = {
      id: this.deps.id(),
      name: trimmed,
      credentialHash: await hashCredential(credential),
      createdAt: this.deps.now(),
    }
    await this.deps.store.putAgent(record)
    await this.deps.audit.append({
      agentId: record.id,
      tool: 'agent.create',
      summary: `Registered ${record.name}. No capabilities granted yet.`,
      outcome: 'ok',
    })
    return { agent: publicAgent(record), credential }
  }

  /**
   * Turn a presented token into an agent, or null.
   *
   * Null for: a malformed token, a token no agent holds, and a token whose
   * agent has been revoked. The caller never learns which — a connecting
   * process that can distinguish "wrong token" from "revoked agent" has been
   * handed an oracle it has no use for.
   */
  async verifyCredential(token: string): Promise<Agent | null> {
    const presented = token?.trim() ?? ''
    if (presented === '') return null
    const record = await this.deps.store.findAgentByHash(await hashCredential(presented))
    if (!record) return null
    if (record.revokedAt !== undefined) return null
    return publicAgent(record)
  }

  async list(): Promise<Agent[]> {
    return (await this.deps.store.listAgents()).map(publicAgent)
  }

  async get(id: string): Promise<Agent | null> {
    const record = await this.deps.store.getAgent(id)
    return record ? publicAgent(record) : null
  }

  /**
   * Withdraw trust. The row stays — its id is all over the audit log, and a
   * deleted agent would leave every past action attributed to nothing.
   *
   * Grants are deliberately left alone. `evaluate` denies a revoked agent
   * everything (rule 2), so re-writing four grant rows would buy no safety and
   * would destroy the record of what the agent had been allowed to do.
   */
  async revoke(id: string): Promise<void> {
    const record = await this.deps.store.getAgent(id)
    if (!record || record.revokedAt !== undefined) return
    await this.deps.store.revokeAgent(id, this.deps.now())
    await this.deps.audit.append({
      agentId: id,
      tool: 'agent.revoke',
      summary: `Revoked ${record.name}. Its credential no longer connects.`,
      outcome: 'ok',
    })
  }
}
