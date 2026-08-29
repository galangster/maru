// Settings → Agents. Where trust is handed over and taken back.
//
// The section is written so the dangerous thing is the hardest one to do by
// accident: an agent is created with nothing, every capability is an explicit
// toggle, the send scope defaults to specific domains rather than to everyone,
// and revoking asks.
//
// The credential is shown exactly once, on creation. Wren stores only its
// SHA-256 digest, so "you won't see this again" is a statement of fact rather
// than a policy — see core/agents/registry.ts.

import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmPopover } from '@/components/confirm-popover'
import { Icon } from '@/components/ui/icon'
import { PRESS, PrimaryButton } from '@/components/wren-controls'
import type { Agent, Capability, Grant } from '@/core/agents'
import { CAPABILITIES, DEMO_AGENT, DEMO_AGENT_CREDENTIAL } from '@/core/agents'
import { useAgentGateway, useMailMode } from '@/features/mail/service'
import { useSurfaces } from '@/features/shell/surface-store'
import { relativeTime } from '@/lib/format'
import { now } from '@/lib/env'
import { cn } from '@/lib/utils'

import { AgentDot, CAPABILITY_COPY, scopeSummary } from './identity'
import { useAgents, useHeldGrants } from './queries'

const DAY = 24 * 60 * 60 * 1000

/**
 * "Added 3 days ago". `relativeTime` is the list's meta column — it answers
 * with a clock time for anything today, which reads as a timestamp rather than
 * as an age when it follows the word "Added".
 */
function ageLabel(at: number, at_now = now()): string {
  const days = Math.floor((at_now - at) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return relativeTime(at, at_now)
}

export function AgentsSection() {
  const agents = useAgents()
  const held = useHeldGrants()
  const openAudit = useSurfaces((s) => s.openAudit)
  const list = agents.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-3 text-sm text-pretty">
        An agent connects with a credential Wren issues, not with a name it claims. It starts with
        nothing and holds only what you grant it here.
      </p>

      {list.length === 0 ? (
        <p className="text-ink-3 text-sm">No agents yet. Create one below to get a credential.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((agent) => (
            <AgentCard key={agent.id} agent={agent} held={held.get(agent.id) ?? {}} />
          ))}
        </ul>
      )}

      <CreateAgent />

      <button
        type="button"
        onClick={() => openAudit()}
        className="font-ui text-ink-2 hover:text-ink focus-ring h-8 w-fit rounded-md text-base font-medium"
      >
        Open the audit log
      </button>
    </div>
  )
}

// -- one agent ----------------------------------------------------------------

function AgentCard({
  agent,
  held,
}: {
  agent: Agent
  held: Partial<Record<Capability, Grant>>
}) {
  const gateway = useAgentGateway()
  const [confirming, setConfirming] = useState(false)
  const revoked = agent.revokedAt !== undefined
  const send = held.send

  const revoke = async () => {
    setConfirming(false)
    try {
      await gateway.revokeAgent(agent.id)
      toast.success(`Revoked ${agent.name}`)
    } catch (cause) {
      toast.error('Could not revoke', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  return (
    // A well, not a card with a stroke: depth by fill (DIRECTION §1). The
    // settings body is inset 24 from a 24 px dialog corner, so nothing here is
    // near enough to a corner for the concentric rule to bind — 12 is the
    // ordinary radius for a block of this size.
    <li className="bg-sunken flex flex-col gap-3 rounded-md p-4">
      <div className="flex items-center gap-3">
        <AgentDot agent={agent} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-ui text-ink truncate text-base font-medium">{agent.name}</span>
          <span className="text-ink-3 truncate text-sm">
            {agent.revokedAt !== undefined
              ? `Revoked ${ageLabel(agent.revokedAt)}`
              : `Added ${ageLabel(agent.createdAt)}`}
          </span>
        </div>
        {!revoked && (
          <ConfirmPopover
            open={confirming}
            onOpenChange={setConfirming}
            title={`Revoke ${agent.name}?`}
            description="Its credential stops working immediately and it loses every capability. Its history stays in the audit log."
            cancelLabel="Keep it"
            confirmLabel="Revoke"
            onConfirm={() => void revoke()}
            trigger={
              <button
                type="button"
                aria-label={`Revoke ${agent.name}`}
                className="font-ui text-ink-2 hover:bg-fill-hover hover:text-destructive focus-ring h-8 shrink-0 rounded-full px-3 text-base font-medium transition-colors duration-(--wren-dur-fast)"
              />
            }
            triggerContent="Revoke"
          />
        )}
      </div>

      {revoked ? (
        <p className="text-ink-3 text-sm text-pretty">
          This credential no longer connects. Create a new agent to hand out a fresh one.
        </p>
      ) : (
        <>
          <CapabilityToggles agentId={agent.id} held={held} />
          {send && <SendScopeEditor agentId={agent.id} grant={send} />}
          <FixtureCredential agent={agent} />
        </>
      )}
    </li>
  )
}

/**
 * Demo mode's connect affordance.
 *
 * A real credential is shown once and then only its digest exists, so there is
 * nothing to print here for a real agent — that is the whole design. Scout is
 * different: its credential is a fixture in the source tree, seeded into an
 * in-memory store that holds no real mail and reaches no real network. Showing
 * it is what lets someone connect a real agent to the gateway and watch the
 * grant model refuse things, before they have trusted Wren with a mailbox.
 */
function FixtureCredential({ agent }: { agent: Agent }) {
  const { demo } = useMailMode()
  if (!demo || agent.id !== DEMO_AGENT.id) return null

  return (
    <div className="border-hairline flex flex-col gap-2 rounded-md border p-3">
      <p className="font-ui text-ink text-sm font-medium">Demo credential</p>
      <p className="text-ink-3 text-sm text-pretty">
        Scout is a fixture, so its credential is printed rather than issued. Point an agent at it to
        try the gateway against demo mail.
      </p>
      <p className="bg-sunken text-ink rounded-sm px-3 py-2 text-sm break-all select-all">
        {DEMO_AGENT_CREDENTIAL}
      </p>
    </div>
  )
}

function CapabilityToggles({
  agentId,
  held,
}: {
  agentId: string
  held: Partial<Record<Capability, Grant>>
}) {
  const gateway = useAgentGateway()
  const [busy, setBusy] = useState<Capability | null>(null)

  const toggle = async (capability: Capability) => {
    if (busy) return
    setBusy(capability)
    try {
      if (held[capability]) {
        await gateway.revokeGrant(agentId, capability)
      } else {
        // Send opens on the narrow shape, not on "anyone". A capability whose
        // default is the widest possible reach is not a grant, it is a trap.
        await gateway.grant(
          agentId,
          capability,
          capability === 'send' ? { kind: 'domains', domains: [] } : { kind: 'all' },
        )
      }
    } catch (cause) {
      toast.error('Could not change the grant', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-ui text-ink-3 text-xs font-semibold uppercase">Capabilities</p>
      <div role="group" aria-label="Capabilities" className="flex flex-wrap gap-2">
        {CAPABILITIES.map((capability) => {
          const on = Boolean(held[capability])
          return (
            <button
              key={capability}
              type="button"
              aria-pressed={on}
              // Two identical words down a list of agents; the label says whose.
              aria-label={`${CAPABILITY_COPY[capability].label} — ${CAPABILITY_COPY[capability].help}`}
              title={CAPABILITY_COPY[capability].help}
              onClick={() => void toggle(capability)}
              className={cn(
                'font-ui inline-flex h-8 items-center gap-2 rounded-full px-3 text-base outline-none',
                'transition-[color,background-color,scale] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
                PRESS,
                'focus-ring',
                // "On" is the soft fill plus a weight change — the same thing
                // a selected sidebar row and a selected audit tab are. It was
                // accent *ink* as well, which put four saturated chips on one
                // surface next to an accent nav row and an accent scope
                // toggle: six accents, and DIRECTION §1's near-monochrome
                // promise gone. The wash carries the state on its own.
                on ? 'bg-fill-selected text-ink font-medium' : 'bg-surface text-ink-2 hover:bg-fill-hover',
              )}
            >
              <Icon name={on ? 'check' : 'add'} size={16} className="text-ink-3" />
              {CAPABILITY_COPY[capability].label}
            </button>
          )
        })}
      </div>
      <p className="text-ink-3 text-sm text-pretty">
        {held.send
          ? `This agent may ask to send ${scopeSummary(held.send)}. Every request still waits for you in the queue.`
          : CAPABILITY_COPY.send.help}
      </p>
    </div>
  )
}

function SendScopeEditor({ agentId, grant }: { agentId: string; grant: Grant }) {
  const gateway = useAgentGateway()
  const domains = grant.scope.kind === 'domains' ? grant.scope.domains : []
  const [text, setText] = useState(domains.join('\n'))
  const kind = grant.scope.kind === 'all' ? 'all' : 'domains'

  const setScope = async (next: 'all' | 'domains', list = domains) => {
    try {
      await gateway.grant(
        agentId,
        'send',
        next === 'all' ? { kind: 'all' } : { kind: 'domains', domains: list },
      )
    } catch (cause) {
      toast.error('Could not change the send scope', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  const commit = () => {
    const list = text
      .split(/[\s,]+/)
      .map((d) => d.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean)
    if (list.join('\n') === domains.join('\n')) return
    setText(list.join('\n'))
    void setScope('domains', list)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-ui text-ink-3 text-xs font-semibold uppercase">Send to</p>
      <div
        role="radiogroup"
        aria-label="Send scope"
        className="bg-surface inline-flex h-9 w-fit items-center gap-1 rounded-md p-1"
      >
        {(['domains', 'all'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => void setScope(option)}
            className={cn(
              // The track is `rounded-md` (12) with `p-1`, so its children take
              // 8 to stay concentric — DIRECTION §6, inner = outer − inset.
              'font-ui inline-flex h-7 items-center rounded-sm px-3 text-base outline-none',
              'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
              'focus-ring',
              // Selection is a soft fill and a weight change, matching the
              // capability chips directly above. The Appearance picker's
              // white-thumb-on-sunken recipe cannot be reused here: this
              // control sits *inside* a sunken card, and in the light theme
              // its thumb would be white on white.
              kind === option ? 'bg-fill-selected text-ink font-medium' : 'text-ink-2 hover:text-ink',
            )}
          >
            {option === 'all' ? 'Anyone' : 'Specific domains'}
          </button>
        ))}
      </div>
      {kind === 'domains' && (
        <>
          <textarea
            id={`wren-send-domains-${agentId}`}
            aria-label="Domains this agent may send to"
            value={text}
            spellCheck={false}
            rows={3}
            placeholder={'fernwood.dev\nnorthshoreapp.io'}
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
            className="bg-surface text-ink placeholder:text-ink-3 focus-ring w-full resize-none rounded-sm px-3 py-2 text-base"
          />
          <p className="text-ink-3 text-sm text-pretty">
            One domain per line, matched exactly: example.com does not cover mail.example.com. An
            empty list allows nothing.
          </p>
        </>
      )}
    </div>
  )
}

// -- creating -----------------------------------------------------------------

function CreateAgent() {
  const gateway = useAgentGateway()
  const [name, setName] = useState('')
  const [opening, setOpening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<{ name: string; credential: string } | null>(null)

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const result = await gateway.createAgent(trimmed)
      setIssued({ name: result.agent.name, credential: result.credential })
      setName('')
      setOpening(false)
    } catch (cause) {
      toast.error('Could not create the agent', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  if (issued) return <CredentialOnce issued={issued} onDone={() => setIssued(null)} />

  if (!opening) {
    return (
      <div>
        <PrimaryButton onClick={() => setOpening(true)} className="h-9 gap-2 px-3">
          <Icon name="add" size={16} />
          New agent
        </PrimaryButton>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="wren-agent-name" className="font-ui text-ink-3 text-xs font-semibold uppercase">
        Name
      </label>
      <div className="flex items-center gap-2">
        <input
          id="wren-agent-name"
          value={name}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Scout"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void create()}
          className="bg-sunken text-ink placeholder:text-ink-3 focus-ring h-9 min-w-0 flex-1 rounded-sm px-3 text-base"
        />
        <PrimaryButton
          onClick={() => void create()}
          disabled={busy || name.trim() === ''}
          className="h-9 shrink-0 px-4"
        >
          Create
        </PrimaryButton>
        <button
          type="button"
          onClick={() => {
            setOpening(false)
            setName('')
          }}
          className="font-ui text-ink-2 hover:bg-fill-hover focus-ring h-9 shrink-0 rounded-full px-3 text-base font-medium"
        >
          Cancel
        </button>
      </div>
      <p className="text-ink-3 text-sm text-pretty">
        A label for you, not a login. It appears on every row this agent writes to the audit log.
      </p>
    </div>
  )
}

function CredentialOnce({
  issued,
  onDone,
}: {
  issued: { name: string; credential: string }
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.credential)
      setCopied(true)
      toast.success('Credential copied')
    } catch {
      // Clipboard permission can be refused; the token is on screen and
      // selectable, so this is a downgrade rather than a failure.
      toast.error('Could not copy', { description: 'Select the credential and copy it by hand.' })
    }
  }

  return (
    <div className="border-hairline flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-col gap-1">
        <p className="font-ui text-ink text-base font-medium">{issued.name}'s credential</p>
        <p className="text-ink-3 text-sm text-pretty">
          Copy it into the agent's config now. Wren stored only a hash of it, so this is the one
          time it can be shown — you won't see it again.
        </p>
      </div>
      <p
        data-wren-credential
        className="bg-sunken text-ink rounded-sm px-3 py-2 text-sm break-all select-all"
      >
        {issued.credential}
      </p>
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={() => void copy()} className="h-8 gap-2 px-3">
          {/* No `copy` glyph in the Anron set; `fileText` is the closest honest
              stand-in for "take this text". Swap it the day one lands. */}
          <Icon name={copied ? 'check' : 'fileText'} size={16} />
          {copied ? 'Copied' : 'Copy'}
        </PrimaryButton>
        <button
          type="button"
          onClick={onDone}
          className="font-ui text-ink-2 hover:bg-fill-hover focus-ring h-8 rounded-full px-3 text-base font-medium"
        >
          Done
        </button>
      </div>
    </div>
  )
}
