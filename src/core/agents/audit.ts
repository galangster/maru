// The audit log. Append-only, read newest-first, capped per read.
//
// Nothing in this file can fail an agent's request: an action that happened is
// a fact, and a full disk must not be able to make it un-happen. `append`
// therefore never throws at its callers — it returns the entry it wrote so the
// caller can emit it, and swallows a store failure into the console.
//
// The cap is 500 per read and it is not a preference. The timeline is a
// scrolling table with no virtualizer, and an agent that ran overnight can put
// tens of thousands of rows behind it.

import type { AgentStore, AuditDraft, AuditEntry } from './types'

/** The most rows one read will ever return. */
export const AUDIT_READ_CAP = 500

export interface AuditLogDeps {
  store: AgentStore
  /** Injected so tests and fixtures own the clock. */
  now: () => number
  /** Injected so ids are deterministic under test. */
  id: () => string
  /**
   * Fired after a successful append. The gateway uses it to put the entry on
   * the event bus, so the timeline refreshes without every caller of `append`
   * having to remember to emit — and there are a dozen of them.
   */
  onAppend?: (entry: AuditEntry) => void
}

export class AuditLog {
  constructor(private readonly deps: AuditLogDeps) {}

  /**
   * Write one line. `at` may be supplied by fixtures; live callers leave it
   * off and get the injected clock.
   */
  async append(draft: AuditDraft): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: this.deps.id(),
      agentId: draft.agentId,
      at: draft.at ?? this.deps.now(),
      tool: draft.tool,
      summary: draft.summary,
      threadKey: draft.threadKey,
      outcome: draft.outcome,
    }
    try {
      await this.deps.store.appendAudit(entry)
    } catch (cause) {
      // Deliberately swallowed — see the file header. The entry is still
      // returned so the session's own view is honest.
      console.error('[wren] audit append failed', cause)
    }
    this.deps.onAppend?.(entry)
    return entry
  }

  /**
   * Recent first. `limit` is clamped to AUDIT_READ_CAP in both directions: a
   * caller asking for 10_000 gets 500, and a caller asking for 0 or a negative
   * gets 1 rather than an empty list that reads as "nothing happened".
   */
  async query(opts: { agentId?: string; limit?: number } = {}): Promise<AuditEntry[]> {
    const requested = opts.limit ?? AUDIT_READ_CAP
    const limit = Math.min(AUDIT_READ_CAP, Math.max(1, Math.floor(requested)))
    return this.deps.store.listAudit({ agentId: opts.agentId, limit })
  }
}
