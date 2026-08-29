// Settings transfer — P5, the free half of G2's resolution, and the seed of
// map 4's sync schema: whatever serializes here is what the paid service
// will one day sync.
//
// The hard lines, verbatim from G2: OAuth *tokens* and agent credentials
// never leave the keychain; agent grants never travel; mail never syncs.
// The Google OAuth *client pair* does travel — it is the user's own
// registration, non-confidential for a desktop PKCE client (RFC 8252 §8.5,
// recorded in docs/research/), and moving it is most of the second device's
// friction. The file says so on its face.

import type { Settings } from '@/core/types'
import { sha256Hex } from '@/lib/hash'

export const TRANSFER_VERSION = 1

/** The fields that travel. A whitelist, so a future secret cannot drift in. */
const FIELDS = [
  'theme',
  'imagePolicy',
  'pollIntervalSec',
  'sounds',
  'conversationOrder',
  'googleClientId',
  'googleClientSecret',
] as const satisfies readonly (keyof Settings)[]

type TransferField = (typeof FIELDS)[number]
export type TransferSettings = Pick<Settings, TransferField>

/** The travel set minus the OAuth pair — what the debug report may name. */
export const REPORT_SAFE_FIELDS = FIELDS.filter(
  (field) => field !== 'googleClientId' && field !== 'googleClientSecret',
)

interface TransferFile {
  wren_settings: number
  exported_at: string
  note: string
  settings: Partial<TransferSettings>
  checksum: string
}

const NOTE =
  'Wren settings. Carries your own Google OAuth client registration; ' +
  'never account tokens, never agents, grants, or mail.'

/** Canonical form: the checksum must not care about key order or whitespace. */
function canonical(settings: Partial<TransferSettings>): string {
  return JSON.stringify(
    FIELDS.filter((field) => settings[field] !== undefined).map((field) => [
      field,
      settings[field],
    ]),
  )
}

/** The export, as the text that goes to the clipboard. */
export async function exportSettings(
  settings: Settings,
  exportedAt: Date = new Date(),
): Promise<string> {
  const picked: Partial<TransferSettings> = {}
  for (const field of FIELDS) {
    const value = settings[field]
    if (value !== undefined) (picked as Record<string, unknown>)[field] = value
  }
  const file: TransferFile = {
    wren_settings: TRANSFER_VERSION,
    exported_at: exportedAt.toISOString(),
    note: NOTE,
    settings: picked,
    checksum: await sha256Hex(canonical(picked)),
  }
  return JSON.stringify(file, null, 2)
}

export type ParseResult =
  | { ok: true; settings: Partial<TransferSettings>; exportedAt: string }
  | { ok: false; reason: string }

const VALID: { [F in TransferField]: (v: unknown) => boolean } = {
  theme: (v) => v === 'system' || v === 'light' || v === 'dark',
  imagePolicy: (v) => v === 'block' || v === 'allow',
  pollIntervalSec: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  sounds: (v) => typeof v === 'boolean',
  conversationOrder: (v) => v === 'chronological' || v === 'newestFirst',
  googleClientId: (v) => typeof v === 'string',
  googleClientSecret: (v) => typeof v === 'string',
}

/**
 * Parse pasted text back into a settings patch. Field-by-field: unknown keys
 * are dropped silently (a newer export into an older Wren keeps working),
 * a known key with a wrong shape refuses the whole file — a half-applied
 * import is worse than none.
 */
export async function parseSettingsTransfer(text: string): Promise<ParseResult> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'That is not a Wren settings export (not valid JSON).' }
  }
  const file = raw as Partial<TransferFile>
  if (file.wren_settings !== TRANSFER_VERSION) {
    return {
      ok: false,
      reason:
        typeof file.wren_settings === 'number'
          ? `This export is version ${file.wren_settings}; this Wren reads version ${TRANSFER_VERSION}.`
          : 'That is not a Wren settings export.',
    }
  }
  if (typeof file.settings !== 'object' || file.settings === null) {
    return { ok: false, reason: 'The export carries no settings.' }
  }

  const picked: Partial<TransferSettings> = {}
  for (const field of FIELDS) {
    const value = (file.settings as Record<string, unknown>)[field]
    if (value === undefined) continue
    if (!VALID[field](value)) {
      return { ok: false, reason: `The field “${field}” has the wrong shape; nothing was applied.` }
    }
    ;(picked as Record<string, unknown>)[field] = value
  }
  if (Object.keys(picked).length === 0) {
    return { ok: false, reason: 'The export carries no settings this Wren recognizes.' }
  }
  if (file.checksum !== (await sha256Hex(canonical(picked)))) {
    return { ok: false, reason: 'The checksum does not match — the text was altered in transit.' }
  }
  return { ok: true, settings: picked, exportedAt: file.exported_at ?? 'unknown' }
}

/** The preview rows an import confirmation shows: field, current, incoming. */
export function transferDiff(
  current: Settings,
  incoming: Partial<TransferSettings>,
): { field: TransferField; from: string; to: string }[] {
  const show = (field: TransferField, value: unknown): string => {
    if (value === undefined || value === '') return '(unset)'
    if (field === 'googleClientSecret') return '••••'
    return String(value)
  }
  return FIELDS.filter(
    (field) => incoming[field] !== undefined && incoming[field] !== current[field],
  ).map((field) => ({ field, from: show(field, current[field]), to: show(field, incoming[field]) }))
}
