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

import { copyText } from '@/lib/clipboard'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmPopover } from '@/components/confirm-popover'
import { Icon } from '@/components/ui/icon'
import { PRESS, PrimaryButton, SECTION_LABEL, textButtonClass } from '@/components/wren-controls'
import type { Agent, AgentSession, Capability, Grant } from '@/core/agents'
import {
  CAPABILITIES,
  DEFAULT_SESSION_MS,
  DEMO_AGENT,
  DEMO_AGENT_CREDENTIAL,
  humanDuration,
  minutesLeft,
  SESSION_DURATIONS_MS,
} from '@/core/agents'
import { useAgentGateway, useMailMode } from '@/features/mail/service'
import { useSurfaces } from '@/features/shell/surface-store'
import { relativeTime } from '@/lib/format'
import { now, openExternalUrl } from '@/lib/env'
import { cn } from '@/lib/utils'

import { AgentDot, CAPABILITY_COPY, scopeSummary } from './identity'
import { useAgents, useHeldGrants, useSessions } from './queries'

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
  const sessions = useSessions().data ?? []
  const openAudit = useSurfaces((s) => s.openAudit)
  const list = agents.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-3 text-sm text-pretty">
        An agent connects with a credential Wren issues, not with a name it claims. It starts with
        nothing and holds only what you grant it here.
      </p>

      {list.length === 0 ? (
        <FirstAgentGuide />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              held={held.get(agent.id) ?? {}}
              session={sessions.find((item) => item.agentId === agent.id) ?? null}
            />
          ))}
        </ul>
      )}

      <CreateAgent />

      {/* The same control as the queue header's "Audit log", so it takes the
          same shape: a pill with a hover fill, which is what DIRECTION §6 makes
          every button. It was `rounded-md` with no hover here, and the focus
          ring follows the radius, so the two differed twice over (N1). */}
      <button
        type="button"
        onClick={() => openAudit()}
        className={textButtonClass('default', 'w-fit')}
      >
        Open the audit log
      </button>
    </div>
  )
}

/**
 * The onboarding's agent half (P4), in the app rather than only in docs: what
 * happens after "Create". Shown only while no agent exists — once one does,
 * its card carries the real credential moment and this guide has done its job.
 */
const CONNECT_COMMAND = 'claude mcp add wren -- npx wren-mcp --token <credential>'

function FirstAgentGuide() {
  return (
    <div className="bg-surface flex flex-col gap-3 rounded-lg p-4 shadow-xs">
      <ol className="text-ink-2 flex list-decimal flex-col gap-2 pl-4 text-sm">
        <li>Create an agent below. Wren issues a credential and shows it once.</li>
        <li>
          <span>Register the shim with your agent, credential in hand:</span>
          <button
            type="button"
            onClick={() => {
              void copyText(CONNECT_COMMAND).then((ok) =>
                ok ? toast.success('Command copied') : toast.error('Could not reach the clipboard'),
              )
            }}
            className="focus-ring bg-fill-hover text-ink mt-1.5 block w-full truncate rounded-md px-2.5 py-1.5 text-left font-mono text-xs"
            title="Copy the command"
          >
            {CONNECT_COMMAND}
          </button>
        </li>
        <li>Grant it capabilities here. It starts with nothing, on purpose.</li>
      </ol>
      <button
        type="button"
        onClick={() => void openExternalUrl('https://github.com/galangster/wren/blob/main/docs/CONNECT-AN-AGENT.md')}
        className={textButtonClass('default', 'w-fit')}
      >
        The full guide, other clients included
      </button>
    </div>
  )
}

// -- one agent ----------------------------------------------------------------

function AgentCard({
  agent,
  held,
  session,
}: {
  agent: Agent
  held: Partial<Record<Capability, Grant>>
  session: AgentSession | null
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
                className={textButtonClass('danger', 'shrink-0')}
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
          <SessionBlock agent={agent} held={held} session={session} />
          <CapabilityToggles agentId={agent.id} agentName={agent.name} held={held} />
          {send && <SendScopeEditor agentId={agent.id} grant={send} />}
          <FixtureCredential agent={agent} />
        </>
      )}
    </li>
  )
}

function SessionBlock({
  agent,
  held,
  session,
}: {
  agent: Agent
  held: Partial<Record<Capability, Grant>>
  session: AgentSession | null
}) {
  const gateway = useAgentGateway()
  const [opening, setOpening] = useState(false)
  const [duration, setDuration] = useState<number>(DEFAULT_SESSION_MS)
  const [busy, setBusy] = useState(false)
  const remainingMinutes = session ? minutesLeft(session, now()) : null

  const start = async () => {
    if (busy) return
    setBusy(true)
    try {
      await gateway.sessions.start(agent.id, duration)
      setOpening(false)
    } catch (cause) {
      toast.error('Could not start the session', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  const end = async () => {
    if (busy) return
    setBusy(true)
    try {
      await gateway.sessions.end(agent.id)
    } catch (cause) {
      toast.error('Could not end the session', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  const allowed = CAPABILITIES.filter((capability) => held[capability])
  let dataClasses = 'No mail data until you grant a capability'
  if (held.read) {
    dataClasses = 'Message content, addresses, subjects, attachments'
  } else if (held.draft || held.send) {
    dataClasses = 'Draft content, addresses, subjects'
  } else if (held.archiveLabel) {
    dataClasses = 'Thread keys and labels'
  }

  return (
    <div className="bg-surface flex flex-col gap-2 rounded-md p-3">
      <p className={SECTION_LABEL}>Agent session</p>
      {session ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-2 text-sm">Session active — ends in {remainingMinutes} min.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void end()}
            className={textButtonClass('default', 'shrink-0 disabled:opacity-50')}
          >
            End session
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-ink-2 text-sm">No active session — mail tools are locked.</p>
            <button
              type="button"
              onClick={() => setOpening(true)}
              className={textButtonClass('default', 'shrink-0')}
            >
              Start session…
            </button>
          </div>
          {opening && (
            <div className="bg-sunken flex flex-col gap-3 rounded-sm p-3">
              <div className="flex flex-col gap-1 text-sm">
                <p className="text-ink font-medium">{agent.name}</p>
                <p className="text-ink-3">
                  Created {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(agent.createdAt)}
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <p className={SECTION_LABEL}>Allowed actions</p>
                {allowed.length === 0 ? (
                  <p className="text-ink-3 text-sm">Nothing yet. Grant a capability first.</p>
                ) : (
                  <ul className="text-ink-2 flex list-disc flex-col gap-1 pl-4 text-sm">
                    {allowed.map((capability) => (
                      <li key={capability}>
                        {CAPABILITY_COPY[capability].label}. {CAPABILITY_COPY[capability].help}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-ink-2 text-sm">Data: {dataClasses}.</p>
              <p className="text-ink-2 text-sm text-pretty">
                Mail this agent reads leaves Wren for whatever model or service the agent runs on.
              </p>

              <fieldset className="flex flex-col gap-2">
                <legend className={SECTION_LABEL}>Duration</legend>
                <div role="group" aria-label="Session duration" className="flex flex-wrap gap-2">
                  {SESSION_DURATIONS_MS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={duration === value}
                      onClick={() => setDuration(value)}
                      className={cn(
                        'font-ui focus-ring h-8 rounded-full px-3 text-base',
                        duration === value
                          ? 'bg-fill-selected text-ink font-medium'
                          : 'text-ink-2 hover:bg-fill-hover',
                      )}
                    >
                      {humanDuration(value)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpening(false)}
                  className={textButtonClass('default')}
                >
                  Keep locked
                </button>
                <PrimaryButton
                  disabled={busy}
                  onClick={() => void start()}
                  className="h-8 px-3"
                >
                  Start session
                </PrimaryButton>
              </div>
            </div>
          )}
        </>
      )}
    </div>
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
    // Depth by fill, not by a stroke. This card and the credential card below
    // were the two stroked, unfilled boxes in a file whose own AgentCard
    // carries the comment arguing against exactly that (S8, DIRECTION §1). It
    // sits inside the sunken AgentCard, so it steps *up* to `surface` and its
    // own well steps back down — the same alternation the send-scope textarea
    // already uses one section below.
    <div className="bg-surface flex flex-col gap-2 rounded-md p-3">
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
  agentName,
  held,
}: {
  agentId: string
  agentName: string
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
      <p className={SECTION_LABEL}>Capabilities</p>
      <div role="group" aria-label="Capabilities" className="flex flex-wrap gap-2">
        {CAPABILITIES.map((capability) => {
          const on = Boolean(held[capability])
          return (
            <button
              key={capability}
              type="button"
              aria-pressed={on}
              // Two identical words down a list of agents, so the label says
              // whose — which it claimed to and did not: the measured name was
              // "Read — Search the mailbox and open threads", with the agent
              // missing from the one control whose whole question is which
              // agent (S6). No `title`: it duplicated the accessible name, is
              // mouse-only, cannot be styled, and the help text is already
              // rendered as visible prose below (S7, and N7 of the prior cycle
              // reintroduced).
              aria-label={`${CAPABILITY_COPY[capability].label} for ${agentName} — ${CAPABILITY_COPY[capability].help}`}
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
                //
                // "Off" carries no fill at all. It used to be `bg-surface`,
                // which on this sunken card is pure white — so the *ungranted*
                // chip read as the brighter, raised one and a permission that
                // was ON was the quieter of the two (S10). On a permissions
                // control the consequential state is the loud one. The glyph
                // steps with it rather than sitting at `text-ink-3` in both.
                on
                  ? 'bg-fill-selected text-ink font-medium'
                  : 'text-ink-2 hover:bg-fill-hover',
              )}
            >
              <Icon
                name={on ? 'check' : 'add'}
                size={16}
                className={on ? 'text-ink' : 'text-ink-3'}
              />
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

  /**
   * One queue, so two writes to the same grant cannot land out of order.
   *
   * Switching the radio to "Anyone" fires `commit()` from the textarea's blur
   * and `setScope('all')` from the click, as two independent `gateway.grant`
   * calls against the same key with no ordering guarantee — and the loser
   * decides what this agent may send (N8). Chaining is enough: both writes are
   * wanted, only their order was undefined.
   */
  const queue = useRef<Promise<void>>(Promise.resolve())
  const enqueue = (write: () => Promise<unknown>) => {
    queue.current = queue.current.then(async () => {
      try {
        await write()
      } catch (cause) {
        toast.error('Could not change the send scope', {
          description: cause instanceof Error ? cause.message : String(cause),
        })
      }
    })
  }

  const setScope = (next: 'all' | 'domains', list = domains) => {
    enqueue(() =>
      gateway.grant(
        agentId,
        'send',
        next === 'all' ? { kind: 'all' } : { kind: 'domains', domains: list },
      ),
    )
  }

  const commit = () => {
    const list = text
      .split(/[\s,]+/)
      .map((d) => d.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean)
    if (list.join('\n') === domains.join('\n')) return
    setText(list.join('\n'))
    setScope('domains', list)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className={SECTION_LABEL}>Send to</p>
      {/* A group of pressed toggles rather than a `role="radiogroup"`. The
          radiogroup role promises roving tabindex and arrow-key traversal, and
          this control implemented neither: each option was its own tab stop and
          the arrow keys did nothing (B2). It takes the capability chips'
          pattern instead — the one honest control of the three, sixty lines
          above. */}
      <div
        role="group"
        aria-label="Send scope"
        className="bg-surface inline-flex h-9 w-fit items-center gap-1 rounded-md p-1"
      >
        {(['domains', 'all'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            onClick={() => setScope(option)}
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
      <label htmlFor="wren-agent-name" className={SECTION_LABEL}>
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
  const [confirming, setConfirming] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  // The one-time secret takes focus the moment it appears. It is the keyboard
  // path to a string the clipboard-failure toast asks the user to select by
  // hand, and it is also what announces the screen: the form that was focused
  // is gone, and without this focus fell to the Settings dialog root and a
  // screen-reader user got no signal that an irreversible thing was on screen
  // (S1).
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])

  const copy = async () => {
    try {
      if (!(await copyText(issued.credential))) throw new Error('clipboard refused')
      setCopied(true)
      toast.success('Credential copied')
    } catch {
      // Clipboard permission can be refused; the token is on screen, focusable
      // and selectable, so this is a downgrade rather than a failure.
      toast.error('Could not copy', { description: 'Select the credential and copy it by hand.' })
    }
  }

  const doneClass =
    'font-ui text-ink-2 hover:bg-fill-hover focus-ring h-8 rounded-full px-3 text-base font-medium'

  return (
    // `bg-sunken`, no stroke: depth by fill, matching the AgentCard this file
    // argues for 340 lines earlier (S8, DIRECTION §1).
    <div className="bg-sunken flex flex-col gap-3 rounded-md p-4">
      <div className="flex flex-col gap-1">
        <p className="font-ui text-ink text-base font-medium">{issued.name}'s credential</p>
        {/* Out of the meta tier. This line carries the only irreversible
            consequence in the app and it was set in `text-3`, the tier
            DIRECTION §3 reserves for timestamps and counts — the quietest type
            in Wren on the loudest sentence in it (S1). `text-ink-2` plus the
            star hue on the mark: star is the app's own warning colour and this
            is the one place worth spending it. */}
        <p className="text-ink-2 flex gap-2 text-sm text-pretty">
          {/* `mt-px`: a documented 1 px optical nudge, the second of
              DIRECTION §5's two licensed exceptions to the 4 px grid. */}
          <Icon name="error" size={16} className="text-star mt-px shrink-0" />
          <span>
            Copy it into the agent's config now. Wren stored only a hash of it, so this is the one
            time it can be shown — you won't see it again.
          </span>
        </p>
      </div>
      {/* A read-only input, not a `<p>` with `user-select: all`. The paragraph
          was clickable but not focusable (`tabIndex = -1`, measured), so the
          "select it and copy it by hand" fallback was an instruction a
          keyboard-only user could not follow. ⌘A works here, and so does a
          screen reader's own text navigation. */}
      <input
        ref={field}
        data-wren-credential
        readOnly
        spellCheck={false}
        value={issued.credential}
        aria-label={`One-time credential for ${issued.name}`}
        onFocus={(event) => event.currentTarget.select()}
        className="bg-surface text-ink focus-ring w-full rounded-sm px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={() => void copy()} className="h-8 gap-2 px-3">
          {/* No `copy` glyph in the Anron set; `fileText` is the closest honest
              stand-in for "take this text". Swap it the day one lands. */}
          <Icon name={copied ? 'check' : 'fileText'} size={16} />
          {copied ? 'Copied' : 'Copy'}
        </PrimaryButton>
        {/* `copied` was tracked and then never used: Done discarded the one
            copy of the credential permanently, on one unguarded click, in an
            app that already asks before discarding a *draft* (S1). It asks now
            — but only while the credential has not been copied, so the ordinary
            path stays one click. */}
        {copied ? (
          <button type="button" onClick={onDone} className={doneClass}>
            Done
          </button>
        ) : (
          <ConfirmPopover
            open={confirming}
            onOpenChange={setConfirming}
            title="Discard the credential?"
            description="It has not been copied yet, and Wren keeps only a hash of it. Closing this is the last time it exists."
            cancelLabel="Keep it open"
            confirmLabel="Discard"
            onConfirm={onDone}
            trigger={<button type="button" className={doneClass} />}
            triggerContent="Done"
          />
        )}
      </div>
    </div>
  )
}
