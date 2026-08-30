// react-query over AgentGateway, mirroring features/mail/queries.ts: reads are
// queries, writes are mutations, and the gateway's own event bus is what
// invalidates. No component talks to the gateway directly.

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { Agent, AgentSession, Capability, Grant } from '@/core/agents'
import { liveGrants } from '@/core/agents'
import { useAgentGateway } from '@/features/mail/service'
import { now } from '@/lib/env'

export const agentKeys = {
  agents: ['agents'] as const,
  grants: ['agent-grants'] as const,
  sessions: ['agent-sessions'] as const,
  pending: ['agent-approvals'] as const,
  audit: (agentId?: string) => ['agent-audit', agentId ?? 'all'] as const,
}

export function useAgents() {
  const gateway = useAgentGateway()
  return useQuery({ queryKey: agentKeys.agents, queryFn: () => gateway.registry.list() })
}

/** Every grant row for every agent — one read, because the list is tiny. */
export function useGrants() {
  const gateway = useAgentGateway()
  return useQuery({ queryKey: agentKeys.grants, queryFn: () => gateway.grants.list() })
}

export function useSessions() {
  const gateway = useAgentGateway()
  return useQuery<AgentSession[]>({
    queryKey: agentKeys.sessions,
    queryFn: () => gateway.sessions.listActive(),
    refetchInterval: (query) => (query.state.data?.length ? 30_000 : false),
  })
}

/**
 * Reading the queue is what sweeps expiry (approvals.ts), so this query is
 * also the app's expiry clock. `refetchOnWindowFocus` is react-query's default
 * and is exactly right here: coming back to Maru after a night away is the
 * moment a 24-hour-old request has to stop being actionable.
 */
export function usePendingApprovals() {
  const gateway = useAgentGateway()
  return useQuery({ queryKey: agentKeys.pending, queryFn: () => gateway.approvals.listPending() })
}

export function useAuditTrail(agentId?: string) {
  const gateway = useAgentGateway()
  return useQuery({
    queryKey: agentKeys.audit(agentId),
    queryFn: () => gateway.audit.query({ agentId }),
  })
}

/** Wires the gateway's events to cache invalidation. Mount once, at the root. */
export function useAgentEvents(): void {
  const gateway = useAgentGateway()
  const client = useQueryClient()
  useEffect(() => {
    return gateway.onEvent((event) => {
      switch (event.type) {
        case 'agentsChanged':
          void client.invalidateQueries({ queryKey: agentKeys.agents })
          void client.invalidateQueries({ queryKey: agentKeys.grants })
          break
        case 'sessionsChanged':
          void client.invalidateQueries({ queryKey: agentKeys.sessions })
          break
        case 'approvalsChanged':
        case 'approvalPending':
          void client.invalidateQueries({ queryKey: agentKeys.pending })
          break
        case 'auditAppended':
          void client.invalidateQueries({ queryKey: ['agent-audit'] })
          break
      }
    })
  }, [gateway, client])
}

// -- derived shapes -----------------------------------------------------------

/**
 * The live grant per capability, per agent, at this moment.
 *
 * `liveGrants` is imported rather than reimplemented: rule 4 of the grant model
 * (a revocation suppresses older rows) is subtle, and a filter written here
 * would be the copy nobody thinks to test.
 */
export function useHeldGrants(): Map<string, Partial<Record<Capability, Grant>>> {
  const grants = useGrants().data
  return useMemo(() => {
    const at = now()
    const byAgent = new Map<string, Grant[]>()
    for (const grant of grants ?? []) {
      const list = byAgent.get(grant.agentId) ?? []
      list.push(grant)
      byAgent.set(grant.agentId, list)
    }
    const out = new Map<string, Partial<Record<Capability, Grant>>>()
    for (const [agentId, rows] of byAgent) {
      const held: Partial<Record<Capability, Grant>> = {}
      for (const capability of ['read', 'draft', 'archiveLabel', 'send'] as Capability[]) {
        const live = liveGrants(rows, capability, at)
        if (live.length > 0) held[capability] = live[0]
      }
      out.set(agentId, held)
    }
    return out
  }, [grants])
}

/** Names for the audit timeline, which shows rows from agents that are gone. */
export function useAgentNames(): Map<string, Agent> {
  const agents = useAgents().data
  return useMemo(() => new Map((agents ?? []).map((a) => [a.id, a])), [agents])
}
