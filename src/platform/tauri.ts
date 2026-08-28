// Platform implementation over the Tauri plugins. Deliberately thin: it holds
// no logic, only adapters, because nothing in this file can run under Node and
// so nothing in it is unit-tested. Everything testable lives in src/core.

import Database from '@tauri-apps/plugin-sql'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import type { Platform, SqlDb } from '../core/platform'

export const DB_URL = 'sqlite:wren.db'

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
