import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountClient } from '../src/core/account/client'
import { openText, seal } from '../src/core/account/crypto'
import { AccountSessionStore, ACCOUNT_KEY_SECRET, ACCOUNT_SESSION_SECRET } from '../src/core/account/session'
import { AccountSync } from '../src/core/account/sync'
import type { VaultDocument } from '../src/core/account/vault'
import { Store } from '../src/core/store/db'
import { FakeVaultLocal, settings, vaultDocument } from './fixtures/domain'
import { NodePlatform, jsonResponse } from './helpers/node-platform'

const doc = (time: number): VaultDocument => vaultDocument({ updatedAt: time, accounts: [] })

describe('AccountSync', () => {
  let platform: NodePlatform
  let session: AccountSessionStore
  const key = new Uint8Array(32).fill(4)

  beforeEach(async () => {
    platform = new NodePlatform()
    await Store.open(platform)
    session = new AccountSessionStore(platform)
    await session.save({ token: 'session-token', deviceId: 'device', accountId: 'account', email: 'nick@example.com' }, key)
  })

  afterEach(() => vi.useRealTimers())

  // The shared in-memory port, with this suite's clock. Every test that needs
  // a different account list or credential spreads it and overrides that one
  // method, so the eight pass-throughs are written once.
  const local = () => new FakeVaultLocal()

  it('pauses after three 409 merge rounds', async () => {
    const conflicts = await Promise.all([1, 2, 3].map(async (version) => ({
      version,
      ciphertext: await seal(key, JSON.stringify(doc(version)), `maru-vault-v1:${version}`),
    })))
    let request = 0
    platform.handler = () => jsonResponse({ error: 'conflict', ...conflicts[request++] }, 409)
    const client = new AccountClient(platform, 'https://sync.test', 'session-token')
    const sync = new AccountSync({ client, session, local: local(), family: 'desktop', debounceMs: 1 })
    await sync.push()
    expect(platform.requests).toHaveLength(3)
    expect(sync.currentState()).toMatchObject({ kind: 'paused', reason: 'conflict' })
  })

  it('clears the Maru session and account key after remote revoke', async () => {
    platform.handler = () => jsonResponse({ error: 'revoked', message: 'This device was signed out' }, 401)
    const client = new AccountClient(platform, 'https://sync.test', 'session-token')
    const sync = new AccountSync({ client, session, local: local(), family: 'desktop' })
    await sync.pull()
    expect(sync.currentState()).toEqual({
      kind: 'signed_out',
      reason: 'revoked',
      message: 'This device was signed out remotely. Sign in again to resume sync.',
    })
    expect(platform.secrets.has(ACCOUNT_SESSION_SECRET)).toBe(false)
    expect(platform.secrets.has(ACCOUNT_KEY_SECRET)).toBe(false)
  })

  it('pauses writes for payment while leaving pull callable', async () => {
    let method = 'PUT'
    platform.handler = (request) => {
      method = request.method
      return request.method === 'PUT'
        ? jsonResponse({ error: 'payment_required', message: 'Subscribe' }, 402)
        : new Response(null, { status: 204 })
    }
    const client = new AccountClient(platform, 'https://sync.test', 'session-token')
    const sync = new AccountSync({ client, session, local: local(), family: 'desktop' })
    await sync.push()
    expect(sync.currentState()).toMatchObject({ kind: 'paused', reason: 'subscription_needed' })
    await sync.pull()
    expect(method).toBe('GET')
  })

  it('joins concurrent pulls and ignores scheduled pushes after stop', async () => {
    vi.useFakeTimers()
    platform.handler = () => new Response(null, { status: 204 })
    const client = new AccountClient(platform, 'https://sync.test', 'session-token')
    const sync = new AccountSync({ client, session, local: local(), family: 'desktop', debounceMs: 1 })
    const first = sync.pull()
    const second = sync.pull()
    expect(second).toBe(first)
    await first
    sync.stop()
    sync.schedulePush()
    await vi.advanceTimersByTimeAsync(2)
    expect(platform.requests).toHaveLength(1)
  })

  it('does not echo settings applied by a pull', async () => {
    vi.useFakeTimers()
    const remote = await seal(key, JSON.stringify(doc(2)), 'maru-vault-v1:1')
    platform.handler = (request) => request.method === 'GET'
      ? jsonResponse({ version: 1, ciphertext: remote, updatedAt: 2 })
      : jsonResponse({ version: 2 })
    const client = new AccountClient(platform, 'https://sync.test', 'session-token')
    let sync: AccountSync
    const vaultLocal = local()
    vaultLocal.getSettings = async () => ({ ...settings, theme: 'light' })
    vaultLocal.setSettings = async () => { sync.schedulePush() }
    sync = new AccountSync({ client, session, local: vaultLocal, family: 'desktop', debounceMs: 1, pullIntervalMs: 60_000 })
    await sync.start()
    await vi.advanceTimersByTimeAsync(2)
    sync.stop()
    expect(platform.requests.map((request) => request.method)).toEqual(['GET'])
  })

  it('reuses cached credentials until account data changes', async () => {
    let version = 0
    platform.handler = () => jsonResponse({ version: ++version })
    let credentialReads = 0
    const vaultLocal = {
      ...local(),
      listAccounts: async () => [{
        id: 'mail', email: 'nick@example.com', displayName: 'Nick', color: '#123', addedAt: 1,
      }],
      loadCredential: async () => {
        credentialReads += 1
        return { clientId: 'client', refreshToken: 'token', issuedAt: 1 }
      },
    }
    const sync = new AccountSync({
      client: new AccountClient(platform, 'https://sync.test', 'session-token'),
      session,
      local: vaultLocal,
      family: 'desktop',
    })
    await sync.push()
    await sync.push()
    expect(credentialReads).toBe(1)
    sync.invalidateCredentialCache()
    await sync.push()
    expect(credentialReads).toBe(2)
  })

  it('preserves desktop credentials when iOS pushes without a conflict', async () => {
    const email = 'nick@example.com'
    const desktopCredential = {
      clientId: 'desktop-client',
      refreshToken: 'desktop-token',
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      issuedAt: 10,
    }
    const remote: VaultDocument = {
      ...doc(10),
      accounts: [{ email, label: 'Nick' }],
      credentials: { desktop: { [email]: desktopCredential }, ios: {} },
    }
    const ciphertext = await seal(key, JSON.stringify(remote), 'maru-vault-v1:1')
    let pushed = ''
    platform.handler = (request) => {
      if (request.method === 'GET') return jsonResponse({ version: 1, ciphertext, updatedAt: 10 })
      pushed = String((JSON.parse(request.body ?? '{}') as { ciphertext?: string }).ciphertext ?? '')
      return jsonResponse({ version: 2 })
    }
    const vaultLocal = {
      ...local(),
      listAccounts: async () => [{ id: 'mail', email, displayName: 'Nick', color: '#123', addedAt: 1 }],
      loadCredential: async () => ({ clientId: 'ios-client', refreshToken: 'ios-token', issuedAt: 20 }),
    }
    const sync = new AccountSync({
      client: new AccountClient(platform, 'https://sync.test', 'session-token'),
      session,
      local: vaultLocal,
      family: 'ios',
    })

    await sync.pull()
    await sync.push()

    const pushedDoc = JSON.parse(await openText(key, pushed, 'maru-vault-v1:2')) as VaultDocument
    expect(pushedDoc.credentials.desktop[email]).toEqual(desktopCredential)
    expect(pushedDoc.credentials.ios[email]).toMatchObject({
      clientId: 'ios-client',
      refreshToken: 'ios-token',
    })
  })

  it('drops both credential families when an account is removed', async () => {
    const email = 'nick@example.com'
    const credential = {
      clientId: 'client',
      refreshToken: 'token',
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      issuedAt: 10,
    }
    const remote: VaultDocument = {
      ...doc(10),
      accounts: [{ email, label: 'Nick' }],
      credentials: {
        desktop: { [email]: credential },
        ios: { [email]: credential },
      },
    }
    const ciphertext = await seal(key, JSON.stringify(remote), 'maru-vault-v1:1')
    let accounts = [{ id: 'mail', email, displayName: 'Nick', color: '#123', addedAt: 1 }]
    let pushed = ''
    platform.handler = (request) => {
      if (request.method === 'GET') return jsonResponse({ version: 1, ciphertext, updatedAt: 10 })
      pushed = String((JSON.parse(request.body ?? '{}') as { ciphertext?: string }).ciphertext ?? '')
      return jsonResponse({ version: 2 })
    }
    const vaultLocal = {
      ...local(),
      listAccounts: async () => accounts,
      loadCredential: async () => ({ clientId: 'ios-client', refreshToken: 'ios-token', issuedAt: 20 }),
    }
    const sync = new AccountSync({
      client: new AccountClient(platform, 'https://sync.test', 'session-token'),
      session,
      local: vaultLocal,
      family: 'ios',
    })

    await sync.pull()
    accounts = []
    sync.invalidateCredentialCache()
    await sync.push()

    const pushedDoc = JSON.parse(await openText(key, pushed, 'maru-vault-v1:2')) as VaultDocument
    expect(pushedDoc.accounts).toEqual([])
    expect(pushedDoc.credentials).toEqual({ desktop: {}, ios: {} })
  })
})
