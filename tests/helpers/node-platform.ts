// Node implementation of the Platform seam, for tests only.
//   sqlOpen  -> better-sqlite3 (in-memory)
//   fetch    -> a per-test stub
//   secrets  -> a Map
//   oauth    -> a resolvable promise plus a call-order log

import Database from 'better-sqlite3'
import type { Platform, SqlDb } from '../../src/core/platform'

/** Tauri's sql plugin binds $1..$n; better-sqlite3 binds ?. */
export function translateSql(sql: string, params: unknown[]): { sql: string; args: unknown[] } {
  const args: unknown[] = []
  const translated = sql.replace(/\$(\d+)/g, (_match, digits: string) => {
    args.push(params[Number(digits) - 1])
    return '?'
  })
  return { sql: translated, args: args.map(bindable) }
}

function bindable(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Uint8Array) return Buffer.from(value)
  return value
}

export class NodeSqlDb implements SqlDb {
  readonly raw: Database.Database

  constructor(filename = ':memory:') {
    this.raw = new Database(filename)
    this.raw.pragma('journal_mode = MEMORY')
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (params.length === 0 && /;\s*\S/.test(sql.trim())) {
      this.raw.exec(sql)
      return
    }
    const t = translateSql(sql, params)
    this.raw.prepare(t.sql).run(...(t.args as never[]))
  }

  async select<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const t = translateSql(sql, params)
    return this.raw.prepare(t.sql).all(...(t.args as never[])) as T[]
  }
}

export interface RecordedRequest {
  url: string
  method: string
  body: string | undefined
  headers: Record<string, string>
}

export type FetchHandler = (req: RecordedRequest) => Response | Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function errorResponse(status: number, reason = 'failed'): Response {
  return new Response(JSON.stringify({ error: { code: status, message: reason } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export class NodePlatform implements Platform {
  readonly secrets = new Map<string, string>()
  readonly requests: RecordedRequest[] = []
  readonly opened: string[] = []
  readonly notifications: { title: string; body: string }[] = []
  /** Ordered log of side-effecting platform calls, for sequencing assertions. */
  readonly calls: string[] = []

  handler: FetchHandler = () => errorResponse(500, 'no fetch handler installed')
  /** Resolves the pending oauthListen; a test sets this before runAuthFlow. */
  oauthResponder: (port: number) => Promise<string> = async () => '/callback'

  private db: NodeSqlDb | null = null

  async sqlOpen(): Promise<SqlDb> {
    if (!this.db) this.db = new NodeSqlDb()
    return this.db
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {}
    const raw = init?.headers
    if (raw) {
      if (raw instanceof Headers) raw.forEach((v, k) => (headers[k.toLowerCase()] = v))
      else if (Array.isArray(raw)) for (const [k, v] of raw) headers[k.toLowerCase()] = v
      else for (const [k, v] of Object.entries(raw)) headers[k.toLowerCase()] = String(v)
    }
    const req: RecordedRequest = {
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      headers,
    }
    this.requests.push(req)
    this.calls.push(`fetch:${url.split('?')[0]}`)
    return this.handler(req)
  }

  async secretGet(key: string): Promise<string | null> {
    return this.secrets.get(key) ?? null
  }

  async secretSet(key: string, value: string): Promise<void> {
    this.secrets.set(key, value)
  }

  async secretDelete(key: string): Promise<void> {
    this.secrets.delete(key)
  }

  async openExternal(url: string): Promise<void> {
    this.opened.push(url)
    this.calls.push('openExternal')
  }

  async oauthListen(port: number): Promise<string> {
    this.calls.push('oauthListen')
    // The real listener blocks until the browser hits /callback, so the
    // responder must not run before openExternal has been called.
    await new Promise((r) => setTimeout(r, 0))
    return this.oauthResponder(port)
  }

  async notify(title: string, body: string): Promise<void> {
    this.notifications.push({ title, body })
  }
}
