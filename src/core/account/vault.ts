import type { Account, Settings } from '../types'
import type { TransferSettings } from '@/features/settings/transfer'

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
  credentials: Record<'desktop' | 'ios', Record<string, VaultCredential>>
}

export interface LocalCredential {
  refreshToken: string
  clientId: string
  issuedAt?: number
}

export interface VaultLocal {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<void>
  listAccounts(): Promise<Account[]>
  upsertAccount(account: Account): Promise<void>
  removeAccount(accountId: string): Promise<void>
  loadCredential(accountId: string): Promise<LocalCredential | null>
  saveCredential(accountId: string, credential: LocalCredential): Promise<void>
  clearCredential(accountId: string): Promise<void>
  setDirectedConsent?(emails: string[]): void | Promise<void>
  refreshAfterApply?(): void | Promise<void>
  newAccountId?(): string
  now?(): number
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

export async function buildVault(local: VaultLocal, updatedAt = local.now?.() ?? Date.now()): Promise<VaultDocument> {
  const [settings, accounts] = await Promise.all([local.getSettings(), local.listAccounts()])
  const desktop: Record<string, VaultCredential> = {}
  await Promise.all(accounts.map(async (account) => {
    const stored = await local.loadCredential(account.id)
    if (!stored) return
    desktop[account.email.trim().toLowerCase()] = {
      clientId: stored.clientId,
      refreshToken: stored.refreshToken,
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      issuedAt: stored.issuedAt ?? updatedAt,
    }
  }))
  return {
    v: 1,
    updatedAt,
    settings: vaultSettings(settings),
    accounts: accounts.map((account) => ({ email: account.email.trim().toLowerCase(), label: account.displayName })),
    credentials: { desktop, ios: {} },
  }
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
    const email = account.email.trim().toLowerCase()
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

export async function applyVault(doc: VaultDocument, local: VaultLocal): Promise<ApplyVaultSummary> {
  if (doc.v !== 1) throw new Error(`Unsupported Maru vault version: ${String(doc.v)}`)
  const now = local.now?.() ?? Date.now()
  const currentSettings = await local.getSettings()
  await local.setSettings({ ...doc.settings, googleClientSecret: currentSettings.googleClientSecret })

  const current = await local.listAccounts()
  const localByEmail = new Map(current.map((account) => [account.email.trim().toLowerCase(), account]))
  const remoteEmails = new Set(doc.accounts.map((account) => account.email.trim().toLowerCase()))
  let added = 0
  let removed = 0
  let tokensFiled = 0
  const needsConsent: string[] = []

  for (const account of current) {
    if (remoteEmails.has(account.email.trim().toLowerCase())) continue
    await local.removeAccount(account.id)
    await local.clearCredential(account.id)
    removed += 1
  }

  for (const remote of doc.accounts) {
    const email = remote.email.trim().toLowerCase()
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
    const credential = doc.credentials.desktop[email]
    if (credential) {
      await local.saveCredential(account.id, {
        clientId: credential.clientId,
        refreshToken: credential.refreshToken,
        issuedAt: credential.issuedAt,
      })
      tokensFiled += 1
    } else if (!localByEmail.has(email)) {
      needsConsent.push(email)
    }
  }
  await local.setDirectedConsent?.(needsConsent)
  await local.refreshAfterApply?.()
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
