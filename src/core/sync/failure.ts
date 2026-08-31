// One place that turns a thrown error into a SyncStatus.
//
// There were two, and they disagreed. SyncEngine.failed() typed `needsReauth`
// and `clientFailure`; RealMailService.start() emitted a bare
// `{state:'error', error}` with neither flag. The UI reads the flags to decide
// what to say and which recovery to offer, so the same dead grant produced
// "Signed out by Google — sign in again" from one emitter and an untyped
// "Sync failed · Maru is retrying" from the other, for a state no retry can
// fix. Whichever emitter fired first won.
//
// Anything that classifies an error into a status goes through here, so a new
// discriminant is added once rather than in each emitter that happens to be
// remembered.

import { isClientFailure, OAuthError } from '@/core/auth/oauth'
import type { SyncStatus } from '@/core/types'

/**
 * What one account's status MEANS, as one value.
 *
 * The three flags on SyncStatus are how a failure is *typed* at the seam; this
 * is how it is *read*. Three call sites were each deriving the same booleans
 * from them and had already drifted apart — the settings row's `signedOut` did
 * not exclude a rejected client, and only survived because a ternary happened
 * to test the other case first. Adding `noCredentials` cost an edit in all
 * three. A fourth failure kind should cost one.
 */
export type SyncKind =
  | 'idle'
  | 'syncing'
  /** Google rejected the OAuth client. The accounts are fine. */
  | 'rejected'
  /** No OAuth client is configured here, so Google never saw the request. */
  | 'noClient'
  /** No token record on THIS machine. Nothing at Google changed. */
  | 'noCredentials'
  /** Google killed the grant. */
  | 'signedOut'
  /** Untyped — a timeout, a rate limit, a dropped connection. Wait. */
  | 'stalled'

export function syncKind(status: SyncStatus | undefined): SyncKind {
  if (!status) return 'idle'
  if (status.state === 'syncing') return 'syncing'
  if (status.state !== 'error') return 'idle'
  // Order matters: a rejected client sets needsReauth too, and noCredentials
  // deliberately keeps needsReauth true because the remedy is the same flow.
  // Most specific diagnosis first.
  if (status.noClientConfigured === true) return 'noClient'
  if (status.clientFailure === true) return 'rejected'
  if (status.noCredentials === true) return 'noCredentials'
  if (status.needsReauth === true) return 'signedOut'
  return 'stalled'
}

/**
 * Mail has stopped and will not restart on its own — a person must act.
 *
 * This is the line that decides who gets colour, who interrupts the list, and
 * who is allowed to displace the approvals pill. `stalled` is deliberately NOT
 * one of these: an app that raises an alarm over a Wi-Fi blip is an app people
 * learn to dismiss without reading.
 */
export function hasStopped(kind: SyncKind): boolean {
  return (
    kind === 'rejected' ||
    kind === 'noClient' ||
    kind === 'noCredentials' ||
    kind === 'signedOut'
  )
}

export function syncFailure(accountId: string, err: unknown): SyncStatus {
  return {
    accountId,
    state: 'error',
    error: err instanceof Error ? err.message : String(err),
    needsReauth: err instanceof OAuthError && err.needsReauth,
    clientFailure: isClientFailure(err),
    // MissingOAuthClientError sets clientFailure so the remedy routes to
    // Settings → Google, but Google never saw this request — it is thrown
    // before any network call. Without this second discriminant the UI blames
    // Google for a purely local gap.
    noClientConfigured:
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === 'missing_oauth_client',
    // TokenManager.load() throws this exact code when the store has no record
    // for the account (oauth.ts). It is the only source, so matching the code
    // is precise rather than a guess at the message's wording.
    noCredentials: err instanceof OAuthError && err.code === 'no_account',
  }
}
