import type { KdfParams } from '../account/crypto'
import type { AccountSession, AccountSessionAccess } from '../account/session'

export class DemoAccountSessionStore implements AccountSessionAccess {
  private session: AccountSession | null = null
  private key: Uint8Array | null = null
  private readonly meta = new Map<string, string>()

  async load(): Promise<AccountSession | null> { return this.session }
  async save(session: AccountSession, accountKey: Uint8Array): Promise<void> {
    this.session = session
    this.key = accountKey
  }
  async accountKey(): Promise<Uint8Array | null> { return this.key }
  async clear(): Promise<void> {
    this.session = null
    this.key = null
    this.meta.clear()
  }
  async getMeta(key: string): Promise<string | null> { return this.meta.get(key) ?? null }
  async setMeta(key: string, value: string): Promise<void> { this.meta.set(key, value) }
}

export class DemoAccountBackend {
  email = ''
  wrappedByPassword = ''
  wrappedByRecovery = ''
  readonly kdf: KdfParams = { algo: 'argon2id', m: 32, t: 2, p: 1 }
  readonly session = new DemoAccountSessionStore()
  private version = 0
  private ciphertext = ''
  private name = 'Demo desktop'

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const path = new URL(url).pathname
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    })
    if (path === '/v1/auth/prelogin') return json({ kdf: this.kdf, salt: '' })
    if (path === '/v1/auth/recover-start') {
      return this.wrappedByRecovery
        ? json({ kdf: this.kdf, wrappedByRecovery: this.wrappedByRecovery })
        : json({ error: 'bad_recovery', message: 'Recovery key not found' }, 401)
    }
    if (path === '/v1/auth/signup') {
      this.email = String(body.email)
      this.wrappedByPassword = String(body.wrappedByPassword)
      this.wrappedByRecovery = String(body.wrappedByRecovery)
      return json({ token: 'demo-token', deviceId: 'demo-device', accountId: 'demo-account' })
    }
    if (path === '/v1/auth/login') {
      return json({
        token: 'demo-token',
        deviceId: 'demo-device',
        accountId: 'demo-account',
        kdf: this.kdf,
        wrappedByPassword: this.wrappedByPassword,
      })
    }
    if (path === '/v1/auth/recover') {
      this.wrappedByPassword = String(body.newWrappedByPassword)
      this.wrappedByRecovery = String(body.newWrappedByRecovery)
      return json({ token: 'demo-token', deviceId: 'demo-device', accountId: 'demo-account' })
    }
    if (path === '/v1/vault' && (init.method ?? 'GET') === 'GET') {
      return this.version
        ? json({ version: this.version, ciphertext: this.ciphertext, updatedAt: Date.now() })
        : new Response(null, { status: 204 })
    }
    if (path === '/v1/vault' && init.method === 'PUT') {
      this.version += 1
      this.ciphertext = String(body.ciphertext)
      return json({ version: this.version })
    }
    if (path === '/v1/me') {
      return json({
        email: this.email,
        accountId: 'demo-account',
        entitlement: {
          state: 'comped',
          plan: null,
          trialEndsAt: null,
          periodEndsAt: null,
          cancelAtPeriodEnd: false,
        },
      })
    }
    if (path === '/v1/devices' && (init.method ?? 'GET') === 'GET') {
      return json({ devices: [{
        id: 'demo-device',
        name: this.name,
        platform: 'macos',
        family: 'desktop',
        createdAt: Date.now() - 86_400_000,
        lastSeenAt: Date.now(),
        current: true,
      }] })
    }
    if (path === '/v1/devices/demo-device' && init.method === 'PATCH') {
      this.name = String(body.name)
      return json({ ok: true })
    }
    if (path === '/v1/vault/history') {
      return json({ versions: this.version ? [{ version: this.version, updatedAt: Date.now() }] : [] })
    }
    if (path === '/v1/billing/checkout') return json({ url: 'https://getmaru.app/account?demo=checkout' })
    if (path === '/v1/billing/portal') return json({ url: 'https://getmaru.app/account?demo=portal' })
    return json({ ok: true })
  }
}
