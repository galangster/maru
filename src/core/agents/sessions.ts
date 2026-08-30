// Agent sessions are deliberately in memory. Wren never persists them, so an
// app restart ends every session and returns mail tools to the safe, closed
// state.

import type { AuditLog } from './audit'
import type { AgentEvent, AgentStore } from './types'

export const SESSION_DURATIONS_MS = [15 * 60_000, 60 * 60_000, 8 * 60 * 60_000] as const
export const DEFAULT_SESSION_MS = SESSION_DURATIONS_MS[1]

export interface AgentSession {
  agentId: string
  startedAt: number
  expiresAt: number
}

export function minutesLeft(session: AgentSession, now: number): number {
  return Math.max(1, Math.ceil((session.expiresAt - now) / 60_000))
}

export interface SessionConsentDeps {
  store: AgentStore
  audit: AuditLog
  now: () => number
  emit: (event: AgentEvent) => void
}

interface SessionState {
  startedAt: number
  expiresAt: number
}

export class SessionConsent {
  private readonly sessions = new Map<string, SessionState>()

  constructor(private readonly deps: SessionConsentDeps) {}

  async start(agentId: string, durationMs: number): Promise<AgentSession> {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('A session duration must be greater than zero.')
    }
    const agent = await this.deps.store.getAgent(agentId)
    if (!agent || agent.revokedAt !== undefined) throw new Error('A revoked agent cannot start a session.')

    const startedAt = this.deps.now()
    const session = { startedAt, expiresAt: startedAt + durationMs }
    this.sessions.set(agentId, session)
    await this.deps.audit.append({
      agentId,
      tool: 'session.start',
      summary: `You started a session (${humanDuration(durationMs)}).`,
      outcome: 'ok',
    })
    this.deps.emit({ type: 'sessionsChanged' })
    return { agentId, ...session }
  }

  async end(agentId: string): Promise<void> {
    if (!(await this.active(agentId))) return
    this.sessions.delete(agentId)
    await this.deps.audit.append({
      agentId,
      tool: 'session.end',
      summary: 'You ended the session.',
      outcome: 'ok',
    })
    this.deps.emit({ type: 'sessionsChanged' })
  }

  async active(agentId: string): Promise<AgentSession | null> {
    const session = this.sessions.get(agentId)
    if (!session) return null
    if (session.expiresAt > this.deps.now()) return { agentId, ...session }

    this.sessions.delete(agentId)
    await this.deps.audit.append({
      agentId,
      tool: 'session.expired',
      summary: `The session expired after ${humanDuration(session.expiresAt - session.startedAt)}.`,
      outcome: 'ok',
    })
    this.deps.emit({ type: 'sessionsChanged' })
    return null
  }

  async listActive(): Promise<AgentSession[]> {
    const active = await Promise.all([...this.sessions.keys()].map((agentId) => this.active(agentId)))
    return active.filter((session): session is AgentSession => session !== null)
  }
}

export function humanDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000)
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}
