import type { Account, Settings } from '../types'
import type { LocalCredential, PlatformFamily, VaultLocal } from '../service/vault-port'
import type { TransferSettings } from '@/features/settings/transfer'

export type { LocalCredential, VaultLocal } from '../service/vault-port'

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
}

const encoder = new TextEncoder()

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
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
  const [settings, accounts] = await Promise.all([local.getSettings(), local.listAccounts()])
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
  return {
    v: 1,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    settings: { ...newer.settings },
    accounts,
    credentials: {
      desktop: mergeCredentials(a.credentials.desktop, b.credentials.desktop),
      ios: mergeCredentials(a.credentials.ios, b.credentials.ios),
    },
  }
}

export interface ApplyVaultSummary {
  added: number
  removed: number
  tokensFiled: number
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
  if (added || removed || tokensFiled) await local.refreshAfterApply?.()
  return { added, removed, tokensFiled, needsConsent }
}

export function restoredSummary(summary: ApplyVaultSummary): string {
  const parts: string[] = []
  if (summary.added) parts.push(`${summary.added} account${summary.added === 1 ? '' : 's'}`)
  if (summary.tokensFiled) parts.push(`${summary.tokensFiled} Gmail sign-in${summary.tokensFiled === 1 ? '' : 's'}`)
  if (summary.removed) parts.push(`${summary.removed} removed`)
  if (summary.needsConsent.length) parts.push(`${summary.needsConsent.length} need Google consent`)
  return parts.length ? `Restored ${parts.join(', ')}.` : 'This device already matches your Maru account.'
}
