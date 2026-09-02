import { describe, expect, it } from 'vitest'

import { resolveOAuthClient } from '../src/core/auth/client-config'

const settings = {
  googleClientId: 'custom-client',
  googleClientSecret: 'custom-secret',
}

describe('resolveOAuthClient', () => {
  it('keeps an account bound to its stored issuing client', () => {
    expect(
      resolveOAuthClient({
        issuingClient: { source: 'official', clientId: 'issuing-client' },
        settings,
        officialClientId: 'current-official-client',
      }),
    ).toEqual({ source: 'official', clientId: 'issuing-client' })
  })

  it('prefers the user override for a new account', () => {
    expect(resolveOAuthClient({ settings, officialClientId: 'official-client' })).toEqual({
      source: 'custom',
      clientId: 'custom-client',
      clientSecret: 'custom-secret',
    })
  })

  it('uses the build client only when no stored or custom client exists', () => {
    expect(resolveOAuthClient({ settings: {}, officialClientId: 'official-client' })).toEqual({
      source: 'official',
      clientId: 'official-client',
    })
  })

  it('uses the official iOS client instead of a synced desktop override', () => {
    expect(resolveOAuthClient({
      settings,
      officialClientId: 'ios-client',
      allowCustomClient: false,
    })).toEqual({ source: 'official', clientId: 'ios-client' })
  })

  it('leaves source builds on the BYO setup path', () => {
    expect(resolveOAuthClient({ settings: {}, officialClientId: undefined })).toBeNull()
  })
})
