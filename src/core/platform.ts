// Native seam. tauri.ts implements this over Tauri plugins; tests implement
// it over Node (better-sqlite3 + undici). The demo service bypasses it.

export interface SqlDb {
  /** INSERT/UPDATE/DELETE/DDL. Positional params bind to $1..$n. */
  execute(sql: string, params?: unknown[]): Promise<void>
  /** SELECT returning rows as objects. */
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface Platform {
  sqlOpen(): Promise<SqlDb>
  /** All Google traffic goes through this (native HTTP in Tauri — no CORS). */
  fetch(url: string, init?: RequestInit): Promise<Response>
  secretGet(key: string): Promise<string | null>
  secretSet(key: string, value: string): Promise<void>
  secretDelete(key: string): Promise<void>
  /** Opens the system browser. */
  openExternal(url: string): Promise<void>
  /**
   * Starts the one-shot loopback listener on 127.0.0.1:port and resolves with
   * the request path of the /callback hit (e.g. "/callback?code=..&state=..").
   * Start this BEFORE opening the auth URL. Rejects after 180 s.
   */
  oauthListen(port: number): Promise<string>
  notify(title: string, body: string): Promise<void>
}
