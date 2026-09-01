import { describe, expect, it } from 'vitest'

import type { Account, Settings } from '../src/core/types'
import {
  applyVault,
  buildVault,
  mergeVault,
  type LocalCredential,
  type VaultDocument,
  type VaultLocal,
} from '../src/core/account/vault'

const settings: Settings = {
  theme: 'dark', imagePolicy: 'allow', pollIntervalSec: 60, sounds: false,
  conversationOrder: 'chronological', googleClientId: 'desktop-client', googleClientSecret: 'never-sync',
}

class FakeLocal implements VaultLocal {
  settings = { ...settings }
  accounts: Account[] = [{ id: 'local-1', email: 'nick@example.com', displayName: 'Nick', color: '#123', addedAt: 1 }]
  credentials = new Map<string, LocalCredential>([['local-1', { clientId: 'desktop-client', refreshToken: 'refresh', issuedAt: 10 }]])
  consent: string[] = []
  settingsWrites = 0
  credentialWrites = 0
  refreshes = 0
  getSettings = async () => ({ ...this.settings })
  setSettings = async (patch: Partial<Settings>) => { this.settingsWrites += 1; this.settings = { ...this.settings, ...patch } }
  listAccounts = async () => [...this.accounts]
  upsertAccount = async (account: Account) => { this.accounts.push(account) }
  removeAccount = async (id: string) => { this.accounts = this.accounts.filter((account) => account.id !== id) }
  loadCredential = async (id: string) => this.credentials.get(id) ?? null
  saveCredential = async (id: string, credential: LocalCredential) => { this.credentialWrites += 1; this.credentials.set(id, credential) }
  clearCredential = async (id: string) => { this.credentials.delete(id) }
  setDirectedConsent = (emails: string[]) => { this.consent = emails }
  newAccountId = () => `new-${this.accounts.length}`
  now = () => 100
  refreshAfterApply = async () => { this.refreshes += 1 }
}

const document = (patch: Partial<VaultDocument> = {}): VaultDocument => ({
  v: 1,
  updatedAt: 10,
  settings: { theme: 'light', imagePolicy: 'block', pollIntervalSec: 300, sounds: true, conversationOrder: 'newestFirst' },
  accounts: [{ email: 'nick@example.com', label: 'Nick' }],
  credentials: { desktop: {}, ios: {} },
  ...patch,
})

describe('vault document', () => {
  it('excludes googleClientSecret and includes desktop credentials', async () => {
    const vault = await buildVault(new FakeLocal(), 20, undefined, 'desktop')
    expect(vault.settings).not.toHaveProperty('googleClientSecret')
    expect(vault.credentials.desktop['nick@example.com']).toMatchObject({
      clientId: 'desktop-client', refreshToken: 'refresh', issuedAt: 10,
    })
    expect(vault.credentials.ios).toEqual({})
  })

  it('writes the same local credentials only to the iOS family on iOS', async () => {
    const vault = await buildVault(new FakeLocal(), 20, undefined, 'ios')
    expect(vault.credentials.desktop).toEqual({})
    expect(vault.credentials.ios['nick@example.com']).toMatchObject({
      clientId: 'desktop-client', refreshToken: 'refresh', issuedAt: 10,
    })
  })

  it('merges settings by document time, accounts by union and credentials by issuedAt', () => {
    const a = document({
      updatedAt: 10,
      accounts: [{ email: 'a@example.com', label: 'A' }],
      credentials: { desktop: { 'a@example.com': { clientId: 'old', refreshToken: 'old', scope: 'scope', issuedAt: 1 } }, ios: {} },
    })
    const b = document({
      updatedAt: 20,
      settings: { ...document().settings, theme: 'dark' },
      accounts: [{ email: 'b@example.com', label: 'B' }],
      credentials: { desktop: { 'a@example.com': { clientId: 'new', refreshToken: 'new', scope: 'scope', issuedAt: 2 } }, ios: {} },
    })
    const merged = mergeVault(a, b)
    expect(merged.settings.theme).toBe('dark')
    expect(merged.accounts.map((account) => account.email)).toEqual(['b@example.com', 'a@example.com'])
    expect(merged.credentials.desktop['a@example.com'].refreshToken).toBe('new')
  })

  it('files desktop tokens and sends iOS-only addresses to directed consent', async () => {
    const local = new FakeLocal()
    const vault = document({
      accounts: [
        { email: 'restored@example.com', label: 'Restored' },
        { email: 'ios@example.com', label: 'iOS' },
      ],
      credentials: {
        desktop: { 'restored@example.com': { clientId: 'desktop', refreshToken: 'token', scope: 'scope', issuedAt: 4 } },
        ios: { 'ios@example.com': { clientId: 'ios', refreshToken: 'ios-token', scope: 'scope', issuedAt: 5 } },
      },
    })
    const result = await applyVault(vault, local, 'desktop')
    expect(local.accounts.map((account) => account.email)).toEqual(['restored@example.com', 'ios@example.com'])
    expect([...local.credentials.values()]).toContainEqual({ clientId: 'desktop', refreshToken: 'token', issuedAt: 4 })
    expect(local.consent).toEqual(['ios@example.com'])
    expect(result).toMatchObject({ added: 2, removed: 1, tokensFiled: 1 })
    expect(local.refreshes).toBe(1)
  })

  it('files iOS tokens and sends desktop-only addresses to directed consent', async () => {
    const local = new FakeLocal()
    const vault = document({
      accounts: [
        { email: 'restored@example.com', label: 'Restored' },
        { email: 'desktop@example.com', label: 'Desktop' },
      ],
      credentials: {
        desktop: { 'desktop@example.com': { clientId: 'desktop', refreshToken: 'desktop-token', scope: 'scope', issuedAt: 4 } },
        ios: { 'restored@example.com': { clientId: 'ios', refreshToken: 'ios-token', scope: 'scope', issuedAt: 5 } },
      },
    })
    const result = await applyVault(vault, local, 'ios')
    expect(local.accounts.map((account) => account.email)).toEqual(['restored@example.com', 'desktop@example.com'])
    expect([...local.credentials.values()]).toContainEqual({ clientId: 'ios', refreshToken: 'ios-token', issuedAt: 5 })
    expect(local.consent).toEqual(['desktop@example.com'])
    expect(result).toMatchObject({ added: 2, removed: 1, tokensFiled: 1 })
    expect(local.refreshes).toBe(1)
  })

  it('skips equal settings, current credentials and empty refresh work', async () => {
    const local = new FakeLocal()
    const vault = document({
      settings: {
        theme: local.settings.theme,
        imagePolicy: local.settings.imagePolicy,
        pollIntervalSec: local.settings.pollIntervalSec,
        sounds: local.settings.sounds,
        conversationOrder: local.settings.conversationOrder,
        googleClientId: local.settings.googleClientId,
      },
      credentials: {
        desktop: {
          'nick@example.com': {
            clientId: 'older-client',
            refreshToken: 'older-token',
            scope: 'scope',
            issuedAt: 10,
          },
        },
        ios: {},
      },
    })
    const result = await applyVault(vault, local)
    expect(result).toMatchObject({ added: 0, removed: 0, tokensFiled: 0 })
    expect(local.settingsWrites).toBe(0)
    expect(local.credentialWrites).toBe(0)
    expect(local.refreshes).toBe(0)
  })
})
