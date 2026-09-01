import type { Account, Settings } from '../types'

export type PlatformFamily = 'desktop' | 'ios'

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
