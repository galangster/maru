// The one place an error becomes a SyncStatus.
//
// There were two, and they disagreed: the engine typed needsReauth and
// clientFailure, RealMailService.start() emitted neither. Whichever fired
// first decided what the UI said, so the same dead grant could render as
// "Sign in again" or as a network blip it was retrying forever.

import { describe, expect, it } from 'vitest'

import { OAuthError, OAuthClientError } from '@/core/auth/oauth'
import { MissingOAuthClientError } from '@/core/service/real'
import { hasStopped, syncFailure, syncKind } from '@/core/sync/failure'

describe('syncFailure', () => {
  it('types a missing token record as local, not as Google signing you out', () => {
    // TokenManager.load() throws exactly this when the keychain has no record.
    // needsReauth stays true — same remedy — but noCredentials is what stops
    // the UI printing "Signed out by Google", which is false: Google did
    // nothing. This is the dev-build case, and the new-Mac case.
    const s = syncFailure('a', new OAuthError('no_account', 'This account is not signed in', true))
    expect(s.needsReauth).toBe(true)
    expect(s.noCredentials).toBe(true)
    expect(s.clientFailure).toBe(false)
  })

  it('does not mark a real dead grant as a local credential problem', () => {
    const s = syncFailure('a', new OAuthError('invalid_grant', 'Token has been revoked', true))
    expect(s.needsReauth).toBe(true)
    expect(s.noCredentials).toBe(false)
  })

  it('types a rejected OAuth client as a client failure', () => {
    const s = syncFailure('a', new OAuthClientError('unauthorized_client'))
    expect(s.clientFailure).toBe(true)
  })

  it('types an unconfigured OAuth client as a client failure too', () => {
    // Without the discriminant this landed untyped, and the footer told people
    // it was retrying a state no retry can reach. Its remedy is Settings →
    // Google, which is exactly where clientFailure routes.
    const s = syncFailure('a', new MissingOAuthClientError())
    expect(s.clientFailure).toBe(true)
    // ...but Google never saw it, so it must not share the "Google rejected
    // your client" sentence. Same remedy, different diagnosis — the exact
    // split noCredentials makes for a dead grant.
    expect(s.noClientConfigured).toBe(true)
    expect(syncKind(s)).toBe('noClient')
  })

  it('keeps a genuine rejection distinct from an unconfigured client', () => {
    expect(syncKind(syncFailure('a', new OAuthClientError('unauthorized_client')))).toBe('rejected')
  })

  it('classifies every failure kind exactly once', () => {
    expect(syncKind(undefined)).toBe('idle')
    expect(syncKind({ accountId: 'a', state: 'idle' })).toBe('idle')
    expect(syncKind({ accountId: 'a', state: 'syncing' })).toBe('syncing')
    expect(syncKind({ accountId: 'a', state: 'error' })).toBe('stalled')
    // needsReauth stays true under noCredentials on purpose; the more specific
    // diagnosis has to win or the row prints "signed out by Google" for a
    // machine that simply never held a token.
    expect(
      syncKind({ accountId: 'a', state: 'error', needsReauth: true, noCredentials: true }),
    ).toBe('noCredentials')
  })

  it('only the four stopped kinds may raise an alarm', () => {
    // The line that decides who gets colour and who interrupts the list.
    expect(hasStopped('stalled')).toBe(false)
    expect(hasStopped('idle')).toBe(false)
    expect(hasStopped('syncing')).toBe(false)
    for (const k of ['rejected', 'noClient', 'noCredentials', 'signedOut'] as const) {
      expect(hasStopped(k)).toBe(true)
    }
  })

  it('leaves an ordinary failure untyped so it reads as transient', () => {
    const s = syncFailure('a', new Error('network timeout'))
    expect(s.state).toBe('error')
    expect(s.error).toBe('network timeout')
    expect(s.needsReauth).toBe(false)
    expect(s.clientFailure).toBe(false)
    expect(s.noCredentials).toBe(false)
  })

  it('survives a thrown non-Error', () => {
    expect(syncFailure('a', 'boom').error).toBe('boom')
  })
})
