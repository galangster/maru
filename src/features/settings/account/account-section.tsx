import { useState } from 'react'
import { toast } from 'sonner'

import { PrimaryButton, textButtonClass } from '@/components/wren-controls'
import type { Entitlement, Plan } from '@/core/account'
import { useMaruAccount } from './account-context'
import { Danger } from './danger'
import { Devices } from './devices'
import { RecoveryCeremony } from './recovery-ceremony'
import { SignIn } from './sign-in'

const day = 86_400_000

function date(value: number | null | undefined): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value) : ''
}

function entitlementCopy(entitlement: Entitlement): string {
  if (entitlement.state === 'comped') return 'Complimentary account'
  if (entitlement.state === 'trialing') {
    const days = Math.max(0, Math.ceil(((entitlement.trialEndsAt ?? Date.now()) - Date.now()) / day))
    return `${days} day${days === 1 ? '' : 's'} left in trial`
  }
  if (entitlement.state === 'active') {
    const plan = entitlement.plan === 'yearly' ? 'Yearly' : 'Monthly'
    return `${plan} plan${entitlement.periodEndsAt ? ` · ${entitlement.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${date(entitlement.periodEndsAt)}` : ''}`
  }
  if (entitlement.state === 'past_due') return `Payment past due${entitlement.graceEndsAt ? ` · Update by ${date(entitlement.graceEndsAt)}` : ''}`
  return 'Subscription needed to push changes'
}

export function AccountSection() {
  const account = useMaruAccount()
  const [busy, setBusy] = useState<string | null>(null)

  if (account.loading) return <p className="text-ink-3 text-sm">Loading Maru account…</p>
  if (account.pending) return <RecoveryCeremony phrase={account.pending.phrase} onConfirm={account.confirmRecoverySaved} />
  if (!account.email) {
    return <SignIn explanation={account.explanation} onSignIn={account.signIn} onSignUp={account.signUp} onRecover={account.recover} />
  }

  const run = (key: string, action: () => Promise<void>) => {
    setBusy(key)
    void action().catch((error: Error) => toast.error('Unable to complete that action', { description: error.message })).finally(() => setBusy(null))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-ink text-base font-medium">{account.email}</p>
        {account.entitlement && <p className="text-ink-3 text-sm tabular-nums">{entitlementCopy(account.entitlement)}</p>}
        {account.explanation && <p className="text-ink-2 text-sm" role="status">{account.explanation}</p>}
      </div>

      {account.syncState.kind === 'paused' && (
        <div className="bg-sunken flex items-center gap-3 rounded-md p-3">
          <p className="text-ink-2 min-w-0 flex-1 text-sm">{account.syncState.message}</p>
          <PrimaryButton onClick={() => run('retry', account.retrySync)} disabled={busy !== null} className="h-10 px-3">
            {busy === 'retry' ? 'Retrying…' : 'Retry'}
          </PrimaryButton>
        </div>
      )}

      {account.billingAvailable && account.entitlement && account.entitlement.state !== 'comped' && (
        <div className="flex flex-col gap-2">
          {account.entitlement.state === 'active' || account.entitlement.state === 'past_due' ? (
            <button type="button" onClick={() => run('portal', account.manageSubscription)} className={textButtonClass('default', 'min-h-10 w-fit')}>
              {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {([['monthly', 'Subscribe monthly · $5'], ['yearly', 'Subscribe yearly · $50 · two months free']] as [Plan, string][]).map(([plan, label]) => (
                <PrimaryButton key={plan} onClick={() => run(plan, () => account.subscribe(plan))} disabled={busy !== null} className="h-10 px-3">
                  {busy === plan ? 'Opening…' : label}
                </PrimaryButton>
              ))}
            </div>
          )}
        </div>
      )}

      <Devices devices={account.devices} onRename={account.renameDevice} onRevoke={account.revokeDevice} />

      <div className="border-hairline flex flex-col gap-2 border-t pt-4">
        <p className="text-ink-3 text-xs font-medium tracking-wide uppercase">Restore an earlier version</p>
        {account.history.length === 0 ? (
          <p className="text-ink-3 text-sm">No earlier versions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {account.history.map((entry) => (
              <li key={entry.version} className="flex min-h-10 items-center gap-3">
                <span className="text-ink-2 min-w-0 flex-1 text-sm tabular-nums">Version {entry.version} · {date(entry.updatedAt)}</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm(`Restore vault version ${entry.version}? This copies it forward as the newest version.`)) run(`restore-${entry.version}`, () => account.restoreVersion(entry.version))
                  }}
                  className={textButtonClass('default', 'min-h-10')}
                >
                  {busy === `restore-${entry.version}` ? 'Restoring…' : 'Restore'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Danger email={account.email} onChangePassword={account.changePassword} onSignOut={account.signOut} onDelete={account.deleteAccount} />
    </div>
  )
}
