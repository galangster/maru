// Two implementations of the AgentStore port: SQL over the `SqlDb` seam, and
// an in-memory one for demo mode.
//
// The SQL one runs against tauri-plugin-sql in the app and better-sqlite3 in
// tests, exactly like store/db.ts. The memory one exists because demo mode has
// no Platform — and because "approve this in the demo and watch it send" is
// what makes the queue capturable and reviewable before any agent connects.
//
// Neither decides anything. Rules live in grants.ts and approvals.ts.

import type { SqlDb } from '../platform'
import { parseThreadKey, type ComposeDraft } from '../types'
import type { Keyring } from '../crypto/keyring'
import type {
  Agent,
  AgentRecord,
  AgentStore,
  Approval,
  ApprovalKind,
  ApprovalStatus,
  AuditEntry,
  AuditOutcome,
  Capability,
  Grant,
  GrantScope,
} from './types'
import { SCOPE_ALL } from './types'

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/**
 * A scope that failed to parse falls back to the *narrowest* shape, not the
 * broadest. Corrupt JSON must never read as "may send to anyone".
 */
function parseScope(text: string): GrantScope {
  const value = parseJson<GrantScope | null>(text, null)
  if (!value || typeof value !== 'object') return { kind: 'recipients', emails: [] }
  if (value.kind === 'all') return SCOPE_ALL
  if (value.kind === 'domains') return { kind: 'domains', domains: value.domains ?? [] }
  if (value.kind === 'recipients') return { kind: 'recipients', emails: value.emails ?? [] }
  return { kind: 'recipients', emails: [] }
}

// -- SQL ----------------------------------------------------------------------

interface AgentRow {
  id: string
  name: string
  credential_hash: string
  created_at: number
  revoked_at: number | null
}

interface GrantRow {
  agent_id: string
  capability: string
  scope_json: string
  granted_at: number
  revoked_at: number | null
}

interface ApprovalRow {
  id: string
  agent_id: string
  kind: string
  payload_json: string
  status: string
  created_at: number
  resolved_at: number | null
  account_id: string | null
}

interface AuditRow {
  id: string
  agent_id: string
  at: number
  tool: string
  summary: string
  thread_key: string | null
  outcome: string
  account_id: string | null
}

const EMPTY_DRAFT: ComposeDraft = {
  accountId: '',
  to: [],
  cc: [],
  bcc: [],
  subject: '',
  bodyHtml: '',
  attachments: [],
}

function rowToAgent(r: AgentRow): AgentRecord {
  return {
    id: r.id,
    name: r.name,
    credentialHash: r.credential_hash,
    createdAt: r.created_at,
    revokedAt: r.revoked_at ?? undefined,
  }
}

function rowToGrant(r: GrantRow): Grant {
  return {
    agentId: r.agent_id,
    capability: r.capability as Capability,
    scope: parseScope(r.scope_json),
    grantedAt: r.granted_at,
    revokedAt: r.revoked_at ?? undefined,
  }
}

function rowToApproval(r: ApprovalRow): Approval {
  return {
    id: r.id,
    agentId: r.agent_id,
    kind: r.kind as ApprovalKind,
    payload: parseJson<ComposeDraft>(r.payload_json, EMPTY_DRAFT),
    status: r.status as ApprovalStatus,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? undefined,
  }
}

function rowToAudit(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    agentId: r.agent_id,
    at: r.at,
    tool: r.tool,
    summary: r.summary,
    threadKey: r.thread_key ?? undefined,
    outcome: r.outcome as AuditOutcome,
  }
}

export class SqlAgentStore implements AgentStore {
  constructor(
    private readonly db: SqlDb,
    private readonly keyring: Keyring | null = null,
  ) {}

  private async approvalFromRow(row: ApprovalRow): Promise<Approval | null> {
    if (!this.keyring || !row.account_id) return rowToApproval(row)
    const payload = await this.keyring.decrypt(row.account_id, row.payload_json)
    if (payload === null) return null
    return rowToApproval({ ...row, payload_json: payload })
  }

  private async auditFromRow(row: AuditRow): Promise<AuditEntry> {
    if (!this.keyring || !row.account_id) return rowToAudit(row)
    const [summary, threadKey] = await Promise.all([
      this.keyring.decrypt(row.account_id, row.summary),
      row.thread_key === null
        ? Promise.resolve<string | null>(null)
        : this.keyring.decrypt(row.account_id, row.thread_key),
    ])
    if (summary === null || (row.thread_key !== null && threadKey === null)) {
      return rowToAudit({
        ...row,
        summary: 'Content erased when its account was removed.',
        thread_key: null,
      })
    }
    return rowToAudit({ ...row, summary, thread_key: threadKey })
  }

  // -- agents -----------------------------------------------------------------

  async putAgent(record: AgentRecord): Promise<void> {
    await this.db.execute(
      `INSERT INTO agents (id, name, credential_hash, created_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         credential_hash = excluded.credential_hash,
         created_at = excluded.created_at,
         revoked_at = excluded.revoked_at`,
      [record.id, record.name, record.credentialHash, record.createdAt, record.revokedAt ?? null],
    )
  }

  async listAgents(): Promise<AgentRecord[]> {
    const rows = await this.db.select<AgentRow>(
      'SELECT * FROM agents ORDER BY created_at ASC, id ASC',
    )
    return rows.map(rowToAgent)
  }

  async findAgentByHash(credentialHash: string): Promise<AgentRecord | null> {
    const rows = await this.db.select<AgentRow>(
      'SELECT * FROM agents WHERE credential_hash = $1',
      [credentialHash],
    )
    return rows.length ? rowToAgent(rows[0]) : null
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    const rows = await this.db.select<AgentRow>('SELECT * FROM agents WHERE id = $1', [id])
    return rows.length ? rowToAgent(rows[0]) : null
  }

  async revokeAgent(id: string, at: number): Promise<void> {
    // COALESCE, so re-revoking keeps the first timestamp: when trust was
    // withdrawn is a fact about the past and must not move.
    await this.db.execute(
      'UPDATE agents SET revoked_at = COALESCE(revoked_at, $1) WHERE id = $2',
      [at, id],
    )
  }

  // -- grants -----------------------------------------------------------------

  async putGrant(grant: Grant): Promise<void> {
    await this.db.execute(
      `INSERT INTO grants (agent_id, capability, scope_json, granted_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        grant.agentId,
        grant.capability,
        JSON.stringify(grant.scope),
        grant.grantedAt,
        grant.revokedAt ?? null,
      ],
    )
  }

  async listGrants(agentId?: string): Promise<Grant[]> {
    const rows = agentId
      ? await this.db.select<GrantRow>(
          'SELECT * FROM grants WHERE agent_id = $1 ORDER BY granted_at ASC, rowid ASC',
          [agentId],
        )
      : await this.db.select<GrantRow>('SELECT * FROM grants ORDER BY granted_at ASC, rowid ASC')
    return rows.map(rowToGrant)
  }

  async revokeGrants(agentId: string, capability: Capability, at: number): Promise<void> {
    await this.db.execute(
      'UPDATE grants SET revoked_at = $1 WHERE agent_id = $2 AND capability = $3 AND revoked_at IS NULL',
      [at, agentId, capability],
    )
  }

  // -- approvals --------------------------------------------------------------

  async putApproval(approval: Approval): Promise<void> {
    const accountId = approval.payload.accountId
    const payload = JSON.stringify(approval.payload)
    await this.db.execute(
      `INSERT INTO approvals (id, agent_id, kind, payload_json, status, created_at, resolved_at, account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         resolved_at = excluded.resolved_at`,
      [
        approval.id,
        approval.agentId,
        approval.kind,
        this.keyring ? await this.keyring.encrypt(accountId, payload) : payload,
        approval.status,
        approval.createdAt,
        approval.resolvedAt ?? null,
        accountId,
      ],
    )
  }

  async getApproval(id: string): Promise<Approval | null> {
    const rows = await this.db.select<ApprovalRow>('SELECT * FROM approvals WHERE id = $1', [id])
    return rows.length ? this.approvalFromRow(rows[0]) : null
  }

  async listApprovals(status?: ApprovalStatus): Promise<Approval[]> {
    const rows = status
      ? await this.db.select<ApprovalRow>(
          'SELECT * FROM approvals WHERE status = $1 ORDER BY created_at DESC, id ASC',
          [status],
        )
      : await this.db.select<ApprovalRow>(
          'SELECT * FROM approvals ORDER BY created_at DESC, id ASC',
        )
    const approvals = await Promise.all(rows.map((row) => this.approvalFromRow(row)))
    return approvals.filter((approval): approval is Approval => approval !== null)
  }

  async setApprovalStatus(id: string, status: ApprovalStatus, resolvedAt: number): Promise<void> {
    await this.db.execute('UPDATE approvals SET status = $1, resolved_at = $2 WHERE id = $3', [
      status,
      resolvedAt,
      id,
    ])
  }

  // -- audit ------------------------------------------------------------------

  async appendAudit(entry: AuditEntry): Promise<void> {
    const rawThreadKey = entry.threadKey ?? null
    const parsed = rawThreadKey?.includes('/') ? parseThreadKey(rawThreadKey) : null
    const accountId = parsed?.accountId || null
    const summary =
      this.keyring && accountId
        ? await this.keyring.encrypt(accountId, entry.summary)
        : entry.summary
    const threadKey =
      this.keyring && accountId && rawThreadKey
        ? await this.keyring.encrypt(accountId, rawThreadKey)
        : rawThreadKey
    await this.db.execute(
      `INSERT INTO audit_log (id, agent_id, at, tool, summary, thread_key, outcome, account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.id,
        entry.agentId,
        entry.at,
        entry.tool,
        summary,
        threadKey,
        entry.outcome,
        accountId,
      ],
    )
  }

  async listAudit(opts: {
    agentId?: string
    tool?: string
    limit: number
  }): Promise<AuditEntry[]> {
    // Newest first, and the LIMIT is in SQL rather than a slice: the cap
    // exists so a year of agent activity cannot be pulled into a render.
    const where: string[] = []
    const args: unknown[] = []
    if (opts.agentId) {
      args.push(opts.agentId)
      where.push(`agent_id = $${args.length}`)
    }
    if (opts.tool) {
      args.push(opts.tool)
      where.push(`tool = $${args.length}`)
    }
    args.push(opts.limit)
    const rows = await this.db.select<AuditRow>(
      `SELECT * FROM audit_log${
        where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''
      } ORDER BY at DESC, id DESC LIMIT $${args.length}`,
      args,
    )
    return Promise.all(rows.map((row) => this.auditFromRow(row)))
  }
}

// -- memory -------------------------------------------------------------------

/** Demo mode's store. Same port, no persistence, no Platform. */
export class MemoryAgentStore implements AgentStore {
  private readonly agents = new Map<string, AgentRecord>()
  private grants: Grant[] = []
  private readonly approvals = new Map<string, Approval>()
  private audit: AuditEntry[] = []

  async putAgent(record: AgentRecord): Promise<void> {
    this.agents.set(record.id, { ...record })
  }

  async listAgents(): Promise<AgentRecord[]> {
    return [...this.agents.values()]
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((a) => ({ ...a }))
  }

  async findAgentByHash(credentialHash: string): Promise<AgentRecord | null> {
    for (const agent of this.agents.values()) {
      if (agent.credentialHash === credentialHash) return { ...agent }
    }
    return null
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    const agent = this.agents.get(id)
    return agent ? { ...agent } : null
  }

  async revokeAgent(id: string, at: number): Promise<void> {
    const agent = this.agents.get(id)
    if (!agent || agent.revokedAt !== undefined) return
    this.agents.set(id, { ...agent, revokedAt: at })
  }

  async putGrant(grant: Grant): Promise<void> {
    this.grants.push({ ...grant })
  }

  async listGrants(agentId?: string): Promise<Grant[]> {
    return this.grants
      .filter((g) => agentId === undefined || g.agentId === agentId)
      .map((g) => ({ ...g }))
  }

  async revokeGrants(agentId: string, capability: Capability, at: number): Promise<void> {
    this.grants = this.grants.map((g) =>
      g.agentId === agentId && g.capability === capability && g.revokedAt === undefined
        ? { ...g, revokedAt: at }
        : g,
    )
  }

  async putApproval(approval: Approval): Promise<void> {
    this.approvals.set(approval.id, { ...approval })
  }

  async getApproval(id: string): Promise<Approval | null> {
    const found = this.approvals.get(id)
    return found ? { ...found } : null
  }

  async listApprovals(status?: ApprovalStatus): Promise<Approval[]> {
    return [...this.approvals.values()]
      .filter((a) => status === undefined || a.status === status)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map((a) => ({ ...a }))
  }

  async setApprovalStatus(id: string, status: ApprovalStatus, resolvedAt: number): Promise<void> {
    const found = this.approvals.get(id)
    if (!found) return
    this.approvals.set(id, { ...found, status, resolvedAt })
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    this.audit.push({ ...entry })
  }

  async listAudit(opts: {
    agentId?: string
    tool?: string
    limit: number
  }): Promise<AuditEntry[]> {
    return this.audit
      .filter((e) => opts.agentId === undefined || e.agentId === opts.agentId)
      .filter((e) => opts.tool === undefined || e.tool === opts.tool)
      .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))
      .slice(0, opts.limit)
      .map((e) => ({ ...e }))
  }
}

/** Drops the credential digest. What leaves the store layer for the UI. */
export function publicAgent(record: AgentRecord): Agent {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
  }
}
