// The approval queue — the surface that makes granting `send` a reasonable
// thing to do.
//
// Shape: a floating card, ring plus soft shadow, no glass. DIRECTION §7 keeps
// glass to the command palette and the composer; this is a surface opened
// deliberately, read carefully, and full of text that has to be checkable —
// which is precisely what §7 says never to put behind a blur.
//
// Rows rather than cards: a hairline between requests and nothing else, the
// same grouping-by-space rule the thread list uses (DIRECTION §2, Family 1).
//
// Approving runs the real send through MailService and takes the send
// celebration with it — the button's fill crossfades to green, the arrow
// becomes a check, one 200 ms pop, no particles (AMIE-STUDY §7(c).3). The row
// is held on screen for exactly that long before it leaves, so the thing you
// approved is the thing you watch resolve.

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Icon } from '@/components/ui/icon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconButton, PRESS, PrimaryButton } from '@/components/wren-controls'
import { htmlToText } from '@/core'
import type { Approval } from '@/core/agents'
import { useAgentGateway } from '@/features/mail/service'
import { focusThreadList, useSurfaces } from '@/features/shell/surface-store'
import { relativeTime } from '@/lib/format'
import { now } from '@/lib/env'
import { DUR, useMotionMode } from '@/lib/motion'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'

import { AgentBadge } from './identity'
import { agentKeys, useAgentNames, usePendingApprovals } from './queries'

export function ApprovalQueue() {
  const open = useSurfaces((s) => s.approvals)
  const setApprovals = useSurfaces((s) => s.setApprovals)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return
        setApprovals(false)
        focusThreadList()
      }}
    >
      <DialogContent
        showCloseButton={false}
        // 640 is the palette's measure and the widest a body preview stays
        // readable at DIRECTION §4's 68ch cap. The height is capped rather
        // than fixed: an empty queue must not draw a half-metre of nothing.
        // 640 tall is what fits two requests with one of them expanded, which
        // is the shape a triage morning actually arrives in.
        className="bg-raised rounded-2xl shadow-xl flex max-h-[640px] w-[640px] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border-0 p-0 ring-0 sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Waiting on you</DialogTitle>
        <DialogDescription className="sr-only">
          Messages an agent has asked to send. Nothing goes out until you approve it.
        </DialogDescription>
        <QueueBody />
      </DialogContent>
    </Dialog>
  )
}

function QueueBody() {
  const pending = usePendingApprovals()
  const setApprovals = useSurfaces((s) => s.setApprovals)
  const openAudit = useSurfaces((s) => s.openAudit)
  const items = pending.data ?? []

  return (
    <>
      <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b pr-2 pl-6">
        <h2 className="font-ui text-ink min-w-0 flex-1 truncate text-base font-semibold">
          Waiting on you
          {items.length > 0 && (
            <span className="text-ink-3 ml-2 text-sm font-normal tabular-nums">{items.length}</span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => openAudit()}
          className="font-ui text-ink-2 hover:bg-fill-hover hover:text-ink focus-ring h-8 shrink-0 rounded-full px-3 text-base font-medium transition-colors duration-(--wren-dur-fast)"
        >
          Audit log
        </button>
        <IconButton
          name="close"
          label="Close the queue"
          hint="esc"
          className="shrink-0"
          onClick={() => setApprovals(false)}
        />
      </header>

      {/* `scroll-fade`: a request that straddles the bottom edge dissolves
          rather than being guillotined against the canvas (DIRECTION §1, and
          the utility index.css added for exactly this). */}
      <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-6">
        {items.length === 0 ? (
          <EmptyQueue />
        ) : (
          <ul className="flex flex-col">
            {items.map((approval, index) => (
              <PendingRow key={approval.id} approval={approval} first={index === 0} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function EmptyQueue() {
  return (
    // Title plus a one-line why, the shape DIRECTION §2 (Family 2) asks every
    // empty state and every confirm to take.
    <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
      <Icon name="check" size={20} className="text-ink-3" />
      <p className="font-ui text-ink text-base font-medium">Nothing waiting</p>
      <p className="text-ink-3 max-w-80 text-sm text-pretty">
        When an agent asks to send something, it lands here first. A request expires on its own
        after a day.
      </p>
    </div>
  )
}

function PendingRow({ approval, first }: { approval: Approval; first: boolean }) {
  const gateway = useAgentGateway()
  const client = useQueryClient()
  const names = useAgentNames()
  const mode = useMotionMode()
  const [expanded, setExpanded] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const agent = names.get(approval.agentId) ?? {
    id: approval.agentId,
    name: approval.agentId,
    createdAt: 0,
  }
  const draft = approval.payload
  const recipients = [...draft.to, ...draft.cc, ...draft.bcc].map((a) => a.email)
  const preview = htmlToText(draft.bodyHtml).trim()

  const settle = () => {
    void client.invalidateQueries({ queryKey: agentKeys.pending })
  }

  const approve = async () => {
    if (busy) return
    setBusy(true)
    try {
      await gateway.approvals.approve(approval.id)
      playSound('sent')
      setSent(true)
      // Hold the row for the length of the celebration and no longer. Captures
      // and reduced motion collapse the beat to zero — there is nothing to see
      // either way, and waiting would only be waiting.
      const beat = mode === 'full' ? Math.round(DUR.base * 1000) : 0
      window.setTimeout(settle, beat)
    } catch (cause) {
      setBusy(false)
      playSound('error')
      toast.error('Could not send', {
        description: cause instanceof Error ? cause.message : 'The request is still waiting.',
      })
      settle()
    }
  }

  const deny = async () => {
    if (busy) return
    setBusy(true)
    try {
      // Quiet, deliberately: a refusal is recorded in the audit log and needs
      // no toast. Confirming a "no" out loud is how a queue becomes nagging.
      await gateway.approvals.deny(approval.id)
    } catch (cause) {
      toast.error('Could not deny', {
        description: cause instanceof Error ? cause.message : 'Try again.',
      })
    } finally {
      setBusy(false)
      settle()
    }
  }

  return (
    <li
      data-approval-id={approval.id}
      className={cn('flex flex-col gap-3 py-4', !first && 'border-hairline border-t')}
    >
      <div className="flex items-center gap-3">
        <AgentBadge agent={agent} className="min-w-0" />
        <span className="text-ink-3 text-sm">asked to send</span>
        <span className="text-ink-3 ml-auto shrink-0 text-xs tabular-nums">
          {relativeTime(approval.createdAt, now())}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-ui text-ink text-base font-medium text-pretty">
          {draft.subject.trim() || '(no subject)'}
        </p>
        <p className="text-ink-2 text-sm">
          {/* The addresses, in full. A queue that truncated the recipient would
              be asking for a decision it had withheld the facts for. */}
          To {recipients.join(', ') || '(no recipient)'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          // Not the accent. Settings' one disclosure can afford `text-brand`
          // because it is alone on its surface; here there is one per request,
          // and the queue's single accent belongs to Approve (DIRECTION §1).
          className="font-ui text-ink-2 hover:text-ink focus-ring flex h-8 w-fit items-center gap-1 rounded-md text-base font-medium"
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} />
          {expanded ? 'Hide the message' : 'Read the message'}
        </button>
        {expanded && (
          // Plain text in a well, not the sanitized HTML the reading pane
          // renders. This is chrome asking a yes/no question, and an agent's
          // draft is exactly the content that must not get to style itself
          // inside the control that approves it.
          <p
            data-approval-body
            className="bg-sunken text-ink-2 max-h-40 overflow-y-auto rounded-sm px-3 py-2 text-sm whitespace-pre-line text-pretty"
          >
            {preview || 'This message has no body.'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void deny()}
          disabled={busy}
          className="font-ui text-ink-2 hover:bg-fill-hover hover:text-destructive focus-ring h-8 shrink-0 rounded-full px-3 text-base font-medium transition-colors duration-(--wren-dur-fast) disabled:pointer-events-none disabled:opacity-40"
        >
          Deny
        </button>
        <PrimaryButton
          onClick={() => void approve()}
          disabled={busy}
          aria-label={`Approve and send “${draft.subject.trim() || '(no subject)'}”`}
          // The send celebration, exactly as the composer runs it: the fill
          // crossfades to the green solid, the glyph becomes a check, and the
          // button pops once. `disabled:opacity-40` from the recipe would grey
          // the confirmation out the moment it fires, so `sent` overrides it.
          style={
            sent
              ? { animation: 'wren-fill-pop var(--wren-dur-base) var(--wren-ease-spring)' }
              : undefined
          }
          className={cn(
            'h-8 gap-2 px-4 transition-[background-color,color] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
            PRESS,
            sent && 'bg-hue-green text-hue-fg disabled:opacity-100',
          )}
        >
          <Icon name={sent ? 'check' : 'sent'} size={16} key={sent ? 'sent' : 'send'} />
          <span key={sent ? 'sent-label' : 'send-label'} className="wren-swap">
            {sent ? 'Sent' : 'Approve'}
          </span>
        </PrimaryButton>
      </div>
    </li>
  )
}
