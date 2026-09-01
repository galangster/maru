import { useState } from 'react'
import { ConfirmPopover } from '@/components/confirm-popover'
import { PrimaryButton, SECTION_LABEL, textButtonClass } from '@/components/wren-controls'
import type { Plan } from '@/core/account'
import { useNow } from '@/lib/use-now'
import { useMaruAccount } from './account-store'
import { Danger } from './danger'
import { Devices } from './devices'
import { accountDate, entitlementCopy } from './entitlement-copy'
import { RecoveryCeremony } from './recovery-ceremony'
import { SignIn } from './sign-in'
import { useBusyAction } from './use-busy-action'

export function AccountSection() {
  const account = useMaruAccount()
  const now = useNow()
  const [restore, setRestore] = useState<number | null>(null)
  const { isBusy, run } = useBusyAction()

  if (account.loading) return <p className="text-ink-3 text-sm">Loading Maru account…</p>
  if (account.pending) return <RecoveryCeremony phrase={account.pending.phrase} onConfirm={account.confirmRecoverySaved} />
  if (!account.email) {
    return <SignIn explanation={account.explanation} onSignIn={account.signIn} onSignUp={account.signUp} onRecover={account.recover} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-ink text-base font-medium">{account.email}</p>
        {account.entitlement && <p className="text-ink-3 text-sm tabular-nums">{entitlementCopy(account.entitlement, now)}</p>}
        {account.explanation && <p className="text-ink-2 text-sm" role="status">{account.explanation}</p>}
      </div>

      {account.syncState.kind === 'paused' && (
        <div className="bg-sunken flex items-center gap-3 rounded-md p-3">
          <p className="text-ink-2 min-w-0 flex-1 text-sm">{account.syncState.message}</p>
          <PrimaryButton onClick={() => void run('retry', account.retrySync)} disabled={isBusy('retry')} className="h-10 px-3">
            {isBusy('retry') ? 'Retrying…' : 'Retry'}
          </PrimaryButton>
        </div>
      )}

      {account.billingAvailable && account.entitlement && account.entitlement.state !== 'comped' && (
        <div className="flex flex-col gap-2">
          {account.entitlement.state === 'active' || account.entitlement.state === 'past_due' ? (
            <button type="button" disabled={isBusy('portal')} onClick={() => void run('portal', account.manageSubscription)} className={textButtonClass('default', 'min-h-10 w-fit')}>
              {isBusy('portal') ? 'Opening…' : 'Manage subscription'}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {([['monthly', 'Subscribe monthly · $5'], ['yearly', 'Subscribe yearly · $50 · two months free']] as [Plan, string][]).map(([plan, label]) => (
                <PrimaryButton key={plan} onClick={() => void run(plan, () => account.subscribe(plan))} disabled={isBusy(plan)} className="h-10 px-3">
                  {isBusy(plan) ? 'Opening…' : label}
                </PrimaryButton>
              ))}
            </div>
          )}
        </div>
      )}

      <Devices devices={account.devices} now={now} onRename={account.renameDevice} onRevoke={account.revokeDevice} />

      <div className="border-hairline flex flex-col gap-2 border-t pt-4">
        <p className={SECTION_LABEL}>Restore an earlier version</p>
        {account.history.length === 0 ? (
          <p className="text-ink-3 text-sm">No earlier versions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {account.history.map((entry) => (
              <li key={entry.version} className="flex min-h-10 items-center gap-3">
                <span className="text-ink-2 min-w-0 flex-1 text-sm tabular-nums">Version {entry.version} · {accountDate(entry.updatedAt)}</span>
                <ConfirmPopover
                  open={restore === entry.version}
                  onOpenChange={(open) => setRestore(open ? entry.version : null)}
                  title={`Restore version ${entry.version}?`}
                  description="This copies the selected vault forward as the newest version."
                  cancelLabel="Keep current version"
                  confirmLabel="Restore"
                  onConfirm={() => {
                    setRestore(null)
                    void run(`restore-${entry.version}`, () => account.restoreVersion(entry.version))
                  }}
                  trigger={<button type="button" disabled={isBusy(`restore-${entry.version}`)} className={textButtonClass('default', 'min-h-10')} />}
                  triggerContent={isBusy(`restore-${entry.version}`) ? 'Restoring…' : 'Restore'}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Danger email={account.email} onChangePassword={account.changePassword} onSignOut={account.signOut} onDelete={account.deleteAccount} />
    </div>
  )
}
