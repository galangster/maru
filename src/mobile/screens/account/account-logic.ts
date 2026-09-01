import type { AccountSyncState, Entitlement } from '@/core/account'

const DAY_MS = 86_400_000

export interface PasswordMeter {
  label: string
  percent: number
  valid: boolean
}

export function passwordMeter(password: string): PasswordMeter {
  const remaining = Math.max(0, 12 - password.length)
  return {
    label: remaining === 0 ? 'Minimum reached' : `${remaining} more character${remaining === 1 ? '' : 's'}`,
    percent: Math.min(100, (password.length / 12) * 100),
    valid: remaining === 0,
  }
}

export function entitlementLabel(
  entitlement: Entitlement,
  now = Date.now(),
  formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }),
): string {
  const date = (value: number | null | undefined) => value ? formatter.format(value) : ''
  switch (entitlement.state) {
    case 'comped':
      return 'Complimentary account'
    case 'trialing': {
      const days = Math.max(0, Math.ceil(((entitlement.trialEndsAt ?? now) - now) / DAY_MS))
      return `${days} day${days === 1 ? '' : 's'} left in trial`
    }
    case 'active':
      return entitlement.periodEndsAt
        ? `${entitlement.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${date(entitlement.periodEndsAt)}`
        : 'Active'
    case 'past_due':
      return entitlement.graceEndsAt
        ? `Payment past due · Update by ${date(entitlement.graceEndsAt)}`
        : 'Payment past due'
    case 'expired':
      return 'Account expired'
  }
}

export function syncLabel(state: AccountSyncState): string {
  switch (state.kind) {
    case 'idle':
      return 'Up to date'
    case 'syncing':
      return state.direction === 'pull' ? 'Syncing from Maru…' : 'Saving to Maru…'
    case 'paused':
      return state.message
    case 'signed_out':
      return state.message
  }
}
