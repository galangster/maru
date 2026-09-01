import { describe, expect, it } from 'vitest'

import { AccountClient } from '../src/core/account/client'
import { NodePlatform, jsonResponse } from './helpers/node-platform'

describe('AccountClient', () => {
  it('routes every desktop account endpoint through platform.fetch', async () => {
    const platform = new NodePlatform()
    platform.handler = (request) => {
      const path = new URL(request.url).pathname
      if (path === '/v1/auth/prelogin') return jsonResponse({ kdf: { algo: 'argon2id', m: 32, t: 1, p: 1 }, salt: 'salt' })
      if (path === '/v1/auth/login') return jsonResponse({ token: 'token', deviceId: 'device', accountId: 'account', kdf: { algo: 'argon2id', m: 32, t: 1, p: 1 }, wrappedByPassword: 'm1.a.b' })
      if (path.startsWith('/v1/auth/') && ['signup', 'recover'].includes(path.split('/').at(-1) ?? '')) return jsonResponse({ token: 'token', deviceId: 'device', accountId: 'account' })
      if (path === '/v1/vault' && request.method === 'GET') return new Response(null, { status: 204 })
      if (path === '/v1/vault' || path === '/v1/vault/restore') return jsonResponse({ version: 1 })
      if (path === '/v1/vault/history') return jsonResponse({ versions: [] })
      if (path === '/v1/devices') return jsonResponse({ devices: [] })
      if (path === '/v1/me') return jsonResponse({ email: 'nick@example.com', accountId: 'account', entitlement: { state: 'comped', plan: null, trialEndsAt: null, periodEndsAt: null, cancelAtPeriodEnd: false } })
      if (path.startsWith('/v1/billing/')) return jsonResponse({ url: 'https://getmaru.app/account' })
      if (path === '/healthz') return jsonResponse({ ok: true, version: 'test' })
      return jsonResponse({ ok: true })
    }
    const client = new AccountClient(platform, 'https://sync.test', 'token')
    await client.prelogin('nick@example.com')
    await client.signup({})
    await client.login({})
    await client.recover({})
    await client.changePassword({ authKey: 'a', newAuthKey: 'b', newWrappedByPassword: 'c' })
    await client.logout()
    await client.vault()
    await client.putVault(0, 'ciphertext')
    await client.devices()
    await client.revokeDevice('other')
    await client.renameDevice('device', 'Office computer')
    await client.deleteAccount('auth')
    await client.pushRegister(null)
    await client.pushWatch('nick@example.com', 123)
    await client.health()
    await client.me()
    await client.checkout('monthly')
    await client.portal()
    await client.vaultHistory()
    await client.vaultRestore(1)

    expect(platform.requests).toHaveLength(20)
    expect(platform.requests.every((request) => request.url.startsWith('https://sync.test/'))).toBe(true)
    expect(platform.requests.filter((request) => request.url.endsWith('/healthz'))[0].headers.authorization).toBeUndefined()
    expect(platform.requests.filter((request) => request.url.endsWith('/v1/me'))[0].headers.authorization).toBe('Bearer token')
  })
})
