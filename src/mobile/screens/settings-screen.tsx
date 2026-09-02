import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { useAccountsById, useSaveSettings, useSettings } from '@/features/mail/queries'
import { registrationLabel, type PushPermission } from '@/core/push'
import { usePushUi } from '@/features/notifications/push-store'
import { useMailMode, useMailService } from '@/features/mail/service'
import { useMaruAccount } from '@/features/settings/account/account-store'
import { useBusyAction } from '@/features/settings/account/use-busy-action'
import { MobileIcon } from '../components/mobile-icon'
import './settings-screen.css'

export function SettingsScreen({ onAccount }: { onAccount: () => void }) {
  const { accounts } = useAccountsById()
  const settings = useSettings()
  const save = useSaveSettings()
  const service = useMailService()
  const { demo } = useMailMode()
  // Field by field: the row redraws when the permission changes, not when
  // an unrelated part of the push state does.
  const pushAvailable = usePushUi((state) => state.available)
  const pushPermission = usePushUi((state) => state.permission)
  const pushRequesting = usePushUi((state) => state.requesting)
  const requestPush = usePushUi((state) => state.requestPermission)
  // The relay is what wakes this phone, and the relay is reached through the
  // Maru account. Without one the toggle cannot do anything at all, so the row
  // says the requirement rather than offering a switch that does nothing.
  const maruEmail = useMaruAccount((state) => state.email)
  const { isBusy, run } = useBusyAction((error) => {
    const code = 'code' in error ? error.code : undefined
    toast.error(code === 'cancelled' ? 'Sign-in cancelled' : error.message)
  })
  const addingGmail = isBusy('add-gmail')
  const current = settings.data

  const addGmailAccount = () => {
    if (demo) return
    void run('add-gmail', async () => {
      const account = await service.addAccount()
      toast.success(`Added ${account.email}`)
    })
  }
  return (
    <section className="mobile-screen mobile-settings" aria-label="Settings">
      <header className="mobile-nav mobile-simple-nav"><h1>Settings</h1></header>
      <div className="mobile-scroll mobile-settings-scroll">
        <SettingsGroup title="Accounts">
          {accounts.map((account) => <SettingsRow key={account.id} icon={<MobileIcon name="participants" scale="action" />} title={account.displayName} detail={account.email} />)}
          <SettingsRow
            icon={<MobileIcon name="add" scale="action" />}
            title={addingGmail ? 'Opening Google…' : 'Add Gmail account'}
            detail={demo ? 'Gmail sign-in on the phone arrives with the iOS client id' : 'Sign in with Google'}
            onClick={demo ? undefined : addGmailAccount}
          />
        </SettingsGroup>
        <SettingsGroup title="Appearance">
          <div className="mobile-theme-picker" role="group" aria-label="Appearance">
            {(['system', 'light', 'dark'] as const).map((theme) => <button key={theme} type="button" aria-pressed={current?.theme === theme} className={current?.theme === theme ? 'is-active' : ''} onClick={() => save.mutate({ theme })}>{theme[0].toUpperCase() + theme.slice(1)}</button>)}
          </div>
        </SettingsGroup>
        <SettingsGroup title="Messages">
          <SettingsToggle icon={<MobileIcon name="image" scale="action" />} title="Load images" checked={(current?.imagePolicy ?? 'allow') === 'allow'} onChange={(checked) => save.mutate({ imagePolicy: checked ? 'allow' : 'block' })} />
          <SettingsToggle icon={<MobileIcon name="sliders" scale="action" />} title="Sounds" checked={current?.sounds ?? false} onChange={(sounds) => save.mutate({ sounds })} />
        </SettingsGroup>
        {pushAvailable && (
          <SettingsGroup title="Notifications">
            <SettingsToggle
              icon={<MobileIcon name="unread" scale="action" />}
              title="New mail"
              // The requirement is the row's own detail text, not a footnote
              // under the group. A footnote explains a control; this is the
              // reason the control is off, and it belongs where the eye lands
              // when it asks why the switch will not move.
              detail={maruEmail ? notificationsDetail(pushPermission, pushRequesting) : 'Sign in to your Maru account to turn this on'}
              checked={Boolean(maruEmail) && pushPermission === 'granted'}
              // Granted and denied are both final from in here: iOS shows its
              // alert once ever, and only iPhone Settings can change the
              // answer afterwards. No Maru account is the third way this
              // switch cannot move, and the only one Maru can fix.
              disabled={!maruEmail || pushRequesting || pushPermission !== 'prompt'}
              onChange={() => void requestPush()}
            />
            <PushDiagnosticsRow />
          </SettingsGroup>
        )}
        <SettingsGroup title="Maru account"><SettingsRow icon={<MobileIcon name="unread" scale="action" />} title="Maru account" detail="Sync, devices and recovery" onClick={onAccount} /></SettingsGroup>
        <SettingsGroup title="About"><SettingsRow icon={<MobileIcon name="info" scale="action" />} title="Maru for iPhone" detail={`Version 0.1.8 · ${demo ? 'Demo mode' : 'Gmail mode'}`} /></SettingsGroup>
      </div>
    </section>
  )
}

function notificationsDetail(permission: PushPermission, requesting: boolean): string {
  if (requesting) return 'Waiting for your answer…'
  if (permission === 'granted') return 'On'
  if (permission === 'denied') return 'Off — turn it on in iPhone Settings'
  return 'Ask iPhone to allow notifications'
}

/**
 * What the phone knows about its own push registration, and the one action
 * that proves it end to end.
 *
 * Everything here is otherwise invisible from the device: APNs refuses in a
 * delegate callback, the relay refuses in a promise nobody reads, and a device
 * row with no token looks exactly like a working one from in here.
 */
function PushDiagnosticsRow() {
  const tokenPrefix = usePushUi((state) => state.tokenPrefix)
  const registration = usePushUi((state) => state.registration)
  const lastError = usePushUi((state) => state.lastError)
  const testing = usePushUi((state) => state.testing)
  const lastTest = usePushUi((state) => state.lastTest)
  const sendTestPush = usePushUi((state) => state.sendTestPush)
  return (
    <div className="mobile-row mobile-diagnostics-row">
      <span className="mobile-row-icon"><MobileIcon name="info" scale="action" /></span>
      <span>
        <strong>Push diagnostics</strong>
        <small>Device token · {tokenPrefix ? `${tokenPrefix}…` : 'no token'}</small>
        <small>Relay · {registrationLabel(registration, lastError)}</small>
        {lastTest && <small>Test push · {lastTest}</small>}
      </span>
      <button
        type="button"
        className="mobile-diagnostics-action mobile-press"
        disabled={testing}
        onClick={() => void sendTestPush()}
      >
        {testing ? 'Sending…' : 'Send test push'}
      </button>
    </div>
  )
}

function SettingsGroup({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mobile-group">
      <h2>{title}</h2>
      <div>{children}</div>
      {note && <p className="mobile-group-note">{note}</p>}
    </section>
  )
}
function SettingsRow({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick?: () => void }) {
  const content = <><span className="mobile-row-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span>{onClick && <MobileIcon name="chevronRight" />}</>
  return onClick
    ? <button type="button" className="mobile-row mobile-settings-link mobile-press" onClick={onClick} aria-label={`${title}. ${detail}`}>{content}</button>
    : <div className="mobile-row">{content}</div>
}
function SettingsToggle({ icon, title, detail, checked, disabled, onChange }: { icon: ReactNode; title: string; detail?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mobile-row mobile-toggle-row" data-disabled={disabled || undefined}>
      <span className="mobile-row-icon">{icon}</span><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="mobile-switch" aria-hidden><span /></span>
    </label>
  )
}
