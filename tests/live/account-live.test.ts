/**
 * Live proof of the Maru account against a running sync service. Skipped
 * unless MARU_LIVE_SYNC_URL and MARU_LIVE_EMAIL (an allowlisted address) are
 * set, because it creates and then deletes a real account:
 *
 *   MARU_LIVE_SYNC_URL=https://sync-production-c0b0.up.railway.app \
 *   MARU_LIVE_EMAIL=nick@metadao.fi npx vitest run tests/live
 *
 * It exercises the real client code (crypto, wire format, client) end to
 * end: signup, entitlement, seal and put the vault, sign in as a second
 * device, open the vault, devices list, rename, revoke, logout, delete.
 */
import { describe, expect, it } from 'vitest'
import {
  AccountClient,
  DEFAULT_KDF,
  deriveMasterKey,
  derivePasswordKeys,
  deriveRecoveryKeys,
  generateRecoveryPhrase,
  openText,
  recoveryEntropy,
  seal,
  unwrapByPassword,
  wrapByPassword,
  wrapByRecovery,
} from '../../src/core/account'
import { base64UrlEncodeBytes } from '../../src/core/mime'

const url = process.env.MARU_LIVE_SYNC_URL
const email = process.env.MARU_LIVE_EMAIL

describe.skipIf(!url || !email)('Maru account against the live service', () => {
  it('signs up, syncs a vault, signs in from a second device, and deletes itself', async () => {
    const platform = { fetch: (input: string, init?: RequestInit) => fetch(input, init) }
    const first = new AccountClient(platform, url!)
    const password = `live-proof-${Date.now()}-correct-horse`

    expect(await first.health()).toMatchObject({ ok: true })

    // Sign up (device 1).
    const keys = await derivePasswordKeys(await deriveMasterKey(password, email!, DEFAULT_KDF))
    const phrase = await generateRecoveryPhrase()
    const recovery = await deriveRecoveryKeys(await recoveryEntropy(phrase))
    const accountKey = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const signup = await first.signup({
      email,
      authKey: base64UrlEncodeBytes(keys.authKey),
      recAuthKey: base64UrlEncodeBytes(recovery.authKey),
      kdf: DEFAULT_KDF,
      wrappedByPassword: await wrapByPassword(keys.encKey, accountKey),
      wrappedByRecovery: await wrapByRecovery(recovery.encKey, accountKey),
      device: { name: 'live-proof-1', platform: 'macos', family: 'desktop' },
    })
    first.setToken(signup.token)

    try {
      const me = await first.me()
      expect(me.entitlement.state).toBe('comped')

      // Seal and put a vault.
      const doc = {
        v: 1,
        updatedAt: Date.now(),
        settings: { theme: 'dark' },
        accounts: [{ email, label: 'Live proof' }],
        credentials: { desktop: {}, ios: {} },
      }
      const put = await first.putVault(0, await seal(accountKey, JSON.stringify(doc), 'maru-vault-v1:1'))
      expect(put.version).toBe(1)

      // Second device signs in with the password only.
      const second = new AccountClient(platform, url!)
      const prelogin = await second.prelogin(email!)
      const keys2 = await derivePasswordKeys(await deriveMasterKey(password, email!, prelogin.kdf))
      const login = await second.login({
        email,
        authKey: base64UrlEncodeBytes(keys2.authKey),
        device: { name: 'live-proof-2', platform: 'windows', family: 'desktop' },
      })
      second.setToken(login.token)
      const accountKey2 = await unwrapByPassword(keys2.encKey, login.wrappedByPassword)
      expect(Array.from(accountKey2)).toEqual(Array.from(accountKey))

      const remote = await second.vault()
      expect(remote?.version).toBe(1)
      const opened = JSON.parse(await openText(accountKey2, remote!.ciphertext, 'maru-vault-v1:1'))
      expect(opened.settings.theme).toBe('dark')
      expect(opened.accounts[0].email).toBe(email)

      // Devices: two listed, rename one, revoke the first from the second.
      const devices = (await second.devices()).devices
      expect(devices.map((d) => d.name).sort()).toEqual(['live-proof-1', 'live-proof-2'])
      const mine = devices.find((d) => d.current)!
      await second.renameDevice(mine.id, 'live-proof-2-renamed')
      const other = devices.find((d) => !d.current)!
      await second.revokeDevice(other.id)
      await expect(first.devices()).rejects.toMatchObject({ status: 401 })

      // Second device deletes the account with the password proof.
      await second.deleteAccount(base64UrlEncodeBytes(keys2.authKey))
      await expect(second.me()).rejects.toMatchObject({ status: 401 })
    } catch (error) {
      // Leave no account behind on failure either.
      await first.deleteAccount(base64UrlEncodeBytes(keys.authKey)).catch(() => undefined)
      throw error
    }
  }, 120_000)
})
