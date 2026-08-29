// The approval queue — the thing that makes "send" safe to grant at all.
//
// MCP has no deferred-approval primitive (docs/research/mcp-gateway-notes.md
// §4): `tools/call` is synchronous request/response, there is no pending call
// state, and no callback. The spec's own answer to "needs a human" is the
// client's per-call confirmation dialog, which is the wrong shape for mail —
// it fires while the agent waits, and it shows the human a tool call rather
// than a message.
//
// So this is the app-level composition the notes describe: `submit` returns a
// pending id immediately, the agent's tool call returns that id and finishes,
// and the human resolves it later in Wren's own UI. Nothing here ever blocks
// on a person.
//
// Everything is audited. An approval that was never resolved is as much a fact
// as one that was.

import type { ComposeDraft, MailService } from '../types'
import type { AgentStore, Approval, AgentEvent } from './types'
import type { AuditLog } from './audit'

/**
 * How long a pending send stays actionable. A day, because the queue is a
 * morning ritual: something asked for overnight should still be there with
 * coffee, and something from last week should not be sent by a misclick.
 */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000

/** Only `send` needs the mail seam, so only `send` is asked for. */
export type SendSeam = Pick<MailService, 'send'>

export interface ApprovalQueueDeps {
  store: AgentStore
  audit: AuditLog
  mail: SendSeam
  /** Display names for audit summaries and the notification title. */
  nameOf: (agentId: string) => Promise<string>
  emit: (event: AgentEvent) => void
  now: () => number
  id: () => string
}

/** One line describing a draft, for the log and the notification body. */
export function describeDraft(draft: ComposeDraft): string {
  const to = draft.to.map((a) => a.email).join(', ') || '(no recipient)'
  const subject = draft.subject.trim() || '(no subject)'
  return `“${subject}” to ${to}`
}

export class ApprovalQueue {
  constructor(private readonly deps: ApprovalQueueDeps) {}

  /**
   * Queue a send. Returns immediately with a pending approval whose id is what
   * the agent's `request_send` call answers with.
   *
   * The caller has already checked the grant — this is the human gate, not the
   * capability gate, and the two are deliberately separate: an agent with no
   * `send` grant never reaches the queue at all, and the queue never re-decides
   * what the grant model already decided.
   */
  async submit(draft: ComposeDraft, agentId: string): Promise<Approval> {
    const approval: Approval = {
      id: this.deps.id(),
      agentId,
      kind: 'send',
      payload: draft,
      status: 'pending',
      createdAt: this.deps.now(),
    }
    await this.deps.store.putApproval(approval)
    await this.deps.audit.append({
      agentId,
      tool: 'request_send',
      summary: `Asked to send ${describeDraft(draft)}.`,
      threadKey: draft.reply?.threadKey,
      outcome: 'pending',
    })

    const agentName = await this.deps.nameOf(agentId)
    this.deps.emit({ type: 'approvalPending', approval, agentName })
    await this.announce()
    return approval
  }

  /** Pending, newest first. Expiry is swept on the way past. */
  async listPending(): Promise<Approval[]> {
    await this.expireStale()
    return this.deps.store.listApprovals('pending')
  }

  /** The badge's number. */
  async pendingCount(): Promise<number> {
    return (await this.listPending()).length
  }

  /**
   * Send it. The one place an agent's draft becomes real mail.
   *
   * The order matters: dispatch first, mark second. Marking approved and then
   * failing to send would leave a message the log says went out and the
   * mailbox says never did. A failed dispatch leaves the approval pending, so
   * the human can try again.
   */
  async approve(id: string): Promise<Approval> {
    await this.expireStale()
    const approval = await this.require(id)
    if (approval.status !== 'pending') {
      throw new Error(`This request was already ${approval.status}.`)
    }

    try {
      await this.deps.mail.send(approval.payload)
    } catch (cause) {
      await this.deps.audit.append({
        agentId: approval.agentId,
        tool: 'send',
        summary: `Send failed for ${describeDraft(approval.payload)}.`,
        threadKey: approval.payload.reply?.threadKey,
        outcome: 'error',
      })
      this.deps.emit({ type: 'approvalsChanged', pending: await this.rawPendingCount() })
      throw cause
    }

    const at = this.deps.now()
    await this.deps.store.setApprovalStatus(id, 'approved', at)
    await this.deps.audit.append({
      agentId: approval.agentId,
      tool: 'send',
      summary: `You approved ${describeDraft(approval.payload)}. Sent.`,
      threadKey: approval.payload.reply?.threadKey,
      outcome: 'ok',
    })
    await this.announce()
    return { ...approval, status: 'approved', resolvedAt: at }
  }

  /** Refuse it. Quiet: the log is the record, there is no toast and no reply. */
  async deny(id: string): Promise<Approval> {
    await this.expireStale()
    const approval = await this.require(id)
    if (approval.status !== 'pending') {
      throw new Error(`This request was already ${approval.status}.`)
    }
    const at = this.deps.now()
    await this.deps.store.setApprovalStatus(id, 'denied', at)
    await this.deps.audit.append({
      agentId: approval.agentId,
      tool: 'send',
      summary: `You denied ${describeDraft(approval.payload)}. Nothing was sent.`,
      threadKey: approval.payload.reply?.threadKey,
      outcome: 'denied',
    })
    await this.announce()
    return { ...approval, status: 'denied', resolvedAt: at }
  }

  /**
   * Retire anything older than the TTL. Checked lazily — on every read and
   * before every resolution — rather than on a timer.
   *
   * A timer would be a persistent monitor for a queue that is usually empty,
   * it would tick while the app is asleep and it would still have to re-check
   * on wake. The lazy sweep cannot be wrong at the moment it matters, which is
   * the moment somebody looks.
   *
   * Returns how many it retired.
   */
  async expireStale(): Promise<number> {
    const now = this.deps.now()
    const pending = await this.deps.store.listApprovals('pending')
    const stale = pending.filter((a) => now - a.createdAt >= APPROVAL_TTL_MS)
    for (const approval of stale) {
      await this.deps.store.setApprovalStatus(approval.id, 'expired', now)
      await this.deps.audit.append({
        agentId: approval.agentId,
        tool: 'send',
        summary: `Request expired unanswered after 24 hours: ${describeDraft(approval.payload)}.`,
        threadKey: approval.payload.reply?.threadKey,
        outcome: 'expired',
        at: now,
      })
    }
    if (stale.length > 0) {
      this.deps.emit({ type: 'approvalsChanged', pending: await this.rawPendingCount() })
    }
    return stale.length
  }

  private async require(id: string): Promise<Approval> {
    const approval = await this.deps.store.getApproval(id)
    if (!approval) throw new Error(`No such approval: ${id}`)
    return approval
  }

  /** Count without sweeping — the sweep is what calls this. */
  private async rawPendingCount(): Promise<number> {
    return (await this.deps.store.listApprovals('pending')).length
  }

  private async announce(): Promise<void> {
    this.deps.emit({ type: 'approvalsChanged', pending: await this.rawPendingCount() })
  }
}
