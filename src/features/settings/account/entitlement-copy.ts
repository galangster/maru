import type { Entitlement } from '@/core/account'

const DAY_MS = 86_400_000
const accountDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export interface PasswordMeterValue {
  label: string
  percent: number
  valid: boolean
}

export function accountDate(
  value: number | null | undefined,
  formatter: Intl.DateTimeFormat = accountDateFormatter,
): string {
  return value ? formatter.format(value) : ''
}

export function entitlementCopy(
  entitlement: Entitlement,
  now = Date.now(),
  formatter: Intl.DateTimeFormat = accountDateFormatter,
): string {
  if (entitlement.state === 'comped') return 'Complimentary account'
  if (entitlement.state === 'trialing') {
    const days = Math.max(0, Math.ceil(((entitlement.trialEndsAt ?? now) - now) / DAY_MS))
    return `${days} day${days === 1 ? '' : 's'} left in trial`
  }
  if (entitlement.state === 'active') {
    const plan = entitlement.plan === 'yearly' ? 'Yearly' : 'Monthly'
    return `${plan} plan${entitlement.periodEndsAt ? ` · ${entitlement.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${accountDate(entitlement.periodEndsAt, formatter)}` : ''}`
  }
  if (entitlement.state === 'past_due') {
    return `Payment past due${entitlement.graceEndsAt ? ` · Update by ${accountDate(entitlement.graceEndsAt, formatter)}` : ''}`
  }
  return 'Subscription needed to push changes'
}

export function passwordMeter(password: string): PasswordMeterValue {
  const remaining = Math.max(0, 12 - password.length)
  return {
    label: remaining === 0 ? 'Minimum reached' : `${remaining} more character${remaining === 1 ? '' : 's'}`,
    percent: Math.min(100, (password.length / 12) * 100),
    valid: remaining === 0,
  }
}
