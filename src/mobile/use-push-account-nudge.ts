import { useEffect, useRef } from 'react'

import { useAccountsById } from '@/features/mail/queries'
import { usePushUi } from '@/features/notifications/push-store'
import { useMaruAccount } from '@/features/settings/account/account-store'
import { readFlag, writeFlag } from '@/lib/local-flag'

const NUDGE_KEY = 'maru.push.account-nudge'

/**
 * Offers the one thing a new phone is missing.
 *
 * Nick installed 0.1.8, signed in to Gmail, and never signed in to the Maru
 * account — so push never registered and nothing on the phone said why. The
 * relay is what wakes this device, and the relay is reached through the Maru
 * account, so a phone with mail and no Maru account can never receive a
 * notification no matter what it answers to iOS.
 *
 * Derived from state rather than fired off the sign-in call. "After the first
 * Gmail sign-in" is a description of a *situation* — there is mail here and no
 * Maru account — and reading it that way means the offer also reaches a phone
 * that arrived at the same place by a route nobody has written yet.
 *
 * @param ready False while anything else owns the screen. An offer that lands
 *   on top of the sheet you just opened is an interruption, not an offer.
 * @param open Called at most once per install.
 */
export function usePushAccountNudge(ready: boolean, open: () => void): void {
  const pushAvailable = usePushUi((state) => state.available)
  const maruEmail = useMaruAccount((state) => state.email)
  const { accounts } = useAccountsById()
  const asked = useRef(false)

  useEffect(() => {
    if (asked.current) return
    // Off iOS there is no notification to offer, so there is nothing to say.
    if (!ready || !pushAvailable) return
    if (maruEmail || accounts.length === 0) return
    // A phone that cannot remember the answer reads as already asked: an offer
    // worth making once is worse than not made at all if it returns every
    // launch.
    if (readFlag(NUDGE_KEY, true)) return
    asked.current = true
    writeFlag(NUDGE_KEY)
    open()
  }, [ready, pushAvailable, maruEmail, accounts.length, open])
}
