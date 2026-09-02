// What the phone can say about its own push state, and the words it says it in.
//
// Push is the one surface where every failure is invisible from the device:
// APNs refuses in a delegate callback nobody watches, and the relay's answer to
// `pushRegister` is a promise nobody reads. These are the plain-English
// renderings of both, so Settings can show a person what actually happened.

/**
 * Where the device registration stands with the relay. `waiting` is a token
 * in hand and no Maru session to send it to.
 */
export type PushRegistration = 'none' | 'waiting' | 'registered' | 'failed'

export interface PushDiagnostics {
  /** First 8 hex characters of the APNs token. The whole token identifies the device. */
  tokenPrefix: string | null
  registration: PushRegistration
  /** The last thing that went wrong, from APNs or from the relay. */
  lastError: string | null
}

/** `POST /v1/push/test` — MARU-ACCOUNT.md §9. */
export interface PushTestResponse {
  ok?: boolean
  sent?: boolean
  apns?: { status?: number; reason?: string } | null
}

export const emptyPushDiagnostics: PushDiagnostics = {
  tokenPrefix: null,
  registration: 'none',
  lastError: null,
}

/** The relay line in Settings. */
export function registrationLabel(registration: PushRegistration, lastError: string | null): string {
  if (registration === 'registered') return 'registered'
  if (registration === 'failed') return lastError ?? 'failed'
  if (registration === 'waiting') return 'waiting for a Maru account'
  return 'not registered yet'
}

/** Enough of the token to match a relay device row, and no more. */
export function tokenPrefix(token: string | null | undefined): string | null {
  if (!token) return null
  return token.slice(0, 8)
}

/**
 * A `MaruApiError` — or anything else — as one line.
 *
 * Duck-typed on purpose: `src/core/push` does not depend on `src/core/account`,
 * and the two fields that matter here are the HTTP status and the server's
 * code. Without the status a failed registration reads the same whether the
 * plan expired (402), the session lapsed (401) or the phone was offline.
 */
export function describeApiError(cause: unknown): string {
  if (cause && typeof cause === 'object') {
    const error = cause as { status?: unknown; code?: unknown; message?: unknown }
    const status = typeof error.status === 'number' && error.status > 0 ? `HTTP ${error.status}` : null
    const code = typeof error.code === 'string' && error.code ? error.code : null
    const message = typeof error.message === 'string' && error.message ? error.message : null
    const head = [status, code].filter(Boolean).join(' ')
    if (head && message) return `${head} — ${message}`
    if (head || message) return head || message || ''
  }
  return String(cause)
}

/**
 * The result of one test push, as the person reading Settings needs it.
 *
 * An APNs rejection arrives as a 200 with `apns.status` and `apns.reason` —
 * `BadDeviceToken` and `TopicDisallowed` are the two that name a real
 * misconfiguration — so it is a result to render, not an error to throw.
 */
export function describeTestResult(response: PushTestResponse | null | undefined): string {
  if (response?.sent) return 'Sent'
  const apns = response?.apns
  if (apns) {
    const parts = [
      typeof apns.status === 'number' ? `HTTP ${apns.status}` : null,
      apns.reason || null,
    ].filter(Boolean)
    return parts.length > 0 ? `Apple rejected it — ${parts.join(' ')}` : 'Apple rejected it'
  }
  return 'The relay did not send it'
}
