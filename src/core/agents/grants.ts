// Grants, and the one function that answers "may this agent do this, to this
// recipient, now".
//
// `evaluate` is pure and takes the grant rows as data. That is not a testing
// convenience: it is what makes the answer auditable. The rule set below is
// the whole authority, it is nine lines of logic, and every caller — the MCP
// server in M2, the approval queue, the Settings UI's summary line — reads the
// same one. A second copy of "may it send here?" is a second thing that can
// disagree with the log.
//
// THE RULE SET
//
//  1. A grant authorizes exactly the capability named on it. `read` implies
//     nothing else. There is no hierarchy and no wildcard.
//  2. A revoked agent is denied every capability, whatever its grants say.
//  3. A grant row with `revokedAt` at or before `now` is not a grant.
//  4. Revocation wins backwards: a revocation of a capability suppresses every
//     grant of that capability issued *before* the revocation, not only the
//     row it was stamped on. Restoring the capability means issuing a new
//     grant, dated at or after the revocation. (A row issued in the same
//     instant as the revocation is caught by rule 3, because a revoke stamps
//     every live row it covers — rule 4 is what protects against a row the
//     stamp never reached.)
//  5. A grant issued in the future is not yet a grant.
//  6. Only `send` consults the scope. The other three ignore recipients.
//  7. A `send` with no recipients is denied — there is nothing to authorize.
//  8. Scope `all` admits every recipient; `domains` admits a recipient whose
//     own domain matches one listed, case-folded and exact, never by suffix;
//     `recipients` admits a recipient whose whole address is listed.
//  9. EVERY recipient must be admitted. One address outside the scope denies
//     the whole send — a grant for one domain must not become a mailing list
//     because a stranger was cc'd.

import type { EmailAddress } from '../types'
import type { AgentStore, Agent, Capability, Grant, GrantScope } from './types'
import { SCOPE_ALL } from './types'

export type DenyReason =
  /** Nothing was ever granted for this capability. */
  | 'no-grant'
  /** The agent itself is revoked. */
  | 'agent-revoked'
  /** The grant existed and was withdrawn. */
  | 'revoked'
  /** A send with an empty recipient list. */
  | 'no-recipients'
  /** At least one recipient sits outside every live grant's scope. */
  | 'out-of-scope'

export type Decision =
  | { allowed: true; grant: Grant }
  | { allowed: false; reason: DenyReason; blocked?: string[] }

export interface EvaluationContext {
  now: number
  /**
   * The agent the grants belong to. Optional so a caller that has already
   * checked the identity can pass grants alone — but rule 2 only runs when it
   * is supplied, which is why the gateway always supplies it.
   */
  agent?: Agent
  /** Send only. Every address the message would reach: to + cc + bcc. */
  recipients?: string[]
}

/** `Maya <MAYA@Fernwood.dev>` and `maya@fernwood.dev` are one person. */
function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}

/** The part after the last `@`. `''` for anything that is not an address. */
export function domainOf(address: string): string {
  const at = normalizeAddress(address).lastIndexOf('@')
  return at === -1 ? '' : normalizeAddress(address).slice(at + 1)
}

/** Tolerates `@example.com` and ` Example.COM ` in the settings textarea. */
function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, '')
}

/** Every address a draft would reach — the list rule 9 is checked against. */
export function recipientsOf(draft: {
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
}): string[] {
  return [...draft.to, ...draft.cc, ...draft.bcc].map((a) => normalizeAddress(a.email))
}

/** Rule 8, for one address against one scope. */
export function scopeAdmits(scope: GrantScope, recipient: string): boolean {
  const address = normalizeAddress(recipient)
  if (address === '') return false
  switch (scope.kind) {
    case 'all':
      return true
    case 'domains': {
      const domain = domainOf(address)
      // Exact, never a suffix: `endsWith('example.com')` would hand
      // `evil-example.com` a grant it was never given.
      return domain !== '' && scope.domains.some((d) => normalizeDomain(d) === domain)
    }
    case 'recipients':
      return scope.emails.some((e) => normalizeAddress(e) === address)
  }
}

/**
 * Rules 3–5: the grants for one capability that are in force at `now`.
 *
 * Exported because the Settings UI draws its summary line from exactly this
 * set. A component that filtered the rows itself would be rule 4 written
 * twice, and the copy in the UI is the one nobody would think to test.
 */
export function liveGrants(
  grants: readonly Grant[],
  capability: Capability,
  now: number,
): Grant[] {
  const forCapability = grants.filter((g) => g.capability === capability)

  // Rule 4. The latest revocation that has already happened draws a line;
  // nothing issued at or before it survives.
  let revokedThrough: number | undefined
  for (const grant of forCapability) {
    if (grant.revokedAt === undefined || grant.revokedAt > now) continue
    if (revokedThrough === undefined || grant.revokedAt > revokedThrough) {
      revokedThrough = grant.revokedAt
    }
  }

  return forCapability.filter((grant) => {
    if (grant.revokedAt !== undefined && grant.revokedAt <= now) return false // rule 3
    if (grant.grantedAt > now) return false // rule 5
    if (revokedThrough !== undefined && grant.grantedAt < revokedThrough) return false // rule 4
    return true
  })
}

/**
 * The single authority. Pure: same inputs, same answer, forever, which is what
 * lets an audit row from six months ago still be explained.
 */
export function evaluate(
  grants: readonly Grant[],
  capability: Capability,
  context: EvaluationContext,
): Decision {
  // Rule 2 first: a revoked identity is not asked what it holds.
  if (context.agent?.revokedAt !== undefined && context.agent.revokedAt <= context.now) {
    return { allowed: false, reason: 'agent-revoked' }
  }

  const live = liveGrants(grants, capability, context.now)
  if (live.length === 0) {
    // Rules 1, 3 and 4 all land here; the reason distinguishes "never had it"
    // from "had it and lost it", because those are different conversations to
    // have with the person reading the log.
    const everHeld = grants.some((g) => g.capability === capability)
    return { allowed: false, reason: everHeld ? 'revoked' : 'no-grant' }
  }

  // Rule 6: only send looks at recipients.
  if (capability !== 'send') return { allowed: true, grant: live[0] }

  const recipients = (context.recipients ?? []).map(normalizeAddress).filter((r) => r !== '')
  if (recipients.length === 0) return { allowed: false, reason: 'no-recipients' } // rule 7

  // Rule 9: a single grant has to admit all of them. Two narrow grants are not
  // added together — "may send to @a.com" plus "may send to @b.com" authorizing
  // one message addressed to both is a union the human never agreed to.
  for (const grant of live) {
    if (recipients.every((r) => scopeAdmits(grant.scope, r))) return { allowed: true, grant }
  }

  const blocked = recipients.filter((r) => !live.some((g) => scopeAdmits(g.scope, r)))
  return { allowed: false, reason: 'out-of-scope', blocked }
}

// -- the book -----------------------------------------------------------------

export interface GrantBookDeps {
  store: AgentStore
  now: () => number
}

/**
 * Reads and writes grant rows. It holds no rules — every question goes back
 * through `evaluate`.
 */
export class GrantBook {
  constructor(private readonly deps: GrantBookDeps) {}

  list(agentId?: string): Promise<Grant[]> {
    return this.deps.store.listGrants(agentId)
  }

  /**
   * Grant a capability, replacing whatever the agent held for it.
   *
   * The revoke-then-insert is what keeps rule 4 honest: widening a send scope
   * from one domain to two must not leave the old row live beside the new one,
   * or a later revoke of "the grant" would only reach half of it.
   */
  async grant(agentId: string, capability: Capability, scope: GrantScope = SCOPE_ALL): Promise<Grant> {
    const at = this.deps.now()
    await this.deps.store.revokeGrants(agentId, capability, at)
    // Dated *at* the revocation, not after it. Rule 4 suppresses grants
    // strictly older than a revocation, so this row survives its own
    // replacement without the clock having to tick between two awaits.
    const grant: Grant = { agentId, capability, scope, grantedAt: at }
    await this.deps.store.putGrant(grant)
    return grant
  }

  async revoke(agentId: string, capability: Capability): Promise<void> {
    await this.deps.store.revokeGrants(agentId, capability, this.deps.now())
  }

  /** What an agent holds right now, capability by capability. */
  async held(agentId: string, now = this.deps.now()): Promise<Grant[]> {
    const all = await this.deps.store.listGrants(agentId)
    const out: Grant[] = []
    for (const capability of ['read', 'draft', 'archiveLabel', 'send'] as Capability[]) {
      const live = liveGrants(all, capability, now)
      if (live.length > 0) out.push(live[0])
    }
    return out
  }
}
