import type { Platform } from '../platform'
import type { KdfParams } from './crypto'

export type Plan = 'monthly' | 'yearly'
export type EntitlementState = 'trialing' | 'active' | 'past_due' | 'expired' | 'comped'

export interface DeviceInput { name: string; platform: string; family: 'desktop' | 'ios' }
export interface AuthSession { token: string; deviceId: string; accountId: string }
export interface PreloginResponse { kdf: KdfParams; salt: string }
export interface RecoverStartResponse { wrappedByRecovery: string; kdf: KdfParams }
export interface LoginResponse extends AuthSession { kdf: KdfParams; wrappedByPassword: string }
export interface VaultResponse { version: number; ciphertext: string; updatedAt: number }
export interface VaultConflict { version: number; ciphertext: string; updatedAt?: number }
export interface AccountDevice { id: string; name: string; platform: string; family: string; createdAt: number; lastSeenAt: number; current: boolean }
export interface Entitlement { state: EntitlementState; plan: Plan | null; trialEndsAt: number | null; periodEndsAt: number | null; cancelAtPeriodEnd: boolean; graceEndsAt?: number | null }
export interface MeResponse { email: string; accountId: string; entitlement: Entitlement }
export interface VaultHistoryEntry { version: number; updatedAt: number }
export interface PushTestResult { ok: boolean; sent: boolean; apns?: { status: number; reason: string } }

export class MaruApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'MaruApiError'
  }
}

export function accountBaseUrl(): string {
  const configured = import.meta.env.VITE_MARU_SYNC_URL?.trim()
  if (configured) return configured.replace(/\/$/u, '')
  return import.meta.env.DEV ? 'http://127.0.0.1:8787' : 'https://sync.getmaru.app'
}

export class AccountClient {
  constructor(
    private readonly platform: Pick<Platform, 'fetch'>,
    readonly baseUrl = accountBaseUrl(),
    private token: string | null = null,
  ) {}

  setToken(token: string | null): void { this.token = token }

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    if (init.body) headers.set('content-type', 'application/json')
    if (authenticated) {
      if (!this.token) throw new MaruApiError(401, 'no_session', 'Sign in to your Maru account')
      headers.set('authorization', `Bearer ${this.token}`)
    }
    let response: Response
    try {
      response = await this.platform.fetch(`${this.baseUrl}${path}`, { ...init, headers })
    } catch (cause) {
      throw new MaruApiError(0, 'network', cause instanceof Error ? cause.message : 'Unable to reach Maru sync')
    }
    if (response.status === 204) return null as T
    let body: Record<string, unknown> = {}
    try { body = await response.json() as Record<string, unknown> } catch { body = {} }
    if (!response.ok) {
      const nested = typeof body.error === 'object' && body.error ? body.error as Record<string, unknown> : null
      const code = String(nested?.code ?? body.error ?? `http_${response.status}`)
      const message = String(nested?.message ?? body.message ?? `Maru sync returned ${response.status}`)
      throw new MaruApiError(response.status, code, message, body)
    }
    return body as T
  }

  prelogin(email: string) { return this.request<PreloginResponse>('/v1/auth/prelogin', { method: 'POST', body: JSON.stringify({ email }) }, false) }
  recoverStart(body: { email: string; recAuthKey: string }) { return this.request<RecoverStartResponse>('/v1/auth/recover-start', { method: 'POST', body: JSON.stringify(body) }, false) }
  signup(body: Record<string, unknown>) { return this.request<AuthSession>('/v1/auth/signup', { method: 'POST', body: JSON.stringify(body) }, false) }
  login(body: Record<string, unknown>) { return this.request<LoginResponse>('/v1/auth/login', { method: 'POST', body: JSON.stringify(body) }, false) }
  recover(body: Record<string, unknown>) { return this.request<AuthSession>('/v1/auth/recover', { method: 'POST', body: JSON.stringify(body) }, false) }
  changePassword(body: { authKey: string; newAuthKey: string; newWrappedByPassword: string }) { return this.request<{ ok: true }>('/v1/auth/password', { method: 'POST', body: JSON.stringify(body) }) }
  logout() { return this.request<{ ok: true }>('/v1/auth/logout', { method: 'POST' }) }
  vault() { return this.request<VaultResponse | null>('/v1/vault') }
  putVault(baseVersion: number, ciphertext: string) { return this.request<{ version: number }>('/v1/vault', { method: 'PUT', body: JSON.stringify({ baseVersion, ciphertext }) }) }
  devices() { return this.request<{ devices: AccountDevice[] }>('/v1/devices') }
  revokeDevice(id: string) { return this.request<{ ok: true }>(`/v1/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
  renameDevice(id: string, name: string) { return this.request<{ ok: true }>(`/v1/devices/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) }) }
  deleteAccount(authKey: string) { return this.request<{ ok: true }>('/v1/account', { method: 'DELETE', body: JSON.stringify({ authKey }) }) }
  pushRegister(apnsToken: string | null) { return this.request<{ ok: true }>('/v1/push/register', { method: 'POST', body: JSON.stringify({ apnsToken }) }) }
  pushWatch(email: string, expiration: number) { return this.request<{ ok: true }>('/v1/push/watch', { method: 'POST', body: JSON.stringify({ email, expiration }) }) }
  /** One visible test alert to this device's own token. An APNs rejection comes back as a 200 body — §9. */
  pushTest() { return this.request<PushTestResult>('/v1/push/test', { method: 'POST' }) }
  health() { return this.request<{ ok: true; version: string }>('/healthz', {}, false) }
  me() { return this.request<MeResponse>('/v1/me') }
  checkout(plan: Plan) { return this.request<{ url: string }>('/v1/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }) }
  portal() { return this.request<{ url: string }>('/v1/billing/portal', { method: 'POST' }) }
  vaultHistory() { return this.request<{ versions: VaultHistoryEntry[] }>('/v1/vault/history') }
  vaultRestore(version: number) { return this.request<{ version: number }>('/v1/vault/restore', { method: 'POST', body: JSON.stringify({ version }) }) }
}
