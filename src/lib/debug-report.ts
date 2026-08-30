// The debug report — Maru's whole answer to "it broke" (P7). Nothing ever
// phones home: the person copies this text and pastes it into an issue by
// hand, which is the ratified no-telemetry posture made useful.
//
// Scrubbed by construction: settings enter field-by-field (the OAuth client
// pair never enters at all), accounts enter as a count, and the finished
// text is passed through an address scrub so an email that rode in on an
// error message cannot ride out.

const TROUBLE_CAP = 50

interface Trouble {
  at: number
  text: string
}

const trouble: Trouble[] = []

/** Remember one line of trouble. Ring-capped; oldest falls off. */
export function recordTrouble(text: string, at = Date.now()): void {
  trouble.push({ at, text })
  if (trouble.length > TROUBLE_CAP) trouble.splice(0, trouble.length - TROUBLE_CAP)
}

/** Window-level hooks: uncaught errors and unhandled rejections. */
export function installTroubleHooks(): () => void {
  const onError = (event: ErrorEvent) => recordTrouble(`error: ${event.message}`)
  const onRejection = (event: PromiseRejectionEvent) =>
    recordTrouble(`unhandled rejection: ${String(event.reason)}`)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

/** `a@b.c` must never leave the machine inside a report. */
function scrubAddresses(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '‹address›')
}

export interface DebugReportInput {
  version: string
  mode: string
  /** How many accounts are connected — never which. */
  accountCount: number
  /** The settings worth knowing, already chosen field-by-field by the caller. */
  settings: Record<string, string | number | boolean>
  /** Per-account sync states, positional — `1: idle`, never an id. */
  syncStates: string[]
  userAgent: string
  now?: number
}

/** The report, as the text a person pastes into an issue. */
export function buildDebugReport(input: DebugReportInput): string {
  const lines = [
    `Maru debug report`,
    `version: ${input.version}`,
    `mode: ${input.mode}`,
    `platform: ${input.userAgent}`,
    `accounts: ${input.accountCount}`,
    ...input.syncStates.map((state, index) => `sync ${index + 1}: ${state}`),
    ...Object.entries(input.settings).map(([key, value]) => `${key}: ${String(value)}`),
    ``,
    trouble.length === 0
      ? `recent trouble: none recorded this session`
      : `recent trouble (${trouble.length}):`,
    ...trouble.map((t) => `  ${new Date(t.at).toISOString()} ${t.text}`),
  ]
  return scrubAddresses(lines.join('\n'))
}

/** Tests only: a fresh buffer between cases. */
export function clearTrouble(): void {
  trouble.length = 0
}
