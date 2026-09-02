import { describe, it, expect } from 'vitest'
import { GMAIL_MODIFY_SCOPE,
  GOOGLE_SCOPES,
  TOKEN_ENDPOINT,
  buildAuthUrl,
  deriveCodeChallenge,
  exchangeCode,
  generateCodeVerifier,
  generateState,
  iosRedirectUri,
  pickLoopbackPort,
  parseOAuthCallback,
  redirectUriFor,
  refreshAccessToken,
  runAuthFlow,
  TokenStore,
  TokenManager,
  OAuthError,
  OAuthClientError,
} from '../src/core/auth/oauth'
import { NodePlatform, jsonResponse, errorResponse } from './helpers/node-platform'

const CLIENT_ID = '1234-abc.apps.googleusercontent.com'
const CLIENT_SECRET = 'GOCSPX-testsecret'

describe('PKCE', () => {
  it('generates a verifier inside the RFC 7636 length and alphabet', () => {
    for (let i = 0; i < 20; i++) {
      const v = generateCodeVerifier()
      expect(v.length).toBeGreaterThanOrEqual(43)
      expect(v.length).toBeLessThanOrEqual(128)
      expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/)
    }
  })

  it('generates a different verifier every call', () => {
    const seen = new Set(Array.from({ length: 25 }, () => generateCodeVerifier()))
    expect(seen.size).toBe(25)
  })

  it('derives the S256 challenge as unpadded base64url of the SHA-256 digest', async () => {
    // RFC 7636 Appendix B worked example.
    const challenge = await deriveCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('produces a 43-character challenge with no padding', async () => {
    const challenge = await deriveCodeChallenge(generateCodeVerifier())
    expect(challenge).toHaveLength(43)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('buildAuthUrl', () => {
  const url = () =>
    new URL(
      buildAuthUrl({
        clientId: CLIENT_ID,
        redirectUri: 'http://127.0.0.1:50001/callback',
        state: 'st-123',
        codeChallenge: 'chal-abc',
      }),
    )

  it('targets Google and carries the PKCE parameters', () => {
    const u = url()
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:50001/callback')
    expect(u.searchParams.get('code_challenge')).toBe('chal-abc')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('state')).toBe('st-123')
  })

  it('asks for offline access so a refresh token comes back', () => {
    const u = url()
    expect(u.searchParams.get('access_type')).toBe('offline')
    // `consent` is the half that guarantees the refresh token.
    expect(u.searchParams.get('prompt')?.split(' ')).toContain('consent')
  })

  it('forces the account picker, so a second mailbox can be added at all', () => {
    // Without `select_account`, Google resolves a live browser session
    // silently and every Add account lands on the address already signed in.
    const prompt = url().searchParams.get('prompt')?.split(' ') ?? []
    expect(prompt).toContain('select_account')
    expect(prompt).toContain('consent')
  })

  it('requests only gmail.modify', () => {
    expect(GOOGLE_SCOPES).toEqual(['https://www.googleapis.com/auth/gmail.modify'])
    expect(url().searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' '))
  })
})

describe('loopback port', () => {
  it('stays inside 49500-65000', () => {
    for (let i = 0; i < 200; i++) {
      const port = pickLoopbackPort()
      expect(port).toBeGreaterThanOrEqual(49500)
      expect(port).toBeLessThanOrEqual(65000)
    }
  })

  it('builds a 127.0.0.1 loopback redirect uri', () => {
    expect(redirectUriFor(50123)).toBe('http://127.0.0.1:50123/callback')
  })

  it('builds the reversed-client custom redirect uri on iOS', () => {
    expect(iosRedirectUri(CLIENT_ID)).toBe(
      'com.googleusercontent.apps.1234-abc:/oauth2redirect',
    )
  })
})

describe('OAuth callback parsing', () => {
  it('reads code and state from loopback and iOS callbacks', () => {
    const callback = parseOAuthCallback('/callback?code=desktop-code&state=desktop-state')
    expect(callback.get('code')).toBe('desktop-code')
    expect(callback.get('state')).toBe('desktop-state')

    const iosCallback = parseOAuthCallback(
      'com.googleusercontent.apps.1234-abc:/oauth2redirect?code=ios-code&state=ios-state',
    )
    expect(iosCallback.get('code')).toBe('ios-code')
    expect(iosCallback.get('state')).toBe('ios-state')
  })
})

describe('exchangeCode', () => {
  it('posts a form-encoded body with the verifier and the desktop client secret', async () => {
    const p = new NodePlatform()
    p.handler = () =>
      jsonResponse({
        access_token: 'at-1',
        refresh_token: 'rt-1',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: GMAIL_MODIFY_SCOPE,
      })

    const now = 1_700_000_000_000
    const tokens = await exchangeCode(p, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      code: 'auth-code-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:50001/callback',
      now,
    })

    expect(tokens).toEqual({ accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: now + 3599 * 1000 })

    const req = p.requests[0]
    expect(req.url).toBe(TOKEN_ENDPOINT)
    expect(req.method).toBe('POST')
    expect(req.headers['content-type']).toBe('application/x-www-form-urlencoded')
    const form = new URLSearchParams(req.body)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('auth-code-1')
    expect(form.get('code_verifier')).toBe('verifier-1')
    expect(form.get('client_id')).toBe(CLIENT_ID)
    expect(form.get('client_secret')).toBe(CLIENT_SECRET)
    expect(form.get('redirect_uri')).toBe('http://127.0.0.1:50001/callback')
  })

  it('omits an empty desktop client secret', async () => {
    const p = new NodePlatform()
    p.handler = () =>
      jsonResponse({
        access_token: 'at-1',
        refresh_token: 'rt-1',
        scope: GMAIL_MODIFY_SCOPE,
      })

    await exchangeCode(p, {
      clientId: CLIENT_ID,
      clientSecret: '',
      code: 'auth-code-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:50001/callback',
    })

    expect(new URLSearchParams(p.requests[0].body).has('client_secret')).toBe(false)
  })

  it('refuses a partial grant without gmail.modify', async () => {
    const p = new NodePlatform()
    p.handler = () =>
      jsonResponse({ access_token: 'at-1', refresh_token: 'rt-1', scope: 'openid email' })

    await expect(
      exchangeCode(p, {
        clientId: CLIENT_ID,
        code: 'auth-code-1',
        codeVerifier: 'verifier-1',
        redirectUri: 'http://127.0.0.1:50001/callback',
      }),
    ).rejects.toMatchObject({
      code: 'missing_scope',
      message: expect.stringContaining('Gmail access'),
    })
  })

  it('raises a typed OAuthError carrying Google error text', async () => {
    const p = new NodePlatform()
    p.handler = () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad code' }), { status: 400 })

    await expect(
      exchangeCode(p, {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        code: 'bad',
        codeVerifier: 'v',
        redirectUri: 'http://127.0.0.1:1/callback',
      }),
    ).rejects.toMatchObject({ name: 'OAuthError', code: 'invalid_grant' })
  })
})

describe('refreshAccessToken', () => {
  it('sends the refresh grant and keeps the existing refresh token when none is returned', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ access_token: 'at-2', expires_in: 3600 })

    const now = 1_700_000_000_000
    const tokens = await refreshAccessToken(p, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: 'rt-1',
      now,
    })

    expect(tokens).toEqual({ accessToken: 'at-2', refreshToken: 'rt-1', expiresAt: now + 3600 * 1000 })
    const form = new URLSearchParams(p.requests[0].body)
    expect(form.get('grant_type')).toBe('refresh_token')
    expect(form.get('refresh_token')).toBe('rt-1')
  })

  it('omits an empty desktop client secret from refresh', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ access_token: 'at-2', expires_in: 3600 })

    await refreshAccessToken(p, {
      clientId: CLIENT_ID,
      clientSecret: '',
      refreshToken: 'rt-1',
    })

    expect(new URLSearchParams(p.requests[0].body).has('client_secret')).toBe(false)
  })

  it('types project and client failures separately from account revocation', async () => {
    const p = new NodePlatform()
    p.handler = () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 })

    const error = await refreshAccessToken(p, {
      clientId: CLIENT_ID,
      refreshToken: 'rt-1',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(OAuthClientError)
    expect(error).toMatchObject({ code: 'invalid_client', needsReauth: false, clientFailure: true })
  })
})

describe('TokenStore', () => {
  it('round-trips a record under the wren:account key', async () => {
    const p = new NodePlatform()
    const store = new TokenStore(p)
    await store.save('acct-1', {
      refreshToken: 'rt-1',
      accessToken: 'at-1',
      expiresAt: 42,
      clientId: CLIENT_ID,
      source: 'custom',
    })
    expect([...p.secrets.keys()]).toEqual(['wren:account:acct-1'])
    expect(await store.load('acct-1')).toEqual({
      refreshToken: 'rt-1',
      accessToken: 'at-1',
      expiresAt: 42,
      clientId: CLIENT_ID,
      source: 'custom',
    })
    await store.clear('acct-1')
    expect(await store.load('acct-1')).toBeNull()
  })

  it('returns null rather than throwing on a corrupt record', async () => {
    const p = new NodePlatform()
    p.secrets.set('wren:account:acct-1', 'not json')
    expect(await new TokenStore(p).load('acct-1')).toBeNull()
  })

  it('migrates a stored client id to a custom issuing source', async () => {
    const p = new NodePlatform()
    p.secrets.set(
      'wren:account:acct-1',
      JSON.stringify({ refreshToken: 'rt-1', clientId: CLIENT_ID }),
    )

    expect(await new TokenStore(p).load('acct-1')).toEqual({
      refreshToken: 'rt-1',
      clientId: CLIENT_ID,
      source: 'custom',
    })
  })
})

describe('TokenManager', () => {
  function manager(p: NodePlatform, expiresAt: number, now = () => 1_000_000) {
    const store = new TokenStore(p)
    p.secrets.set(
      'wren:account:acct-1',
      JSON.stringify({ refreshToken: 'rt-1', accessToken: 'at-old', expiresAt, clientId: CLIENT_ID }),
    )
    return new TokenManager({
      platform: p,
      store,
      accountId: 'acct-1',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      now,
    })
  }

  it('reuses a live access token without a network call', async () => {
    const p = new NodePlatform()
    const m = manager(p, 1_000_000 + 10 * 60_000)
    expect(await m.getAccessToken()).toBe('at-old')
    expect(p.requests).toHaveLength(0)
  })

  it('refreshes an access token that is inside the expiry margin', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ access_token: 'at-new', expires_in: 3600 })
    const m = manager(p, 1_000_000 + 5_000)
    expect(await m.getAccessToken()).toBe('at-new')
    expect(p.requests).toHaveLength(1)
  })

  it('single-flights concurrent refreshes into one token request', async () => {
    const p = new NodePlatform()
    let calls = 0
    p.handler = async () => {
      calls++
      await new Promise((r) => setTimeout(r, 5))
      return jsonResponse({ access_token: `at-${calls}`, expires_in: 3600 })
    }
    const m = manager(p, 0)

    const results = await Promise.all([m.forceRefresh(), m.forceRefresh(), m.forceRefresh()])
    expect(calls).toBe(1)
    expect(results).toEqual(['at-1', 'at-1', 'at-1'])
  })

  it('persists the refreshed token so the next session skips the round trip', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ access_token: 'at-new', expires_in: 3600 })
    const m = manager(p, 0)
    await m.forceRefresh()
    const saved = JSON.parse(p.secrets.get('wren:account:acct-1')!)
    expect(saved.accessToken).toBe('at-new')
    expect(saved.refreshToken).toBe('rt-1')
  })

  it('reports a revoked refresh token as a typed reauth error', async () => {
    const p = new NodePlatform()
    p.handler = () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    const m = manager(p, 0)
    await expect(m.forceRefresh()).rejects.toMatchObject({ name: 'OAuthError', needsReauth: true })
  })

  it('refreshes with the stored issuing client after settings change', async () => {
    const p = new NodePlatform()
    p.handler = () => jsonResponse({ access_token: 'at-new', expires_in: 3600 })
    p.secrets.set(
      'wren:account:acct-1',
      JSON.stringify({
        refreshToken: 'rt-1',
        accessToken: 'at-old',
        expiresAt: 0,
        clientId: 'issuing-client',
        source: 'custom',
      }),
    )
    const m = new TokenManager({
      platform: p,
      store: new TokenStore(p),
      accountId: 'acct-1',
      clientId: 'new-settings-client',
      clientSecret: 'new-settings-secret',
    })

    await m.forceRefresh()

    const form = new URLSearchParams(p.requests[0].body)
    expect(form.get('client_id')).toBe('issuing-client')
    expect(form.has('client_secret')).toBe(false)
    expect(JSON.parse(p.secrets.get('wren:account:acct-1')!)).toMatchObject({
      clientId: 'issuing-client',
      source: 'custom',
    })
  })
})

describe('runAuthFlow', () => {
  function goodHandler(p: NodePlatform) {
    p.handler = (req) => {
      if (req.url === TOKEN_ENDPOINT) {
        return jsonResponse({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          expires_in: 3600,
          scope: GMAIL_MODIFY_SCOPE,
        })
      }
      if (req.url.includes('/gmail/v1/users/me/profile')) {
        return jsonResponse({ emailAddress: 'nick@gmail.com', historyId: '5150' })
      }
      return errorResponse(404, `unexpected ${req.url}`)
    }
  }

  it('starts the loopback listener before opening the browser', async () => {
    const p = new NodePlatform()
    goodHandler(p)
    let authUrl = ''
    p.oauthResponder = async () => {
      authUrl = p.opened[0] ?? ''
      const state = new URL(authUrl).searchParams.get('state')
      return `/callback?code=auth-1&state=${state}`
    }

    const result = await runAuthFlow(p, CLIENT_ID, CLIENT_SECRET, { family: 'desktop' })

    expect(p.calls.indexOf('oauthListen')).toBeLessThan(p.calls.indexOf('openExternal'))
    expect(result.email).toBe('nick@gmail.com')
    expect(result.tokens.refreshToken).toBe('rt-1')
    expect(result.historyId).toBe('5150')
    expect(authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true)
  })

  it('uses the native iOS session with a custom redirect and no client secret', async () => {
    const p = new NodePlatform()
    goodHandler(p)
    let callbackScheme = ''
    let authUrl = ''
    p.authResponder = async (url, scheme) => {
      authUrl = url
      callbackScheme = scheme
      const state = new URL(url).searchParams.get('state')
      return `${scheme}:/oauth2redirect?code=auth-ios&state=${state}`
    }

    await runAuthFlow(p, CLIENT_ID, CLIENT_SECRET, { family: 'ios' })

    expect(p.calls).toContain('authSession')
    expect(p.calls).not.toContain('oauthListen')
    expect(p.calls).not.toContain('openExternal')
    expect(callbackScheme).toBe('com.googleusercontent.apps.1234-abc')
    expect(new URL(authUrl).searchParams.get('redirect_uri')).toBe(
      'com.googleusercontent.apps.1234-abc:/oauth2redirect',
    )
    expect(new URLSearchParams(p.requests[0].body).has('client_secret')).toBe(false)
  })

  it('maps a dismissed iOS auth sheet to a stable cancellation error', async () => {
    const p = new NodePlatform()
    p.authResponder = async () => { throw { code: 'cancelled', message: 'cancelled' } }
    await expect(runAuthFlow(p, CLIENT_ID, undefined, { family: 'ios' })).rejects.toMatchObject({
      code: 'cancelled',
      message: 'Sign-in cancelled',
    })

    p.authResponder = async () => { throw { code: 'failed', message: 'request cancelled upstream' } }
    await expect(runAuthFlow(p, CLIENT_ID, undefined, { family: 'ios' })).rejects.toMatchObject({
      code: 'auth_session_failed',
      message: 'Sign-in failed',
    })
  })

  // `login_hint` was declared in AuthUrlParams and written into the authorize
  // URL, and no caller ever passed it — finished plumbing with no consumer.
  // Threading it through is the cheap half; the assertion below is the half
  // that matters.
  describe('expectEmail', () => {
    async function run(expectEmail: string | undefined, returns: string) {
      const p = new NodePlatform()
      p.handler = (req) => {
        if (req.url === TOKEN_ENDPOINT) {
          return jsonResponse({
            access_token: 'at-1',
            refresh_token: 'rt-1',
            expires_in: 3600,
            scope: GMAIL_MODIFY_SCOPE,
          })
        }
        if (req.url.includes('/gmail/v1/users/me/profile')) {
          return jsonResponse({ emailAddress: returns, historyId: '5150' })
        }
        return errorResponse(404, `unexpected ${req.url}`)
      }
      let authUrl = ''
      p.oauthResponder = async () => {
        authUrl = p.opened[0] ?? ''
        const state = new URL(authUrl).searchParams.get('state')
        return `/callback?code=auth-1&state=${state}`
      }
      const promise = runAuthFlow(p, CLIENT_ID, CLIENT_SECRET, { expectEmail, family: 'desktop' })
      return { promise, url: () => authUrl }
    }

    it('passes the address to Google as login_hint', async () => {
      const { promise, url } = await run('nick@metadao.fi', 'nick@metadao.fi')
      await promise
      expect(new URL(url()).searchParams.get('login_hint')).toBe('nick@metadao.fi')
    })

    it('sends no login_hint for an open Add account', async () => {
      const { promise, url } = await run(undefined, 'nick@gmail.com')
      await promise
      expect(new URL(url()).searchParams.has('login_hint')).toBe(false)
    })

    it('DISCARDS a grant for the wrong account', async () => {
      // The hole this closes: `prompt: select_account` puts a human in front
      // of a picker, and someone reconnecting four accounts in a row can pick
      // the wrong one. Without this the caller would store that mailbox's
      // tokens under the intended account's id and sync the wrong mail into
      // the row — with no later signal that it happened.
      const { promise } = await run('nick@metadao.fi', 'someone.else@gmail.com')
      const err = await promise.catch((e: Error) => e)
      expect(err).toBeInstanceOf(OAuthError)
      expect((err as OAuthError).code).toBe('wrong_account')
      // The message has to name both, or the person cannot tell what went
      // wrong from a toast.
      expect((err as Error).message).toContain('someone.else@gmail.com')
      expect((err as Error).message).toContain('nick@metadao.fi')
    })

    it('accepts the right account whatever its case', async () => {
      // Google echoes the address in its own casing. A case-sensitive compare
      // would reject a correct sign-in, which is worse than not checking.
      const { promise } = await run('Nick@MetaDAO.fi', 'nick@metadao.fi')
      await expect(promise).resolves.toMatchObject({ email: 'nick@metadao.fi' })
    })
  })

  it('rejects a callback whose state does not match', async () => {
    const p = new NodePlatform()
    goodHandler(p)
    p.oauthResponder = async () => '/callback?code=auth-1&state=tampered'
    await expect(runAuthFlow(p, CLIENT_ID, CLIENT_SECRET, { family: 'desktop' })).rejects.toBeInstanceOf(OAuthError)
  })

  it('surfaces a denied consent screen', async () => {
    const p = new NodePlatform()
    goodHandler(p)
    p.oauthResponder = async () => {
      const state = new URL(p.opened[0]).searchParams.get('state')
      return `/callback?error=access_denied&state=${state}`
    }
    await expect(runAuthFlow(p, CLIENT_ID, CLIENT_SECRET, { family: 'desktop' })).rejects.toMatchObject({ code: 'access_denied' })
  })

  it('never puts a token in an error message', async () => {
    const p = new NodePlatform()
    p.handler = () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    p.oauthResponder = async () => {
      const state = new URL(p.opened[0]).searchParams.get('state')
      return `/callback?code=auth-secret-code&state=${state}`
    }
    const err = await runAuthFlow(p, CLIENT_ID, CLIENT_SECRET, { family: 'desktop' }).catch((e: Error) => e)
    expect(String(err)).not.toContain('auth-secret-code')
    expect(String(err)).not.toContain(CLIENT_SECRET)
  })
})
