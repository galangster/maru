import type { ReactNode } from 'react'
import { ChevronRight, Image as ImageIcon, Info, Mail, UserRound, Volume2 } from 'lucide-react'

import { useAccountsById, useSaveSettings, useSettings } from '@/features/mail/queries'
import './settings-screen.css'

export function SettingsScreen({ onAccount }: { onAccount: () => void }) {
  const { accounts } = useAccountsById()
  const settings = useSettings()
  const save = useSaveSettings()
  const current = settings.data
  return (
    <section className="mobile-screen mobile-settings" aria-label="Settings">
      <header className="mobile-nav mobile-simple-nav"><h1>Settings</h1></header>
      <div className="mobile-scroll mobile-settings-scroll">
        <SettingsGroup title="Accounts">{accounts.map((account) => <SettingsRow key={account.id} icon={<UserRound size={19} />} title={account.displayName} detail={account.email} />)}</SettingsGroup>
        <SettingsGroup title="Appearance">
          <div className="mobile-theme-picker" role="group" aria-label="Appearance">
            {(['system', 'light', 'dark'] as const).map((theme) => <button key={theme} type="button" className={current?.theme === theme ? 'is-active' : ''} onClick={() => save.mutate({ theme })}>{theme[0].toUpperCase() + theme.slice(1)}</button>)}
          </div>
        </SettingsGroup>
        <SettingsGroup title="Messages">
          <SettingsToggle icon={<ImageIcon size={19} />} title="Load images" checked={(current?.imagePolicy ?? 'allow') === 'allow'} onChange={(checked) => save.mutate({ imagePolicy: checked ? 'allow' : 'block' })} />
          <SettingsToggle icon={<Volume2 size={19} />} title="Sounds" checked={current?.sounds ?? false} onChange={(sounds) => save.mutate({ sounds })} />
        </SettingsGroup>
        <SettingsGroup title="Maru account"><SettingsRow icon={<Mail size={19} />} title="Maru account" detail="Sync, devices and recovery" onClick={onAccount} /></SettingsGroup>
        <SettingsGroup title="About"><SettingsRow icon={<Info size={19} />} title="Maru for iPhone" detail="Version 0.1.7 · Demo mode" /></SettingsGroup>
      </div>
    </section>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mobile-settings-group"><h2>{title}</h2><div>{children}</div></section>
}
function SettingsRow({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick?: () => void }) {
  const content = <><span className="mobile-settings-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span>{onClick && <ChevronRight size={17} aria-hidden />}</>
  return onClick
    ? <button type="button" className="mobile-settings-row mobile-settings-link mobile-press" onClick={onClick} aria-label={`${title}. ${detail}`}>{content}</button>
    : <div className="mobile-settings-row">{content}</div>
}
function SettingsToggle({ icon, title, checked, onChange }: { icon: ReactNode; title: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mobile-settings-row mobile-toggle-row">
      <span className="mobile-settings-icon">{icon}</span><span><strong>{title}</strong></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="mobile-switch" aria-hidden><span /></span>
    </label>
  )
}
