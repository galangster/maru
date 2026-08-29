// Google OAuth 2.0 for an installed app: loopback redirect + PKCE (S256).
//
// Google still issues a client_secret for the "Desktop app" client type and
// accepts it on the token exchange, so Wren sends it. Per RFC 8252 it is not a
// security boundary — PKCE is what protects the exchange.
//
// Nothing in this file logs a token, a code, or a secret.

import type { Platform } from '../platform'
import { base64UrlEncodeBytes } from '../mime'

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GMAIL_PROFILE_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'openid',
  'email',
] as const

/** Ephemeral range, high enough to avoid the common dev-server ports. */
export const PORT_MIN = 49500
export const PORT_MAX = 65000

/** Refresh this far before real expiry so an in-flight request never 401s. */
export const EXPIRY_MARGIN_MS = 60_000

export class OAuthError extends Error {
  readonly code: string
  readonly needsReauth: boolean

  constructor(code: string, message: string, needsReauth = false) {
    super(message)
    this.name = 'OAuthError'
    this.code = code
    this.needsReauth = needsReauth
  }
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface StoredAccountTokens {
  refreshToken: string
  accessToken?: string
  expiresAt?: number
  clientId: string
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

/** RFC 7636 §4.1: 43-128 characters from the unreserved alphabet. */
export function generateCodeVerifier(length = 64): string {
  const size = Math.min(128, Math.max(43, length))
  const bytes = randomBytes(size)
  let out = ''
  for (const b of bytes) out += VERIFIER_ALPHABET[b % VERIFIER_ALPHABET.length]
  return out
}

/** RFC 7636 §4.2: BASE64URL(SHA256(ASCII(verifier))), unpadded. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncodeBytes(new Uint8Array(digest))
}

export function generateState(): string {
  return base64UrlEncodeBytes(randomBytes(24))
}

export function pickLoopbackPort(random: () => number = Math.random): number {
  return PORT_MIN + Math.floor(random() * (PORT_MAX - PORT_MIN + 1))
}

export function redirectUriFor(port: number): string {
  return `http://127.0.0.1:${port}/callback`
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export interface AuthUrlParams {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scopes?: readonly string[]
  loginHint?: string
}

export function buildAuthUrl(params: AuthUrlParams): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: (params.scopes ?? GOOGLE_SCOPES).join(' '),
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    state: params.state,
    access_type: 'offline',
    prompt: 'consent',
  })
  if (params.loginHint) q.set('login_hint', params.loginHint)
  return `${AUTH_ENDPOINT}?${q.toString()}`
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

const REAUTH_CODES = new Set(['invalid_grant', 'unauthorized_client', 'invalid_client'])

async function postToken(platform: Platform, form: URLSearchParams): Promise<TokenResponse> {
  const res = await platform.fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  let json: TokenResponse = {}
  try {
    json = (await res.json()) as TokenResponse
  } catch {
    json = {}
  }
  if (!res.ok || json.error) {
    const code = json.error ?? `http_${res.status}`
    // Only Google's own error code and description travel into the message;
    // the request body (which holds the code and secret) never does.
    throw new OAuthError(code, `Google rejected the token request: ${code}`, REAUTH_CODES.has(code))
  }
  if (!json.access_token) throw new OAuthError('no_access_token', 'Google returned no access token')
  return json
}

export interface ExchangeParams {
  clientId: string
  clientSecret: string
  code: string
  codeVerifier: string
  redirectUri: string
  now?: number
}

export async function exchangeCode(platform: Platform, p: ExchangeParams): Promise<OAuthTokens> {
  const json = await postToken(
    platform,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: p.code,
      code_verifier: p.codeVerifier,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
    }),
  )
  if (!json.refresh_token) {
    throw new OAuthError(
      'no_refresh_token',
      'Google returned no refresh token. Remove Wren from your Google account permissions and try again.',
      true,
    )
  }
  return {
    accessToken: json.access_token!,
    refreshToken: json.refresh_token,
    expiresAt: (p.now ?? Date.now()) + (json.expires_in ?? 3600) * 1000,
  }
}

export interface RefreshParams {
  clientId: string
  clientSecret: string
  refreshToken: string
  now?: number
}

export async function refreshAccessToken(platform: Platform, p: RefreshParams): Promise<OAuthTokens> {
  const json = await postToken(
    platform,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: p.refreshToken,
      client_id: p.clientId,
      client_secret: p.clientSecret,
    }),
  )
  return {
    accessToken: json.access_token!,
    // Google usually omits refresh_token on a refresh: keep the one we hold.
    refreshToken: json.refresh_token ?? p.refreshToken,
    expiresAt: (p.now ?? Date.now()) + (json.expires_in ?? 3600) * 1000,
  }
}

// ---------------------------------------------------------------------------
// Token storage (OS keychain via Platform secrets)
// ---------------------------------------------------------------------------

export function tokenKey(accountId: string): string {
  return `wren:account:${accountId}`
}

export class TokenStore {
  constructor(private readonly platform: Platform) {}

  async load(accountId: string): Promise<StoredAccountTokens | null> {
    const raw = await this.platform.secretGet(tokenKey(accountId))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as StoredAccountTokens
      return parsed && typeof parsed.refreshToken === 'string' ? parsed : null
    } catch {
      return null
    }
  }

  async save(accountId: string, tokens: StoredAccountTokens): Promise<void> {
    await this.platform.secretSet(tokenKey(accountId), JSON.stringify(tokens))
  }

  async clear(accountId: string): Promise<void> {
    await this.platform.secretDelete(tokenKey(accountId))
  }
}

// ---------------------------------------------------------------------------
// TokenManager — access-token lifecycle with single-flight refresh
// ---------------------------------------------------------------------------

export interface TokenManagerOptions {
  platform: Platform
  store: TokenStore
  accountId: string
  clientId: string
  clientSecret: string
  now?: () => number
}

/**
 * Owns one account's access token — the only thing that reads or writes it.
 *
 * The live token is held in memory: every Gmail request asks for it, and going
 * to the OS keychain per request costs an IPC round trip to answer a question
 * this object already knows the answer to. The keychain stays the durable
 * copy, read once on the first call and written on every refresh.
 *
 * Every 401 in the API client funnels into `forceRefresh`, and concurrent
 * callers share a single in-flight request so a burst of parallel batch calls
 * cannot spend the refresh token many times.
 */
export class TokenManager {
  private inFlight: Promise<string> | null = null
  /** The keychain's contents, once read. Null means "not read yet". */
  private cached: StoredAccountTokens | null = null
  private readonly now: () => number

  constructor(private readonly opts: TokenManagerOptions) {
    this.now = opts.now ?? Date.now
  }

  private isLive(tokens: StoredAccountTokens | null): tokens is StoredAccountTokens {
    return Boolean(
      tokens?.accessToken && tokens.expiresAt && tokens.expiresAt - this.now() > EXPIRY_MARGIN_MS,
    )
  }

  async getAccessToken(): Promise<string> {
    if (this.isLive(this.cached)) return this.cached.accessToken as string
    const stored = await this.load()
    if (this.isLive(stored)) return stored.accessToken as string
    return this.forceRefresh()
  }

  forceRefresh(): Promise<string> {
    if (this.inFlight) return this.inFlight
    const run = this.doRefresh().finally(() => {
      this.inFlight = null
    })
    this.inFlight = run
    return run
  }

  private async load(): Promise<StoredAccountTokens> {
    const stored = await this.opts.store.load(this.opts.accountId)
    if (!stored) {
      this.cached = null
      throw new OAuthError('no_account', 'This account is not signed in', true)
    }
    this.cached = stored
    return stored
  }

  private async doRefresh(): Promise<string> {
    const stored = this.cached ?? (await this.load())
    const tokens = await refreshAccessToken(this.opts.platform, {
      clientId: this.opts.clientId,
      clientSecret: this.opts.clientSecret,
      refreshToken: stored.refreshToken,
      now: this.now(),
    })
    const next: StoredAccountTokens = {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      clientId: this.opts.clientId,
    }
    this.cached = next
    await this.opts.store.save(this.opts.accountId, next)
    return tokens.accessToken
  }
}

// ---------------------------------------------------------------------------
// Full interactive flow
// ---------------------------------------------------------------------------

export interface AuthFlowResult {
  email: string
  historyId?: string
  tokens: OAuthTokens
}

function parseCallback(path: string): URLSearchParams {
  const q = path.indexOf('?')
  return new URLSearchParams(q === -1 ? '' : path.slice(q + 1))
}

/**
 * Loopback listener first, browser second: the listener must already be bound
 * when Google redirects, or the callback lands on a closed port.
 */
export async function runAuthFlow(
  platform: Platform,
  clientId: string,
  clientSecret: string,
  opts: { random?: () => number; now?: number } = {},
): Promise<AuthFlowResult> {
  const port = pickLoopbackPort(opts.random)
  const redirectUri = redirectUriFor(port)
  const verifier = generateCodeVerifier()
  const challenge = await deriveCodeChallenge(verifier)
  const state = generateState()

  const callback = platform.oauthListen(port)
  // Swallow nothing, but do not leave an unhandled rejection if openExternal
  // throws before we await the listener.
  callback.catch(() => undefined)

  await platform.openExternal(buildAuthUrl({ clientId, redirectUri, state, codeChallenge: challenge }))

  const params = parseCallback(await callback)
  const error = params.get('error')
  if (error) throw new OAuthError(error, `Google returned "${error}" from the consent screen`)
  if (params.get('state') !== state) {
    throw new OAuthError('state_mismatch', 'The sign-in response did not match this request')
  }
  const code = params.get('code')
  if (!code) throw new OAuthError('no_code', 'The sign-in response carried no authorization code')

  const tokens = await exchangeCode(platform, {
    clientId,
    clientSecret,
    code,
    codeVerifier: verifier,
    redirectUri,
    now: opts.now,
  })

  const res = await platform.fetch(GMAIL_PROFILE_ENDPOINT, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  })
  if (!res.ok) throw new OAuthError('profile_failed', 'Signed in, but Gmail refused the profile request')
  const profile = (await res.json()) as { emailAddress?: string; historyId?: string }
  if (!profile.emailAddress) throw new OAuthError('profile_failed', 'Gmail returned no address for this account')

  return { email: profile.emailAddress, historyId: profile.historyId, tokens }
}
