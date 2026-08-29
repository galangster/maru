// How an agent looks and how its permissions read. Shared by the queue, the
// timeline and the Settings section so the three can never disagree about what
// Scout's colour is or what "archiveLabel" is called in English.

import type { Agent, AuditOutcome, Capability, Grant } from '@/core/agents'
import { hueFor, hueSolid, type Hue } from '@/lib/hue'
import { cn } from '@/lib/utils'

/**
 * An agent's identity colour.
 *
 * DIRECTION §3 binds the category hues to a Gmail label and to a hash of a
 * sender's address, and to nothing else. M1's ticket adds the third binding
 * and this is it: an agent is an actor in the mailbox exactly the way a sender
 * is, it needs to be told apart from the next one at a glance, and hashing the
 * id gives it a colour that never moves — including after a rename.
 *
 * The id, not the name: a hue that changed when an agent was renamed would
 * re-colour every row of its own audit trail.
 */
function agentHue(agent: Pick<Agent, 'id'>): Hue {
  return hueFor(agent.id)
}

/** The 6 px identity dot, the same glyph an account row leads with. */
export function AgentDot({ agent, className }: { agent: Pick<Agent, 'id'>; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: hueSolid(agentHue(agent)) }}
      className={cn('inline-block size-1.5 shrink-0 rounded-full', className)}
    />
  )
}

/** Dot plus name, the pairing every agent-bearing row uses. */
export function AgentBadge({
  agent,
  className,
}: {
  agent: Pick<Agent, 'id' | 'name'>
  className?: string
}) {
  return (
    <span className={cn('font-ui text-ink inline-flex items-center gap-2 text-base', className)}>
      <AgentDot agent={agent} />
      <span className="truncate font-medium">{agent.name}</span>
    </span>
  )
}

// -- capabilities -------------------------------------------------------------

/** What each capability is called, and the one-line "why" Family asks for. */
export const CAPABILITY_COPY: Record<Capability, { label: string; help: string }> = {
  read: {
    label: 'Read',
    help: 'Search the mailbox and open threads.',
  },
  draft: {
    label: 'Draft',
    help: 'Write replies. A draft never leaves Wren on its own.',
  },
  archiveLabel: {
    label: 'Archive & label',
    help: 'Clear the inbox and file mail. Reversible from the list.',
  },
  send: {
    label: 'Send',
    help: 'Ask to send. Every send still waits for you in the queue.',
  },
}

/** How far a send grant reaches, in words. Settings' one-line summary. */
export function scopeSummary(grant: Grant): string {
  const scope = grant.scope
  if (scope.kind === 'all') return 'to anyone'
  if (scope.kind === 'domains') {
    return scope.domains.length === 0 ? 'to nobody yet' : `to ${scope.domains.join(', ')}`
  }
  return scope.emails.length === 0 ? 'to nobody yet' : `to ${scope.emails.join(', ')}`
}

// -- outcomes -----------------------------------------------------------------

/**
 * The audit timeline's right-hand column: a 6 px dot and a word.
 *
 * A dot rather than a coloured pill, because a table of pills is a table of
 * badges and DIRECTION §1 asks a screen at rest to be near-monochrome. The
 * colours are the semantic tokens — success, destructive, star — never a
 * category hue, which would break the one-accent rule (§10.2b).
 */
const OUTCOME_COPY: Record<AuditOutcome, { label: string; tone: string }> = {
  ok: { label: 'Done', tone: 'bg-success' },
  pending: { label: 'Waiting', tone: 'bg-star' },
  denied: { label: 'Denied', tone: 'bg-destructive' },
  blocked: { label: 'Blocked', tone: 'bg-destructive' },
  expired: { label: 'Expired', tone: 'bg-ink-3' },
  error: { label: 'Failed', tone: 'bg-destructive' },
}

export function OutcomeMark({ outcome }: { outcome: AuditOutcome }) {
  const { label, tone } = OUTCOME_COPY[outcome]
  return (
    <span className="text-ink-2 inline-flex items-center gap-2 text-sm">
      <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full', tone)} />
      {label}
    </span>
  )
}
