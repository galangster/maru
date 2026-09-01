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
import {
  OFFICIAL_GOOGLE_CLIENT_ID,
  isOfficialGoogleClientId,
} from '@/core/auth/client-config'
import { isEmail } from '@/lib/compose'
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
  /**
   * The Gmail addresses this device has, and NOTHING else about them — no
   * token, no history id, no mail. It is a list of strings a person could have
   * typed from memory, and typing them from memory is exactly what it saves.
   *
   * This is the half of G2's map-4 sync that needs no server and no decision:
   * with the addresses in hand, "Add account" stops being a picker you can get
   * wrong and becomes one directed consent per address, each asserted against
   * `users.getProfile` before its tokens are filed. The design verdict's own
   * v1 payload is "settings and the account address list", so this is that
   * payload — and the credential vault stays a later schema slot rather than a
   * rewrite.
   *
   * Optional, and absent on a v1 export, so the version does not move: an
   * older Maru reads a newer file, ignores this key, and applies the settings.
   */
  accounts?: string[]
  checksum: string
}

/**
 * A sane ceiling on the address list, so a malformed or hostile paste cannot
 * queue an unbounded run of consent screens.
 */
const MAX_TRANSFER_ACCOUNTS = 20

const NOTE =
  'Maru settings. Carries your own Google OAuth client registration and the ' +
  'list of addresses to sign in to; never account tokens, never agents, ' +
  'grants, or mail.'

/** Canonical form: the checksum must not care about key order or whitespace. */
function canonical(settings: Partial<TransferSettings>): string {
  return JSON.stringify(
    FIELDS.filter((field) => settings[field] !== undefined).map((field) => [
      field,
      settings[field],
    ]),
  )
}

/**
 * The export, as the text that goes to the clipboard.
 *
 * `accounts` is the addresses this device holds. Passing none is valid and
 * produces a byte-identical file to the one this function made before the
 * address list existed — which is what keeps an older Maru able to read it.
 */
export async function exportSettings(
  settings: Settings,
  accounts: string[] = [],
  exportedAt: Date = new Date(),
  officialClientId: string | undefined = OFFICIAL_GOOGLE_CLIENT_ID,
): Promise<string> {
  const picked: Partial<TransferSettings> = {}
  for (const field of FIELDS) {
    if (
      (field === 'googleClientId' || field === 'googleClientSecret') &&
      isOfficialGoogleClientId(settings.googleClientId, officialClientId)
    ) {
      continue
    }
    const value = settings[field]
    if (value !== undefined) (picked as Record<string, unknown>)[field] = value
  }
  const file: TransferFile = {
    wren_settings: TRANSFER_VERSION,
    exported_at: exportedAt.toISOString(),
    note: NOTE,
    settings: picked,
    // Omitted entirely when empty, so a device with no accounts still produces
    // the exact bytes a pre-address-list Maru wrote and expects.
    ...(accounts.length ? { accounts: accounts.slice(0, MAX_TRANSFER_ACCOUNTS) } : {}),
    checksum: await sha256Hex(canonical(picked)),
  }
  return JSON.stringify(file, null, 2)
}

export type ParseResult =
  | { ok: true; settings: Partial<TransferSettings>; accounts: string[]; exportedAt: string }
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
 * are dropped silently (a newer export into an older Maru keeps working),
 * a known key with a wrong shape refuses the whole file — a half-applied
 * import is worse than none.
 */
export async function parseSettingsTransfer(text: string): Promise<ParseResult> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'That is not a Maru settings export (not valid JSON).' }
  }
  const file = raw as Partial<TransferFile>
  if (file.wren_settings !== TRANSFER_VERSION) {
    return {
      ok: false,
      reason:
        typeof file.wren_settings === 'number'
          ? `This export is version ${file.wren_settings}; this Maru reads version ${TRANSFER_VERSION}.`
          : 'That is not a Maru settings export.',
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
    return { ok: false, reason: 'The export carries no settings this Maru recognizes.' }
  }
  // The checksum covers the SETTINGS only, and deliberately not the address
  // list. A hash living in the same file as the data it covers detects
  // truncation, not tampering — anyone who can edit an address can recompute
  // the hash. What it is really for is a clipboard that dropped half the
  // OAuth secret, which is silent and breaks sign-in. A truncated address list
  // just offers fewer accounts, which is visible and harmless, and a TAMPERED
  // address is caught downstream by something strictly stronger than a hash:
  // the consent flow asserts the address Google returns against the one asked
  // for and discards the grant on a mismatch. Leaving the list out of the
  // canonical form is also what keeps an older Maru able to read this file
  // instead of rejecting it as "altered in transit", which would be a lie.
  if (file.checksum !== (await sha256Hex(canonical(picked)))) {
    return { ok: false, reason: 'The checksum does not match — the text was altered in transit.' }
  }
  return {
    ok: true,
    settings: picked,
    accounts: parseAccounts(file.accounts),
    exportedAt: file.exported_at ?? 'unknown',
  }
}

/**
 * The address list, cleaned rather than trusted.
 *
 * Anything that is not a plausible address is dropped silently instead of
 * refusing the file: a bad entry here costs one missing row in a list of
 * suggestions, where refusing costs the person their whole import. That is the
 * opposite of the settings rule above, and deliberately so — a malformed
 * SETTING would be applied to the app, while a malformed address is only ever
 * shown to a human who then chooses whether to sign in to it.
 */
function parseAccounts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const email = value.trim().toLowerCase()
    // The composer's own shape test, not a second one. It is deliberately
    // permissive — it rejects "nick@" and "hello world" and leaves
    // deliverability to Google, which is exactly the judgement this list
    // needs too.
    if (!isEmail(email)) continue
    seen.add(email)
    if (seen.size >= MAX_TRANSFER_ACCOUNTS) break
  }
  return [...seen]
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
