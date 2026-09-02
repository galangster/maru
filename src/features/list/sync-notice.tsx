// "New mail has stopped arriving" — said where you would notice.
//
// The sidebar footer and Settings both name the failing account now, but both
// are peripheral chrome. A grant that has been dead for six days is noticed in
// the LIST, as an absence — nothing new arrived — and an absence is the one
// thing a person cannot see. This strip is the only element that goes looking
// for the reader.
//
// It fires ONLY for needsReauth and clientFailure: states a person must act on,
// where mail has genuinely stopped and will not restart on its own. A dropped
// connection never escalates past the footer glyph, because an app that
// interrupts the list over a blip is an app people learn to dismiss without
// reading.

import { Icon } from '@/components/ui/icon'
import { IconButton, textButtonClass } from '@/components/wren-controls'
import { hasStopped, syncKind } from '@/core/sync/failure'
import type { Account, SyncStatus } from '@/core/types'
import { useAccounts, useSyncStatus } from '@/features/mail/queries'
import { useUi } from '@/features/mail/ui-store'
import { useSurfaces } from '@/features/shell/surface-store'
import { deviceNounFor } from '@/features/sidebar/sync-summary'
import { platformOS } from '@/lib/env'

function sentence(stuck: SyncStatus[], emailOf: (id: string) => string): string {
  if (stuck.length > 1) return `New mail has stopped arriving for ${stuck.length} accounts.`
  const [only] = stuck
  const who = emailOf(only.accountId)
  // Two of these four are about THIS machine rather than about the account,
  // and both used to say "on this Mac" wherever they were read. The noun is
  // `sync-summary.ts`'s, so the strip, the sidebar summary and Settings cannot
  // give three different answers about the same device (issue 52).
  const here = deviceNounFor(platformOS)
  switch (syncKind(only)) {
    case 'noClient':
      return `New mail has stopped arriving — Maru has no Google client configured on ${here}.`
    case 'rejected':
      return "New mail has stopped arriving — Google rejected Maru's OAuth client. Your accounts are fine."
    case 'noCredentials':
      return `New mail has stopped arriving for ${who} — Maru has no saved sign-in on ${here}.`
    default:
      return `New mail has stopped arriving for ${who} — Google signed Maru out of it.`
  }
}

export function SyncNotice() {
  const accounts = useAccounts().data as Account[] | undefined
  const statuses = useSyncStatus()
  const view = useUi((s) => s.view)
  const dismissed = useUi((s) => s.syncNoticeDismissed)
  const dismiss = useUi((s) => s.dismissSyncNotice)
  const openSettings = useSurfaces((s) => s.openSettings)

  if (!accounts?.length) return null
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const emailOf = (id: string) => byId.get(id)?.email ?? id

  // hasStopped is the shared line: mail has stopped and will not restart on
  // its own. A transient failure never reaches here — it stays in the footer.
  const stuck = Object.values(statuses).filter(
    (s) => byId.has(s.accountId) && hasStopped(syncKind(s)) && !dismissed.has(s.accountId),
  )
  // Scoped to what is on screen: reading one account's mail, only that
  // account's failure is news. A unified view answers for all of them.
  const relevant =
    view.kind === 'account' ? stuck.filter((s) => s.accountId === view.accountId) : stuck
  if (relevant.length === 0) return null

  // Both client kinds are fixed in Settings → Google, whoever is at fault.
  const clientProblem = relevant.some((s) => {
    const k = syncKind(s)
    return k === 'rejected' || k === 'noClient'
  })
  const action = clientProblem
    ? 'Use your own client'
    : relevant.length > 1
      ? 'Open Settings'
      : syncKind(relevant[0]) === 'noCredentials'
        ? 'Sign in'
        : 'Sign in again'

  return (
    // The search-count strip's own recipe plus the wash Settings' notice uses,
    // so it reads as native chrome rather than an alert pasted on top. No left
    // bar, no destructive fill, no radius of its own — DIRECTION §10.2 bans the
    // sliver and names wash-plus-hairline as the alternative in the same
    // sentence.
    <div className="border-hairline bg-sunken text-ink-2 flex min-h-8 shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs">
      <Icon name="error" size={16} className="text-destructive shrink-0" />
      <p className="min-w-0 flex-1 text-pretty">{sentence(relevant, emailOf)}</p>
      <button
        type="button"
        onClick={() => openSettings(clientProblem ? 'google' : 'accounts')}
        className={textButtonClass('default', 'h-6 shrink-0 rounded-md px-2 text-xs')}
      >
        {action}
      </button>
      <IconButton
        name="close"
        size={16}
        label="Dismiss"
        onClick={() => dismiss(relevant.map((s) => s.accountId))}
      />
    </div>
  )
}
