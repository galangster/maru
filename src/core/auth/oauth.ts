// Google OAuth 2.0 for an installed app: loopback redirect + PKCE (S256).
//
// Desktop clients are public clients. A client_secret is optional, and PKCE is
// what protects the exchange.
//
// Nothing in this file logs a token, a code, or a secret.

import type { Platform } from '../platform'
import type { PlatformFamily } from '../service/vault-port'
import { base64UrlEncodeBytes } from '../mime'
import type { OAuthClientSource } from './client-config'
import { iosCallbackScheme } from '@/lib/ios-oauth'

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GMAIL_PROFILE_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'

export const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify'
export const GOOGLE_SCOPES = [GMAIL_MODIFY_SCOPE] as const

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

/**
 * True for an OAuthClientError however it arrives — the `clientFailure`
 * discriminant survives serialization boundaries that `instanceof` does not.
 */
export function isClientFailure(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'clientFailure' in err && err.clientFailure === true
  )
}

export class OAuthClientError extends OAuthError {
  readonly clientFailure = true

  constructor(code: string) {
    super(
      code,
      `Google rejected this account's OAuth client (${code}). Check the OAuth client in Settings.`,
    )
    this.name = 'OAuthClientError'
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
  source: OAuthClientSource
  /** When this refresh token was issued. The account vault uses it to merge. */
  issuedAt?: number
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

export function iosRedirectUri(clientId: string): string {
  return `${iosCallbackScheme(clientId)}:/oauth2redirect`
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
    // Two prompts, space-separated, and the order is Google's not ours.
    //
    // `consent` alone re-asks for the scopes but not for the *identity*: with
    // one Google session live in the system browser, Google resolves the
    // account silently and every Add account lands on whichever address was
    // signed in — which is the wrong answer for an app whose whole premise is
    // several mailboxes at once. `select_account` is what forces the picker,
    // so a second, third and fourth account can be added at all.
    //
    // `consent` stays alongside it: it is what guarantees a refresh token comes
    // back, and Google only issues one on a consent grant. Dropping it to get a
    // cleaner second run would give an account that cannot be refreshed.
    prompt: 'select_account consent',
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
  scope?: string
  error?: string
  error_description?: string
}

const CLIENT_FAILURE_CODES = new Set(['invalid_client', 'deleted_client', 'unauthorized_client'])

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
    if (CLIENT_FAILURE_CODES.has(code)) throw new OAuthClientError(code)
    // Only Google's own error code and description travel into the message;
    // the request body (which holds the code and secret) never does.
    throw new OAuthError(code, `Google rejected the token request: ${code}`, code === 'invalid_grant')
  }
  if (!json.access_token) throw new OAuthError('no_access_token', 'Google returned no access token')
  return json
}

export interface ExchangeParams {
  clientId: string
  clientSecret?: string
  code: string
  codeVerifier: string
  redirectUri: string
  now?: number
}

export async function exchangeCode(platform: Platform, p: ExchangeParams): Promise<OAuthTokens> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: p.code,
    code_verifier: p.codeVerifier,
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
  })
  if (p.clientSecret) form.set('client_secret', p.clientSecret)
  const json = await postToken(platform, form)
  if (!json.refresh_token) {
    throw new OAuthError(
      'no_refresh_token',
      'Google returned no refresh token. Remove Maru from your Google account permissions and try again.',
      true,
    )
  }
  const grantedScopes = new Set(json.scope?.split(/\s+/).filter(Boolean) ?? [])
  const missing = GOOGLE_SCOPES.filter((scope) => !grantedScopes.has(scope))
  if (missing.length > 0) {
    throw new OAuthError(
      'missing_scope',
      'Google did not grant Gmail access. Approve it on the consent screen, then add the account again.',
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
  clientSecret?: string
  refreshToken: string
  now?: number
}

export async function refreshAccessToken(platform: Platform, p: RefreshParams): Promise<OAuthTokens> {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: p.refreshToken,
    client_id: p.clientId,
  })
  if (p.clientSecret) form.set('client_secret', p.clientSecret)
  const json = await postToken(platform, form)
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
      const parsed = JSON.parse(raw) as Partial<StoredAccountTokens>
      if (
        !parsed ||
        typeof parsed.refreshToken !== 'string' ||
        typeof parsed.clientId !== 'string'
      ) {
        return null
      }
      // Known fields only — unknown keys from old records must not ride along
      // and re-persist forever on the next save.
      return {
        refreshToken: parsed.refreshToken,
        accessToken: parsed.accessToken,
        expiresAt: parsed.expiresAt,
        clientId: parsed.clientId,
        // Records written before client provenance existed were all BYO.
        source: parsed.source === 'official' ? 'official' : 'custom',
        issuedAt: typeof parsed.issuedAt === 'number' ? parsed.issuedAt : undefined,
      }
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
  clientId?: string
  clientSecret?: string
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
      clientId: stored.clientId,
      clientSecret: this.opts.clientId === stored.clientId ? this.opts.clientSecret : undefined,
      refreshToken: stored.refreshToken,
      now: this.now(),
    })
    const next: StoredAccountTokens = {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      clientId: stored.clientId,
      source: stored.source,
      issuedAt: stored.issuedAt,
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

export function parseOAuthCallback(callbackUrl: string): URLSearchParams {
  const q = callbackUrl.indexOf('?')
  return new URLSearchParams(q === -1 ? '' : callbackUrl.slice(q + 1))
}

function authSessionFailure(error: unknown): OAuthError {
  const record = typeof error === 'object' && error !== null
    ? error as { code?: unknown; message?: unknown }
    : null
  return record?.code === 'cancelled'
    ? new OAuthError('cancelled', 'Sign-in cancelled')
    : new OAuthError('auth_session_failed', 'Sign-in failed')
}

interface AuthFlowStrategy {
  redirectUri: string
  clientSecret: string | undefined
  awaitCallback(authUrl: string): Promise<string>
}

export function loopbackStrategy(
  platform: Platform,
  random: () => number = Math.random,
  clientSecret?: string,
): AuthFlowStrategy {
  const port = pickLoopbackPort(random)
  return {
    redirectUri: redirectUriFor(port),
    clientSecret,
    async awaitCallback(authUrl) {
      const callback = platform.oauthListen(port)
      callback.catch(() => undefined)
      await platform.openExternal(authUrl)
      return callback
    },
  }
}

export function authSessionStrategy(platform: Platform, clientId: string): AuthFlowStrategy {
  const callbackScheme = iosCallbackScheme(clientId)
  return {
    redirectUri: iosRedirectUri(clientId),
    clientSecret: undefined,
    async awaitCallback(authUrl) {
      if (!platform.authSession) throw new OAuthError('auth_session_failed', 'Sign-in failed')
      try {
        return await platform.authSession(authUrl, callbackScheme)
      } catch (error) {
        throw authSessionFailure(error)
      }
    },
  }
}

function authFlowStrategy(
  family: PlatformFamily,
  platform: Platform,
  clientId: string,
  clientSecret: string | undefined,
  random: (() => number) | undefined,
): AuthFlowStrategy {
  return family === 'ios'
    ? authSessionStrategy(platform, clientId)
    : loopbackStrategy(platform, random, clientSecret)
}

/**
 * Loopback listener first, browser second: the listener must already be bound
 * when Google redirects, or the callback lands on a closed port.
 */
export async function runAuthFlow(
  platform: Platform,
  clientId: string,
  clientSecret: string | undefined,
  opts: {
    random?: () => number
    now?: number
    /**
     * Which address this flow is FOR — passed to Google as `login_hint`, and
     * then asserted against the account that actually came back.
     *
     * Two different jobs, and the second is the one that matters. As a hint it
     * pre-selects the right row in the account picker, which is most of the
     * felt friction when re-connecting a known account or restoring a machine.
     * As an assertion it closes a real hole: `prompt: 'select_account'` puts a
     * human in front of a picker, and a person restoring four accounts in a
     * row can pick the wrong one. Without this check Maru would store the
     * wrong mailbox's tokens under the intended account's id and sync someone
     * else's mail into that row.
     *
     * A hint is only ever a hint — Google is free to ignore it, and the user
     * is free to pick another account. That is exactly why the answer is
     * verified rather than assumed.
    */
    expectEmail?: string
    family: PlatformFamily
  },
): Promise<AuthFlowResult> {
  const strategy = authFlowStrategy(opts.family, platform, clientId, clientSecret, opts.random)
  const verifier = generateCodeVerifier()
  const challenge = await deriveCodeChallenge(verifier)
  const state = generateState()

  const authUrl = buildAuthUrl({
    clientId,
    redirectUri: strategy.redirectUri,
    state,
    codeChallenge: challenge,
    loginHint: opts.expectEmail,
  })
  const callbackUrl = await strategy.awaitCallback(authUrl)

  const params = parseOAuthCallback(callbackUrl)
  const error = params.get('error')
  if (error) {
    if (CLIENT_FAILURE_CODES.has(error)) throw new OAuthClientError(error)
    throw new OAuthError(error, `Google returned "${error}" from the consent screen`)
  }
  if (params.get('state') !== state) {
    throw new OAuthError('state_mismatch', 'The sign-in response did not match this request')
  }
  const code = params.get('code')
  if (!code) throw new OAuthError('no_code', 'The sign-in response carried no authorization code')

  const tokens = await exchangeCode(platform, {
    clientId,
    clientSecret: strategy.clientSecret,
    code,
    codeVerifier: verifier,
    redirectUri: strategy.redirectUri,
    now: opts.now,
  })

  const res = await platform.fetch(GMAIL_PROFILE_ENDPOINT, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  })
  if (!res.ok) throw new OAuthError('profile_failed', 'Signed in, but Gmail refused the profile request')
  const profile = (await res.json()) as { emailAddress?: string; historyId?: string }
  if (!profile.emailAddress) throw new OAuthError('profile_failed', 'Gmail returned no address for this account')

  // The assertion. A caller that named an address gets that address or an
  // error — never a different mailbox's tokens filed under it. `login_hint` is
  // advisory, `select_account` shows a picker, and a person reconnecting four
  // accounts in a row can pick the wrong row; discarding the grant is the only
  // safe answer, because the alternative is silently syncing the wrong mail
  // into that account and there is no later signal that it happened.
  //
  // Compared case-insensitively on the whole address: Gmail normalises the
  // local part in ways this code should not try to model, so anything beyond
  // a case fold would be guessing at Google's rules.
  if (
    opts.expectEmail &&
    profile.emailAddress.toLowerCase() !== opts.expectEmail.toLowerCase()
  ) {
    throw new OAuthError(
      'wrong_account',
      `Signed in as ${profile.emailAddress}, but this was for ${opts.expectEmail}. Nothing was saved — try again and pick ${opts.expectEmail}.`,
    )
  }

  return { email: profile.emailAddress, historyId: profile.historyId, tokens }
}
