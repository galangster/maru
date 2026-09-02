import { describe, expect, it } from 'vitest'

import type { Account, Settings } from '../src/core/types'
import {
  applyVault,
  buildVault,
  mergeVault,
  type LocalCredential,
  type VaultDocument,
} from '../src/core/account/vault'
import { FakeVaultLocal, settings as baseSettings, vaultDocument } from './fixtures/domain'

// This suite is the one that cares about the bring-your-own Google client, so
// it is the one that adds those two fields to the shared baseline.
const settings: Settings = {
  ...baseSettings,
  googleClientId: 'desktop-client',
  googleClientSecret: 'never-sync',
}

class FakeLocal extends FakeVaultLocal {
  settings = { ...settings }
  // Annotated, not inferred: without it the literal narrows and a subclass
  // (or a test reading `senderName` back) is arguing with a type that has no
  // optional fields on it.
  accounts: Account[] = [{ id: 'local-1', email: 'nick@example.com', displayName: 'Nick', color: '#123', addedAt: 1 }]
  credentials = new Map<string, LocalCredential>([['local-1', { clientId: 'desktop-client', refreshToken: 'refresh', issuedAt: 10 }]])
}

const document = (patch: Partial<VaultDocument> = {}): VaultDocument => vaultDocument({
  updatedAt: 10,
  settings: { theme: 'light', imagePolicy: 'block', pollIntervalSec: 300, sounds: true, conversationOrder: 'newestFirst' },
  accounts: [{ email: 'nick@example.com', label: 'Nick' }],
  ...patch,
})

describe('vault document', () => {
  it('excludes googleClientSecret and includes desktop credentials', async () => {
    const vault = await buildVault(new FakeLocal(), 'desktop', 20)
    expect(vault.settings).not.toHaveProperty('googleClientSecret')
    expect(vault.credentials.desktop['nick@example.com']).toMatchObject({
      clientId: 'desktop-client', refreshToken: 'refresh', issuedAt: 10,
    })
    expect(vault.credentials.ios).toEqual({})
  })

  it('writes the same local credentials only to the iOS family on iOS', async () => {
    const vault = await buildVault(new FakeLocal(), 'ios', 20)
    expect(vault.credentials.desktop).toEqual({})
    expect(vault.credentials.ios['nick@example.com']).toMatchObject({
      clientId: 'desktop-client', refreshToken: 'refresh', issuedAt: 10,
    })
  })

  it('carries the sender name on the account list, and omits it when there is none', async () => {
    // Issue #66. The name a person types once has to reach the laptop they set
    // up last week, or that machine signs its mail with an address. It rides on
    // the account entry beside the label, which is a different thing: the label
    // is this device's name FOR the mailbox.
    class Named extends FakeLocal {
      accounts: Account[] = [
        { id: 'local-1', email: 'nick@example.com', displayName: 'Nick', senderName: 'Nick Galang', color: '#123', addedAt: 1 },
        { id: 'local-2', email: 'unnamed@example.com', displayName: 'Unnamed', color: '#456', addedAt: 2 },
      ]
    }
    const vault = await buildVault(new Named(), 'desktop', 20)
    expect(vault.accounts).toEqual([
      { email: 'nick@example.com', label: 'Nick', senderName: 'Nick Galang' },
      // Omitted, not null and not '': absent means "this writer had no
      // opinion", which is exactly what an account with no name means.
      { email: 'unnamed@example.com', label: 'Unnamed' },
    ])
    expect(vault.accounts[1]).not.toHaveProperty('senderName')
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

  it('takes the sender name from the newer copy when both name the same address', () => {
    const a = document({ updatedAt: 10, accounts: [{ email: 'nick@example.com', label: 'Nick', senderName: 'Old Name' }] })
    const b = document({ updatedAt: 20, accounts: [{ email: 'nick@example.com', label: 'Nick', senderName: 'New Name' }] })
    expect(mergeVault(a, b).accounts).toEqual([
      { email: 'nick@example.com', label: 'Nick', senderName: 'New Name' },
    ])
    // Symmetric: the argument order must not decide it.
    expect(mergeVault(b, a).accounts[0].senderName).toBe('New Name')
  })

  it('gives a restored account its name, and fills one in for an account that has none', async () => {
    const local = new FakeLocal()
    const vault = document({
      accounts: [
        // Already local, and nameless: this is the fill.
        { email: 'nick@example.com', label: 'Nick', senderName: 'Nick Galang' },
        // Not local at all: the name arrives with the account.
        { email: 'restored@example.com', label: 'Restored', senderName: 'Nick G' },
      ],
    })

    const result = await applyVault(vault, local, 'desktop')

    expect(local.accounts.map((a) => [a.email, a.senderName])).toEqual([
      ['nick@example.com', 'Nick Galang'],
      ['restored@example.com', 'Nick G'],
    ])
    // The fill is not an add: no account appeared, and the row was updated in
    // place rather than duplicated.
    expect(result).toMatchObject({ added: 1, removed: 0 })
  })

  it('keeps a name this device already has, and never clears one the vault omits', async () => {
    // Fill, never replace, and absence is never an instruction — the merge
    // rule in `docs/spec/MARU-ACCOUNT.md`.
    class Named extends FakeLocal {
      accounts: Account[] = [{ id: 'local-1', email: 'nick@example.com', displayName: 'Nick', senderName: 'Mine', color: '#123', addedAt: 1 }]
    }
    const different = new Named()
    await applyVault(document({ accounts: [{ email: 'nick@example.com', label: 'Nick', senderName: 'Theirs' }] }), different, 'desktop')
    expect(different.accounts[0].senderName).toBe('Mine')

    const silent = new Named()
    await applyVault(document({ accounts: [{ email: 'nick@example.com', label: 'Nick' }] }), silent, 'desktop')
    expect(silent.accounts[0].senderName).toBe('Mine')
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
    const result = await applyVault(vault, local, 'desktop')
    expect(result).toMatchObject({ added: 0, removed: 0, tokensFiled: 0 })
    expect(local.settingsWrites).toBe(0)
    expect(local.credentialWrites).toBe(0)
    expect(local.refreshes).toBe(0)
  })
})
