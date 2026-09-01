import { beforeEach, describe, expect, it } from 'vitest'

import { AccountClient } from '../src/core/account/client'
import { seal } from '../src/core/account/crypto'
import { AccountSessionStore, ACCOUNT_KEY_SECRET, ACCOUNT_SESSION_SECRET } from '../src/core/account/session'
import { AccountSync } from '../src/core/account/sync'
import type { VaultDocument } from '../src/core/account/vault'
import { Store } from '../src/core/store/db'
import type { Settings } from '../src/core/types'
import { NodePlatform, jsonResponse } from './helpers/node-platform'

const settings: Settings = { theme: 'dark', imagePolicy: 'allow', pollIntervalSec: 60, sounds: false, conversationOrder: 'chronological' }
const doc = (time: number): VaultDocument => ({ v: 1, updatedAt: time, settings, accounts: [], credentials: { desktop: {}, ios: {} } })

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

  const local = () => ({
    getSettings: async () => settings,
    setSettings: async () => {},
    listAccounts: async () => [],
    upsertAccount: async () => {},
    removeAccount: async () => {},
    loadCredential: async () => null,
    saveCredential: async () => {},
    clearCredential: async () => {},
    now: () => 50,
  })

  it('pauses after three 409 merge rounds', async () => {
    const conflicts = await Promise.all([1, 2, 3].map(async (version) => ({
      version,
      ciphertext: await seal(key, JSON.stringify(doc(version)), `maru-vault-v1:${version}`),
    })))
    let request = 0
    platform.handler = () => jsonResponse({ error: 'conflict', ...conflicts[request++] }, 409)
    const client = new AccountClient(platform, 'https://sync.test', 'session-token')
    const sync = new AccountSync({ client, session, local: local(), debounceMs: 1 })
    await sync.push()
    expect(platform.requests).toHaveLength(3)
    expect(sync.currentState()).toMatchObject({ kind: 'paused', reason: 'conflict' })
  })

  it('clears the Maru session and account key after remote revoke', async () => {
    platform.handler = () => jsonResponse({ error: 'revoked', message: 'This device was signed out' }, 401)
    const client = new AccountClient(platform, 'https://sync.test', 'session-token')
    const sync = new AccountSync({ client, session, local: local() })
    await sync.pull()
    expect(sync.currentState()).toEqual({ kind: 'signed_out', reason: 'revoked' })
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
    const sync = new AccountSync({ client, session, local: local() })
    await sync.push()
    expect(sync.currentState()).toMatchObject({ kind: 'paused', reason: 'subscription_needed' })
    await sync.pull()
    expect(method).toBe('GET')
  })
})
