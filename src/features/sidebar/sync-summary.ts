// What the sidebar's status line says, derived from per-account sync state.
//
// This used to be four ternaries inside SidebarFooter collapsing every account
// into one word. The owner's report, 2026-08-31: "none of the emails are
// syncing (or at least some aren't, I can't tell via the UI which ones aren't
// syncing)." The app knew which ones. It knew why, and it knew the remedy —
// SyncStatus has carried accountId, needsReauth and clientFailure all along —
// and the sidebar threw all three away before drawing.
//
// It is a pure function and not a hook so the sentences can be tested as data.
// Rendering four accounts in five failure states to assert a string is how the
// copy stops being checked.

import { hasStopped, syncKind, type SyncKind } from '@/core/sync/failure'
import { elapsedTime } from '@/lib/format'
import type { Account, SyncStatus } from '@/core/types'

/** Which recovery a state routes to, or none. */
export type SyncAction = 'accounts' | 'google' | null

/** The winning kind across every account, plus the two states that are not
 *  about one account's health: a demo window, and an app still starting. */
export type SummaryKind = SyncKind | 'demo' | 'unheard'

export interface SyncSummary {
  /** Ask this rather than inferring from `action` — see `urgent` below. */
  kind: SummaryKind
  /** ≤11 chars. Renders at @[13rem], where ~76px is left after the buttons. */
  short: string
  /** Renders at @[17rem]. Never truncated — see `address`. */
  full: string
  /** Split out so truncation eats the identifier and never the instruction. */
  address?: string
  /** The whole sentence: tooltip, aria-label, and the screen-reader line. */
  detail: string
  /** Non-null makes the line a button. NOT a proxy for urgency: `stalled`
   *  routes to Settings too, and must never be treated as an alarm. */
  action: SyncAction
}

/** Mail has stopped and only a person can restart it. The colour test. */
export function isUrgent(sync: SyncSummary): boolean {
  return sync.kind !== 'demo' && sync.kind !== 'unheard' && hasStopped(sync.kind)
}

function names(emails: string[]): string {
  if (emails.length === 1) return emails[0]
  if (emails.length === 2) return `${emails[0]} and ${emails[1]}`
  return `${emails[0]}, ${emails[1]} and ${emails.length - 2} more`
}

/**
 * " The other 3 accounts are up to date."
 *
 * Counts only accounts CONFIRMED idle — never `accounts.length - errored`.
 * That subtraction quietly counted accounts the app had heard nothing from as
 * healthy, which is the exact false claim this whole change exists to delete,
 * reappearing in the one sentence a person actually reads.
 */
function rest(idle: number): string {
  if (idle <= 0) return ''
  return idle === 1
    ? ' The other account is up to date.'
    : ` The other ${idle} accounts are up to date.`
}

/** The oldest last-sync, or undefined unless EVERY account has reported one.
 *  Oldest, not newest: "last synced 2m ago" has to be true of all of them. */
function oldestSync(known: SyncStatus[], total: number): number | undefined {
  const ages = known.map((s) => s.lastSyncAt).filter((t): t is number => t !== undefined)
  // `ages.length === total` alone was true for the zero-account case (0 === 0),
  // and `Math.min()` of nothing is Infinity — which elapsedTime clamps to
  // "just now". So an app with no accounts at all reported "0 accounts · last
  // synced just now": the same confident lie about accounts it knows nothing
  // about that this whole file exists to delete.
  if (ages.length === 0 || ages.length !== total) return undefined
  return Math.min(...ages)
}

/**
 * How long "Starting…" is allowed to stand before it becomes a different
 * sentence. The engine emits `syncing` as the first act of both its backfill
 * and its incremental pass, so a healthy account clears this in well under a
 * second — anything still silent after half a minute is not starting, it is
 * stuck, and the footer should stop implying otherwise.
 */
const STARTUP_GRACE_MS = 30_000

export function describeSync(
  accounts: Account[],
  statuses: Record<string, SyncStatus>,
  demo: boolean,
  now: number,
  /** When this window started waiting. Defaults to `now`, i.e. no elapsed. */
  startedAt: number = now,
): SyncSummary {
  const plural = `${accounts.length} account${accounts.length === 1 ? '' : 's'}`

  if (demo) {
    return {
      kind: 'demo',
      short: 'Demo data',
      full: 'Demo data',
      detail: `Demo data · ${plural}`,
      action: null,
    }
  }

  if (accounts.length === 0) {
    // Reachable behind the onboarding overlay on first run, and after removing
    // the last account in Settings. Every branch below is a claim about
    // accounts, and with none there is no true one to make — "0 accounts · up
    // to date" is a status line congratulating you on syncing nothing.
    return {
      kind: 'unheard',
      short: 'No account',
      full: 'No account',
      detail: 'No account is connected yet. Open Settings to add one.',
      action: 'accounts',
    }
  }

  // Filter in BOTH directions. useSyncStatus never deletes, so a removed
  // account leaves a status behind; and it is filled only by events, so an
  // account that has not reported is absent rather than idle. Reading it with
  // `.some()` alone is what rendered "Up to date" for accounts the app had
  // heard nothing from — a positive claim it had no basis for.
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const emailOf = (id: string) => byId.get(id)?.email ?? id
  const known = Object.values(statuses).filter((s) => byId.has(s.accountId))

  const of = (kind: SyncKind) => known.filter((s) => syncKind(s) === kind)
  const rejected = of('rejected')
  const noClient = of('noClient')
  const noCreds = of('noCredentials')
  const signedOut = of('signedOut')
  const stalled = of('stalled')
  const busy = of('syncing')
  const idle = of('idle')
  const unheard = accounts.length - known.length

  // Worst first. A dead grant outranks a spinner: one needs a person, the
  // other needs a moment.
  if (noClient.length > 0) {
    // Same remedy as `rejected`, deliberately NOT the same sentence: this is
    // thrown before any network call, so Google has never seen the request and
    // cannot have rejected it. Blaming Google here would be the same lie as
    // "signed out by Google" for an empty local keychain.
    return {
      kind: 'noClient',
      short: 'Set up',
      full: 'No Google client',
      detail:
        'Maru has no Google OAuth client configured on this Mac, so no mail is ' +
        'arriving. Nothing at Google is wrong. Open Settings to add a client ID.',
      action: 'google',
    }
  }

  if (rejected.length > 0) {
    // Counting accounts here would mislead — it is one fault affecting all of
    // them, and the accounts themselves are fine.
    return {
      kind: 'rejected',
      short: 'Fix sign-in',
      full: 'Client rejected',
      detail:
        "Google rejected Maru's OAuth client, not your accounts. " +
        'No mail is arriving. Open Settings to use your own client.',
      action: 'google',
    }
  }

  // One bucket, one remedy, one button — the sentence is the only thing that
  // knows the difference, because "Google signed you out" and "this Mac never
  // held a sign-in" are different diagnoses sharing a fix.
  if (signedOut.length > 0 || noCreds.length > 0) {
    const dead = [...noCreds, ...signedOut]
    const local = noCreds.length > 0 && signedOut.length === 0
    const emails = dead.map((s) => emailOf(s.accountId))
    const one = dead.length === 1

    let full: string
    let address: string | undefined
    if (one && !local) {
      full = 'Sign in again'
      address = emails[0]
    } else if (one && local) {
      full = 'Not signed in here'
    } else {
      full = `${dead.length} accounts signed out`
    }

    let detail: string
    if (local && dead.length === accounts.length) {
      detail =
        'Maru has no saved sign-in for any account on this Mac, ' +
        'so no mail is arriving. Open Settings to sign in.'
    } else if (local) {
      detail =
        `Maru has no saved sign-in for ${names(emails)} on this Mac, ` +
        `so ${one ? 'its' : 'their'} mail has stopped arriving.` +
        rest(idle.length) +
        ' Open Settings to sign in.'
    } else {
      detail =
        `${names(emails)} ${one ? 'is' : 'are'} signed out and ` +
        `${one ? 'its' : 'their'} mail has stopped arriving.` +
        rest(idle.length) +
        ' Open Settings to sign in again.'
    }

    return {
      kind: local ? 'noCredentials' : 'signedOut',
      short: 'Sign in',
      full,
      address,
      detail,
      action: 'accounts',
    }
  }

  if (stalled.length > 0) {
    // No red, no alarm, no "failed". Waiting is the fix, and an app that
    // shouts about a dropped connection teaches people to ignore it shouting.
    const all = stalled.length === accounts.length
    const oldest = oldestSync(known, accounts.length)
    return {
      kind: 'stalled',
      short: 'Retrying',
      full: "Can't reach Google",
      detail: all
        ? "Maru can't reach Google. It keeps trying; nothing is lost." +
          (oldest !== undefined ? ` Last synced ${elapsedTime(oldest, now)}.` : '')
        : `Maru can't reach Google for ${names(stalled.map((s) => emailOf(s.accountId)))}. ` +
          'It keeps trying; nothing is lost.' +
          rest(idle.length),
      action: 'accounts',
    }
  }

  if (unheard > 0) {
    // The state the owner actually hit, and the one the old code rendered as
    // "Up to date".
    //
    // It escalates rather than standing forever. "Starting…" is a promise that
    // something is about to happen, and after the grace period that promise is
    // one the app cannot keep — so it becomes a statement of fact instead, and
    // one that offers somewhere to go. The threshold is checked against the
    // app-wide clock, which ticks once a minute, so the change lands at the
    // first tick past the grace rather than to the second. That is deliberate:
    // a dedicated timer for a sentence nobody is watching would be a second
    // clock to keep in step with the first.
    const stuck = now - startedAt >= STARTUP_GRACE_MS
    const which =
      known.length === 0
        ? 'No account has reported yet.'
        : `${unheard} of ${accounts.length} accounts have not reported.`
    return {
      kind: 'unheard',
      short: stuck ? 'Not synced' : 'Starting…',
      full: stuck ? 'Not synced yet' : 'Starting…',
      detail: stuck
        ? `${which} Mail is not arriving. Open Settings to check the accounts.`
        : `Maru is starting up. ${which}`,
      action: stuck ? 'accounts' : null,
    }
  }

  if (busy.length > 0) {
    return {
      kind: 'syncing',
      short: 'Syncing…',
      full: 'Syncing…',
      detail:
        busy.length === accounts.length
          ? `Syncing ${plural}.`
          : `Syncing ${busy.length} of ${accounts.length} accounts.`,
      action: null,
    }
  }

  const oldest = oldestSync(known, accounts.length)
  return {
    kind: 'idle',
    short: 'Up to date',
    full: 'Up to date',
    detail:
      oldest !== undefined
        ? `${plural} · last synced ${elapsedTime(oldest, now)}`
        : `${plural} · up to date`,
    action: null,
  }
}
