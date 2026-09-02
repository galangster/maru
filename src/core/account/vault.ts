import type { Account, Settings } from '../types'
import { normalizeEmail } from '../service/vault-port'
import type { LocalCredential, PlatformFamily, VaultDeferral, VaultLocal } from '../service/vault-port'
import { DEFERRAL_TTL_MS } from '../defaults'
import type { TransferSettings } from '@/features/settings/transfer'

export type { LocalCredential, VaultDeferral, VaultLocal } from '../service/vault-port'

export type VaultSettings = Omit<TransferSettings, 'googleClientSecret'>

export interface VaultCredential {
  clientId: string
  refreshToken: string
  scope: string
  issuedAt: number
}

export interface VaultDocument {
  v: 1
  updatedAt: number
  settings: VaultSettings
  accounts: { email: string; label: string }[]
  credentials: Record<PlatformFamily, Record<string, VaultCredential>>
  /**
   * Later, across devices — A9 (owner ruling, Nick, 2026-09-02).
   *
   * Optional because a vault written before A9 has no such field, and because
   * a port that cannot list deferrals must not claim an empty list is the
   * truth: absent means "this writer had nothing to say", and the merge keeps
   * whatever the other copy holds.
   */
  deferrals?: VaultDeferral[]
}

const encoder = new TextEncoder()


const deferralKey = (entry: VaultDeferral): string =>
  `${normalizeEmail(entry.accountEmail)}\u0000${entry.threadId}`

/** The moment an entry stops being worth carrying — see DEFERRAL_TTL_MS. */
const deferralExpiry = (entry: VaultDeferral): number =>
  entry.until === null ? entry.at : entry.until

/**
 * Which of two entries for the same thread survives — MARU-ACCOUNT.md §6.
 *
 * Three cases, and the asymmetry between them is deliberate. Two live entries
 * compare by `until`, because a deferral names an absolute time and the later
 * time is the later decision however the clocks ran. A live entry against a
 * tombstone compares `at` to `at`, because "I brought it back" and "I saved it
 * again" are two acts and only their order settles it. Comparing `until` to a
 * clear there would let a clear on Sunday lose to a Monday that was already
 * cancelled, and the thread would hide itself again.
 */
function pickDeferral(a: VaultDeferral, b: VaultDeferral): VaultDeferral {
  // `!== null` rather than a boolean flag, so TypeScript itself proves the
  // live/live branch is comparing two numbers.
  if (a.until !== null && b.until !== null) return b.until > a.until ? b : a
  if (a.until === null && b.until === null) return b.at >= a.at ? b : a
  const tomb = a.until === null ? a : b
  const live = a.until === null ? b : a
  // Ties go to the tombstone: showing mail is the safe half of the failure.
  return live.at > tomb.at ? live : tomb
}

/**
 * Drop every entry whose moment is further in the past than DEFERRAL_TTL_MS
 * allows — a tombstone by its clear, a live entry by its `until`.
 */
export function pruneDeferrals(entries: readonly VaultDeferral[], now: number): VaultDeferral[] {
  const floor = now - DEFERRAL_TTL_MS
  return entries.filter((entry) => deferralExpiry(entry) > floor)
}

/**
 * Union by `(accountEmail, threadId)`, resolved by `pickDeferral`, then pruned.
 *
 * Pruning happens here rather than only at build time because the pushed
 * document is a merge of this device and the last remote copy: a filter that
 * ran before that merge would be undone by it, and an expired entry would ride
 * the vault forever.
 */
export function mergeDeferrals(
  a: readonly VaultDeferral[] | undefined,
  b: readonly VaultDeferral[] | undefined,
  now: number,
): VaultDeferral[] {
  const merged = new Map<string, VaultDeferral>()
  for (const entry of [...(a ?? []), ...(b ?? [])]) {
    const key = deferralKey(entry)
    const current = merged.get(key)
    merged.set(key, current ? pickDeferral(current, entry) : entry)
  }
  return pruneDeferrals([...merged.values()], now)
}

function vaultSettings(settings: Settings): VaultSettings {
  return {
    theme: settings.theme,
    imagePolicy: settings.imagePolicy,
    pollIntervalSec: settings.pollIntervalSec,
    sounds: settings.sounds,
    conversationOrder: settings.conversationOrder,
    ...(settings.googleClientId ? { googleClientId: settings.googleClientId } : {}),
  }
}

export async function buildVault(
  local: VaultLocal,
  family: PlatformFamily,
  updatedAt = local.now?.() ?? Date.now(),
  cachedCredentials?: ReadonlyMap<string, LocalCredential>,
): Promise<VaultDocument> {
  const [settings, accounts, deferrals] = await Promise.all([
    local.getSettings(),
    local.listAccounts(),
    local.listDeferrals?.() ?? Promise.resolve(undefined),
  ])
  const credentials: VaultDocument['credentials'] = { desktop: {}, ios: {} }
  await Promise.all(accounts.map(async (account) => {
    const stored = cachedCredentials
      ? cachedCredentials.get(account.id)
      : await local.loadCredential(account.id)
    if (!stored) return
    credentials[family][normalizeEmail(account.email)] = {
      clientId: stored.clientId,
      refreshToken: stored.refreshToken,
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      issuedAt: stored.issuedAt ?? updatedAt,
    }
  }))
  const document: VaultDocument = {
    v: 1,
    updatedAt,
    settings: vaultSettings(settings),
    accounts: accounts.map((account) => ({ email: normalizeEmail(account.email), label: account.displayName })),
    credentials,
    // Pruned on the way in, so an expired entry stops travelling from the
    // device that still remembers it rather than on some later merge. Worth the
    // second prune purely for the 256 KiB byte cap checked below.
    ...(deferrals ? { deferrals: pruneDeferrals(deferrals, updatedAt) } : {}),
  }
  if (encoder.encode(JSON.stringify(document)).byteLength > 256 * 1024) {
    throw new Error('The Maru vault exceeds the 256 KiB limit')
  }
  return document
}

function mergeCredentials(
  left: Record<string, VaultCredential>,
  right: Record<string, VaultCredential>,
): Record<string, VaultCredential> {
  const merged = { ...left }
  for (const [email, candidate] of Object.entries(right)) {
    const current = merged[email]
    if (!current || candidate.issuedAt > current.issuedAt) merged[email] = candidate
  }
  return merged
}

export function mergeVault(a: VaultDocument, b: VaultDocument): VaultDocument {
  const newer = b.updatedAt > a.updatedAt ? b : a
  const older = newer === a ? b : a
  const seen = new Set<string>()
  const accounts = [...newer.accounts, ...older.accounts].filter((account) => {
    const email = normalizeEmail(account.email)
    if (seen.has(email)) return false
    seen.add(email)
    return true
  })
  const updatedAt = Math.max(a.updatedAt, b.updatedAt)
  const deferrals = a.deferrals || b.deferrals
    ? mergeDeferrals(a.deferrals, b.deferrals, updatedAt)
    : undefined
  return {
    v: 1,
    updatedAt,
    settings: { ...newer.settings },
    accounts,
    credentials: {
      desktop: mergeCredentials(a.credentials.desktop, b.credentials.desktop),
      ios: mergeCredentials(a.credentials.ios, b.credentials.ios),
    },
    ...(deferrals ? { deferrals } : {}),
  }
}

export interface ApplyVaultSummary {
  added: number
  removed: number
  tokensFiled: number
  /** Deferral rows this apply moved. Zero on a device with no Later state. */
  deferrals: number
  needsConsent: string[]
}

export async function applyVault(
  doc: VaultDocument,
  local: VaultLocal,
  family: PlatformFamily,
): Promise<ApplyVaultSummary> {
  if (doc.v !== 1) throw new Error(`Unsupported Maru vault version: ${String(doc.v)}`)
  const now = local.now?.() ?? Date.now()
  const currentSettings = await local.getSettings()
  const nextSettings = { ...doc.settings, googleClientSecret: currentSettings.googleClientSecret }
  const settingsChanged = Object.entries(nextSettings).some(
    ([key, value]) => currentSettings[key as keyof Settings] !== value,
  )
  if (settingsChanged) await local.setSettings(nextSettings)

  const current = await local.listAccounts()
  const localByEmail = new Map(current.map((account) => [normalizeEmail(account.email), account]))
  const remoteEmails = new Set(doc.accounts.map((account) => normalizeEmail(account.email)))
  let added = 0
  let removed = 0
  let tokensFiled = 0
  const needsConsent: string[] = []

  for (const account of current) {
    if (remoteEmails.has(normalizeEmail(account.email))) continue
    await local.removeAccount(account.id)
    await local.clearCredential(account.id)
    removed += 1
  }

  for (const remote of doc.accounts) {
    const email = normalizeEmail(remote.email)
    let account = localByEmail.get(email)
    if (!account) {
      account = {
        id: local.newAccountId?.() ?? globalThis.crypto.randomUUID(),
        email,
        displayName: remote.label || email.split('@')[0],
        color: '#8f7cff',
        addedAt: now,
      }
      await local.upsertAccount(account)
      added += 1
    }
    const credential = doc.credentials[family][email]
    if (credential) {
      const stored = await local.loadCredential(account.id)
      if (!stored || (stored.issuedAt ?? 0) < credential.issuedAt) {
        await local.saveCredential(account.id, {
          clientId: credential.clientId,
          refreshToken: credential.refreshToken,
          issuedAt: credential.issuedAt,
        })
        tokensFiled += 1
      }
    } else if (!localByEmail.has(email)) {
      needsConsent.push(email)
    }
  }
  await local.setDirectedConsent?.(needsConsent)

  // Later, last: the accounts above must already exist, because a deferral is
  // filed under an address and an entry for an address this device does not
  // have is dropped rather than queued.
  //
  // The merge runs again here, against this device's own rows, and that is the
  // point rather than belt-and-braces: a pull carries whatever the server had,
  // which may predate a Later this person set thirty seconds ago on this very
  // machine. Applying it raw would undo their own action and then push it back.
  let deferrals = 0
  if (doc.deferrals && local.listDeferrals && local.applyDeferrals) {
    const mine = await local.listDeferrals()
    const merged = mergeDeferrals(mine, doc.deferrals, now)
    const current = new Map(mine.map((entry) => [deferralKey(entry), entry]))
    const changed = merged.filter((entry) => {
      const mineNow = current.get(deferralKey(entry))
      return !mineNow || mineNow.until !== entry.until || mineNow.at !== entry.at
    })
    if (changed.length) deferrals = await local.applyDeferrals(changed)
  }

  // Deferrals are deliberately not in this condition. `refreshAfterApply` is a
  // Gmail refresh, and a deferral is a local predicate that reaches no Gmail
  // method: the port already emits `threadsChanged` for the rows it wrote, and
  // that is the whole of what a deferral apply owes the UI.
  if (added || removed || tokensFiled) await local.refreshAfterApply?.()
  return { added, removed, tokensFiled, deferrals, needsConsent }
}

export function restoredSummary(summary: ApplyVaultSummary): string {
  const parts: string[] = []
  if (summary.added) parts.push(`${summary.added} account${summary.added === 1 ? '' : 's'}`)
  if (summary.tokensFiled) parts.push(`${summary.tokensFiled} Gmail sign-in${summary.tokensFiled === 1 ? '' : 's'}`)
  if (summary.deferrals) parts.push(`${summary.deferrals} saved-for-later restored`)
  if (summary.removed) parts.push(`${summary.removed} removed`)
  if (summary.needsConsent.length) parts.push(`${summary.needsConsent.length} need Google consent`)
  return parts.length ? `Restored ${parts.join(', ')}.` : 'This device already matches your Maru account.'
}
