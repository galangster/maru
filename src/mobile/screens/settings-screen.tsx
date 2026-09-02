import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { useAccountsById, useSaveSettings, useSettings } from '@/features/mail/queries'
import { useMailMode, useMailService } from '@/features/mail/service'
import { iosGoogleClientId } from '@/lib/env'
import { MobileIcon } from '../components/mobile-icon'
import './settings-screen.css'

export function SettingsScreen({ onAccount }: { onAccount: () => void }) {
  const { accounts } = useAccountsById()
  const settings = useSettings()
  const save = useSaveSettings()
  const service = useMailService()
  const { demo } = useMailMode()
  const [addingGmail, setAddingGmail] = useState(false)
  const current = settings.data

  const addGmailAccount = async () => {
    if (demo || addingGmail) return
    setAddingGmail(true)
    const previous = await service.getSettings()
    try {
      // RealMailService selects new-account clients from Settings. Keep the
      // iOS build client scoped to this consent and restore desktop BYO data.
      await service.setSettings({ googleClientId: iosGoogleClientId, googleClientSecret: undefined })
      const account = await service.addAccount()
      toast.success(`Added ${account.email}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message.includes('cancelled') ? 'Sign-in cancelled' : message)
    } finally {
      await service.setSettings({
        googleClientId: previous.googleClientId,
        googleClientSecret: previous.googleClientSecret,
      })
      setAddingGmail(false)
    }
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
            onClick={demo ? undefined : () => void addGmailAccount()}
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
        <SettingsGroup title="Maru account"><SettingsRow icon={<MobileIcon name="unread" scale="action" />} title="Maru account" detail="Sync, devices and recovery" onClick={onAccount} /></SettingsGroup>
        <SettingsGroup title="About"><SettingsRow icon={<MobileIcon name="info" scale="action" />} title="Maru for iPhone" detail={`Version 0.1.8 · ${demo ? 'Demo mode' : 'Gmail mode'}`} /></SettingsGroup>
      </div>
    </section>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mobile-group"><h2>{title}</h2><div>{children}</div></section>
}
function SettingsRow({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick?: () => void }) {
  const content = <><span className="mobile-row-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span>{onClick && <MobileIcon name="chevronRight" />}</>
  return onClick
    ? <button type="button" className="mobile-row mobile-settings-link mobile-press" onClick={onClick} aria-label={`${title}. ${detail}`}>{content}</button>
    : <div className="mobile-row">{content}</div>
}
function SettingsToggle({ icon, title, checked, onChange }: { icon: ReactNode; title: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mobile-row mobile-toggle-row">
      <span className="mobile-row-icon">{icon}</span><span><strong>{title}</strong></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="mobile-switch" aria-hidden><span /></span>
    </label>
  )
}
