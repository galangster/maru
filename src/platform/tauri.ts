// Platform implementation over the Tauri plugins. Deliberately thin: it holds
// no logic, only adapters, because nothing in this file can run under Node and
// so nothing in it is unit-tested. Everything testable lives in src/core.

import Database from '@tauri-apps/plugin-sql'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import type { Platform, SqlDb } from '../core/platform'

/**
 * A dev build gets its OWN database, and that is the safe default.
 *
 * Dev and release share one bundle identifier and therefore one app-data
 * directory, so until this split a `tauri dev` opened the person's real
 * mailbox — 3,607 threads on this machine — and **ran migrations against it**.
 * Two migrations were written on 2026-08-31 alone, one of them a repair that
 * rewrites label rows across every thread. A mistake in one of those, run from
 * a half-finished working tree, would have landed on real mail. The keychain
 * split already stops a dev build syncing or sending; it does nothing to stop
 * it writing.
 *
 * It also closes what the gateway socket split could not: agent credentials,
 * grants and the audit log live in this database, so a credential issued by one
 * build was accepted by the other.
 *
 * The escape hatch is deliberate and explicit, because reading real mail is
 * exactly what makes design work possible — a night of visual review against 20
 * synthetic demo threads is not the same job:
 *
 *     VITE_MARU_REAL_DB=1 npm run tauri dev
 *
 * That opts a dev build back onto the real database, migrations and all. It is
 * an env var rather than a UI toggle on purpose: the dangerous case should cost
 * a deliberate keystroke every time, and never be a setting someone leaves on.
 *
 * A packaged build ignores all of this and always opens `wren.db`.
 */
const DEV_DB = import.meta.env.DEV && import.meta.env.VITE_MARU_REAL_DB !== '1'

export const DB_URL = DEV_DB ? 'sqlite:wren.dev.db' : 'sqlite:wren.db'

class TauriSqlDb implements SqlDb {
  constructor(private readonly db: Database) {}

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.db.execute(sql, params)
  }

  async select<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.select<T[]>(sql, params)
  }
}

export class TauriPlatform implements Platform {
  private db: SqlDb | null = null
  private opening: Promise<SqlDb> | null = null
  private notificationsAllowed: boolean | null = null

  async sqlOpen(): Promise<SqlDb> {
    if (this.db) return this.db
    // Single-flight: two callers on startup must not open two handles.
    this.opening ??= Database.load(DB_URL).then((raw) => {
      this.db = new TauriSqlDb(raw)
      return this.db
    })
    return this.opening
  }

  /** Native HTTP: no browser origin, so no CORS and no preflight. */
  fetch(url: string, init?: RequestInit): Promise<Response> {
    return tauriFetch(url, init)
  }

  secretGet(key: string): Promise<string | null> {
    return invoke<string | null>('secret_get', { key })
  }

  secretSet(key: string, value: string): Promise<void> {
    return invoke<void>('secret_set', { key, value })
  }

  secretDelete(key: string): Promise<void> {
    return invoke<void>('secret_delete', { key })
  }

  openExternal(url: string): Promise<void> {
    return openUrl(url)
  }

  /** Resolves with the request target of the /callback hit, e.g. "/callback?code=..". */
  oauthListen(port: number): Promise<string> {
    return invoke<string>('oauth_listen', { port })
  }

  async authSession(url: string, callbackScheme: string): Promise<string> {
    const result = await invoke<{ callbackUrl: string }>(
      'plugin:maru-auth|start_auth_session',
      { url, callbackScheme },
    )
    return result.callbackUrl
  }

  async notify(title: string, body: string): Promise<void> {
    if (this.notificationsAllowed === null) {
      this.notificationsAllowed = await isPermissionGranted()
      if (!this.notificationsAllowed) {
        this.notificationsAllowed = (await requestPermission()) === 'granted'
      }
    }
    if (this.notificationsAllowed) sendNotification({ title, body })
  }
}

export function createTauriPlatform(): Platform {
  return new TauriPlatform()
}
