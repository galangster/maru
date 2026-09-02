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
import {
  IconButton,
  META_TEXT,
  PRESS,
  PrimaryButton,
  SEND_BUTTON,
  SurfaceEmpty,
  SurfaceHeader,
  textButtonClass,
} from '@/components/wren-controls'
import { htmlToText } from '@/core'
import type { Approval } from '@/core/agents'
import { outgoingBytes } from '@/core/mime'
import { useAgentGateway } from '@/features/mail/service'
import { focusThreadList, useSurfaces } from '@/features/shell/surface-store'
import { attachmentIcon, formatBytes, elapsedTime, fullTimestamp } from '@/lib/format'
import { now } from '@/lib/env'
import { DUR, useMotionMode } from '@/lib/motion'
import { cue } from '@/lib/cue'
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
        //
        // Anchored to a fixed top rather than centred, which every other dialog
        // still is. A centred card grows from its middle, so expanding request
        // two moved request one's Approve up 75 px — an unannounced jump on the
        // control that sends mail, with the cursor already in flight toward it
        // (UI-REVIEW-2026-08-29 S3). Pinned at the top the card only ever grows
        // downward, and nothing above the row being read moves at all.
        className="bg-raised rounded-2xl shadow-xl top-24 flex max-h-[min(640px,calc(100dvh-8rem))] w-[640px] max-w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0 ring-0 sm:max-w-[640px]"
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

/**
 * Move focus off a row that is about to be unmounted.
 *
 * The row that owned focus is removed by the query invalidation in `settle()`,
 * and nothing catches it: the removal happens outside Base UI's focus-management
 * scope, so `document.activeElement` fell back to `<body>` while the dialog was
 * still open and one request still waiting (UI-REVIEW-2026-08-29 B1).
 *
 * The next request's Approve, then the previous one's — a queue is worked
 * downward, and the row after the one just settled is the one being decided
 * next. When this was the last request there is nothing left to decide, so
 * focus lands on the queue's own close button.
 */
function focusAfterSettle(id: string): void {
  const rows = [...document.querySelectorAll<HTMLElement>('li[data-approval-id]')]
  const index = rows.findIndex((row) => row.dataset.approvalId === id)
  const neighbour = index >= 0 ? (rows[index + 1] ?? rows[index - 1]) : undefined
  const target =
    neighbour?.querySelector<HTMLElement>('[data-approval-approve]') ??
    document.querySelector<HTMLElement>('[data-wren-queue-close]')
  target?.focus()
}

/** Every recipient is on screen; the announcement names one and counts the rest. */
function spokenRecipients(list: string[]): string {
  if (list.length === 0) return 'nobody'
  if (list.length === 1) return list[0]
  return `${list[0]} and ${list.length - 1} more`
}

function QueueBody() {
  const pending = usePendingApprovals()
  const setApprovals = useSurfaces((s) => s.setApprovals)
  const openAudit = useSurfaces((s) => s.openAudit)
  const items = pending.data ?? []

  // Approve's confirmation is a fill-and-glyph swap on a node that is then
  // removed, and Deny is deliberately toastless — so for assistive technology
  // both outcomes were silent (B1). One polite region, mounted for the life of
  // the queue rather than created with its own text, which is what makes it
  // announce at all.
  const [announcement, setAnnouncement] = useState('')
  const announce = (outcome: string) => {
    const left = items.length - 1
    setAnnouncement(
      left > 0
        ? `${outcome} ${left} request${left === 1 ? '' : 's'} left.`
        : `${outcome} Nothing waiting.`,
    )
  }

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <SurfaceHeader
        title={
          <>
            Waiting on you
            {items.length > 0 && (
              <span className="text-ink-3 ml-2 text-sm font-normal tabular-nums">
                {items.length}
              </span>
            )}
          </>
        }
      >
        <button
          type="button"
          onClick={() => openAudit()}
          className={textButtonClass('default', 'shrink-0')}
        >
          Audit log
        </button>
        <IconButton
          name="close"
          label="Close the queue"
          hint="esc"
          data-wren-queue-close=""
          className="shrink-0"
          onClick={() => setApprovals(false)}
        />
      </SurfaceHeader>

      {/* `scroll-fade`: a request that straddles the bottom edge dissolves
          rather than being guillotined against the canvas (DIRECTION §1, and
          the utility index.css added for exactly this). */}
      <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-6">
        {items.length === 0 ? (
          <EmptyQueue />
        ) : (
          <ul className="flex flex-col">
            {items.map((approval, index) => (
              <PendingRow
                key={approval.id}
                approval={approval}
                first={index === 0}
                announce={announce}
              />
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
    <SurfaceEmpty icon="check" title="Nothing waiting">
      When an agent asks to send something, it lands here first. A request expires on its own
      after a day.
    </SurfaceEmpty>
  )
}

function PendingRow({
  approval,
  first,
  announce,
}: {
  approval: Approval
  first: boolean
  announce: (outcome: string) => void
}) {
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
      cue('sent')
      setSent(true)
      announce(`Sent to ${spokenRecipients(recipients)}.`)
      // Focus moves now rather than with the row. `disabled` blurs the button
      // the moment `busy` lands, so waiting out the celebration beat would
      // leave 200 ms of the exact focus-on-<body> state B1 is about.
      focusAfterSettle(approval.id)
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
      // Quiet to the eye is not the same as silent, though — the live region
      // still says it happened, because the row that said it is leaving.
      await gateway.approvals.deny(approval.id)
      announce('Denied.')
      focusAfterSettle(approval.id)
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
        {/* An age, not a clock time, and the absolute time on the title the way
            the audit table hedges the same column (S4). */}
        <span
          title={fullTimestamp(approval.createdAt)}
          className={cn(META_TEXT, 'ml-auto')}
        >
          {elapsedTime(approval.createdAt, now())}
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
        {draft.attachments.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-2">
            {/* Same principle as the addresses: what would actually leave the
                machine is on the card, never behind the disclosure. */}
            {draft.attachments.map((attachment, index) => (
              <li
                key={`${attachment.filename}:${index}`}
                className="bg-sunken text-ink-2 flex h-6 items-center gap-1.5 rounded-full px-2 text-xs"
              >
                <Icon name={attachmentIcon(attachment.mimeType)} size={16} className="text-ink-3" />
                <span className="max-w-48 truncate">{attachment.filename}</span>
                <span className={META_TEXT}>
                  {formatBytes(outgoingBytes(attachment))}
                </span>
              </li>
            ))}
          </ul>
        )}
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
          className={textButtonClass('danger', 'shrink-0 disabled:pointer-events-none disabled:opacity-40')}
        >
          Deny
        </button>
        <PrimaryButton
          onClick={() => void approve()}
          disabled={busy}
          data-approval-approve=""
          aria-label={`Approve and send “${draft.subject.trim() || '(no subject)'}”`}
          // The send celebration, exactly as the composer runs it: the fill
          // crossfades to the green solid, the glyph becomes a check, and the
          // button pops once. `confirming` keeps the recipe's unavailable fill
          // off it while `busy` holds the button disabled.
          confirming={sent}
          style={
            sent
              ? { animation: 'wren-fill-pop var(--wren-dur-base) var(--wren-ease-spring)' }
              : undefined
          }
          className={cn(SEND_BUTTON, PRESS)}
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
