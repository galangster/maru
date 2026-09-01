import { describe, expect, it } from 'vitest'

import type { Entitlement } from '@/core/account'
import { accountDeviceIdentity } from '@/lib/env'
import { entitlementLabel, passwordMeter, syncLabel } from '@/mobile/screens/account/account-logic'

const formatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const now = Date.parse('2026-09-01T12:00:00Z')

function entitlement(overrides: Partial<Entitlement>): Entitlement {
  return {
    state: 'active',
    plan: 'monthly',
    trialEndsAt: null,
    periodEndsAt: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  }
}

describe('mobile account presentation', () => {
  it('reports the 12-character password requirement', () => {
    expect(passwordMeter('short')).toEqual({ label: '7 more characters', percent: 5 / 12 * 100, valid: false })
    expect(passwordMeter('twelve-chars')).toEqual({ label: 'Minimum reached', percent: 100, valid: true })
  })

  it('formats every entitlement state', () => {
    expect(entitlementLabel(entitlement({ state: 'trialing', trialEndsAt: now + 2 * 86_400_000 }), now, formatter)).toBe('2 days left in trial')
    expect(entitlementLabel(entitlement({ periodEndsAt: Date.parse('2026-10-01T00:00:00Z') }), now, formatter)).toBe('Renews Oct 1, 2026')
    expect(entitlementLabel(entitlement({ state: 'past_due', graceEndsAt: Date.parse('2026-09-08T00:00:00Z') }), now, formatter)).toBe('Payment past due · Update by Sep 8, 2026')
    expect(entitlementLabel(entitlement({ state: 'expired' }), now, formatter)).toBe('Account expired')
    expect(entitlementLabel(entitlement({ state: 'comped' }), now, formatter)).toBe('Complimentary account')
  })

  it('labels idle, active, and paused sync states', () => {
    expect(syncLabel({ kind: 'idle' })).toBe('Up to date')
    expect(syncLabel({ kind: 'syncing', direction: 'pull' })).toBe('Syncing from Maru…')
    expect(syncLabel({ kind: 'paused', reason: 'network', message: 'Unable to reach Maru sync' })).toBe('Unable to reach Maru sync')
  })
})

describe('account device identity', () => {
  it('uses the iOS platform and family on the phone', () => {
    expect(accountDeviceIdentity('ios', 'iPhone')).toEqual({ platform: 'ios', family: 'ios' })
  })

  it('keeps existing desktop identities', () => {
    expect(accountDeviceIdentity('mac', 'Macintosh')).toEqual({ platform: 'macos', family: 'desktop' })
    expect(accountDeviceIdentity('windows', 'Windows')).toEqual({ platform: 'windows', family: 'desktop' })
    expect(accountDeviceIdentity('other', 'X11; Linux x86_64')).toEqual({ platform: 'linux', family: 'desktop' })
  })
})
