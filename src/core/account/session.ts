import type { Platform, SqlDb } from '../platform'
import { base64UrlEncodeBytes, decodeBase64Url } from '../mime'

export const ACCOUNT_SESSION_SECRET = 'maru-account-session'
export const ACCOUNT_KEY_SECRET = 'maru-account-key'
const META_PREFIX = 'maru-account:'

export interface AccountSession {
  token: string
  deviceId: string
  accountId: string
  email: string
}

export interface AccountSessionAccess {
  load(): Promise<AccountSession | null>
  save(session: AccountSession, accountKey: Uint8Array): Promise<void>
  accountKey(): Promise<Uint8Array | null>
  clear(): Promise<void>
  getMeta(key: string): Promise<string | null>
  setMeta(key: string, value: string): Promise<void>
}

export class AccountSessionStore implements AccountSessionAccess {
  private db: SqlDb | null = null
  constructor(private readonly platform: Pick<Platform, 'secretGet' | 'secretSet' | 'secretDelete' | 'sqlOpen'>) {}

  private async database(): Promise<SqlDb> {
    this.db ??= await this.platform.sqlOpen()
    return this.db
  }

  async load(): Promise<AccountSession | null> {
    const raw = await this.platform.secretGet(ACCOUNT_SESSION_SECRET)
    if (!raw) return null
    try {
      const session = JSON.parse(raw) as AccountSession
      return session.token && session.email && session.deviceId && session.accountId ? session : null
    } catch { return null }
  }

  async save(session: AccountSession, accountKey: Uint8Array): Promise<void> {
    await Promise.all([
      this.platform.secretSet(ACCOUNT_SESSION_SECRET, JSON.stringify(session)),
      this.platform.secretSet(ACCOUNT_KEY_SECRET, base64UrlEncodeBytes(accountKey)),
    ])
  }

  async accountKey(): Promise<Uint8Array | null> {
    const raw = await this.platform.secretGet(ACCOUNT_KEY_SECRET)
    return raw ? decodeBase64Url(raw) : null
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.platform.secretDelete(ACCOUNT_SESSION_SECRET),
      this.platform.secretDelete(ACCOUNT_KEY_SECRET),
    ])
    await (await this.database()).execute("DELETE FROM meta WHERE key LIKE 'maru-account:%'")
  }

  async getMeta(key: string): Promise<string | null> {
    const rows = await (await this.database()).select<{ value: string }>('SELECT value FROM meta WHERE key = $1', [`${META_PREFIX}${key}`])
    return rows[0]?.value ?? null
  }

  async setMeta(key: string, value: string): Promise<void> {
    await (await this.database()).execute(
      'INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [`${META_PREFIX}${key}`, value],
    )
  }
}
