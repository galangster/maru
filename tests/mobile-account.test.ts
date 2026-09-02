import { describe, expect, it } from 'vitest'

import type { Entitlement } from '@/core/account'
import { entitlementCopy, passwordMeter } from '@/features/settings/account/entitlement-copy'
import {
  accountDeviceIdentity,
  iosClientForcesDemo,
} from '@/lib/env'
import { IOS_GOOGLE_CLIENT_ID_PLACEHOLDER } from '@/lib/ios-oauth'
import { syncLabel, syncTitle } from '@/mobile/screens/account/account-logic'

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
    expect(passwordMeter('eleven-char')).toEqual({ label: '1 more character', percent: 11 / 12 * 100, valid: false })
    expect(passwordMeter('twelve-chars')).toEqual({ label: 'Minimum reached', percent: 100, valid: true })
  })

  it('formats every entitlement state', () => {
    expect(entitlementCopy(entitlement({ state: 'trialing', trialEndsAt: now + 2 * 86_400_000 }), now, formatter)).toBe('2 days left in trial')
    expect(entitlementCopy(entitlement({ periodEndsAt: Date.parse('2026-10-01T00:00:00Z') }), now, formatter)).toBe('Monthly plan · Renews Oct 1, 2026')
    expect(entitlementCopy(entitlement({ state: 'past_due', graceEndsAt: Date.parse('2026-09-08T00:00:00Z') }), now, formatter)).toBe('Payment past due · Update by Sep 8, 2026')
    expect(entitlementCopy(entitlement({ state: 'expired' }), now, formatter)).toBe('Subscription needed to push changes')
    expect(entitlementCopy(entitlement({ state: 'comped' }), now, formatter)).toBe('Complimentary account')
  })

  it('labels idle, active, and paused sync states', () => {
    expect(syncLabel({ kind: 'idle' })).toBe('Up to date')
    expect(syncLabel({ kind: 'syncing', direction: 'pull' })).toBe('Syncing from Maru…')
    expect(syncLabel({ kind: 'paused', reason: 'network', message: 'Unable to reach Maru sync' })).toBe('Unable to reach Maru sync')
    expect(syncTitle({ kind: 'paused', reason: 'network', message: 'Unable to reach Maru sync' })).toBe('Sync paused')
  })
})

describe('account device identity', () => {
  it('uses the iOS platform and family on the phone', async () => {
    await expect(accountDeviceIdentity('ios', 'iPhone', 'Nick’s iPhone')).resolves.toEqual({ name: 'Nick’s iPhone', platform: 'ios', family: 'ios' })
  })

  it('keeps existing desktop identities', async () => {
    await expect(accountDeviceIdentity('mac', 'Macintosh', 'MacIntel')).resolves.toEqual({ name: 'MacIntel', platform: 'macos', family: 'desktop' })
    await expect(accountDeviceIdentity('windows', 'Windows', 'Win32')).resolves.toEqual({ name: 'Win32', platform: 'windows', family: 'desktop' })
    await expect(accountDeviceIdentity('other', 'X11; Linux x86_64', 'Linux x86_64')).resolves.toEqual({ name: 'Linux x86_64', platform: 'linux', family: 'desktop' })
  })
})

describe('iOS Gmail demo gate', () => {
  it('forces only the exact built-in placeholder into demo mode', () => {
    expect(iosClientForcesDemo(IOS_GOOGLE_CLIENT_ID_PLACEHOLDER)).toBe(true)
    expect(iosClientForcesDemo('PLACEHOLDER-TEST.apps.googleusercontent.com')).toBe(false)
    expect(iosClientForcesDemo('123-real.apps.googleusercontent.com')).toBe(false)
  })
})
