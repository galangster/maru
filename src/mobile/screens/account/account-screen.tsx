import { useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  Cloud,
  Copy,
  ExternalLink,
  KeyRound,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react'

import type { AccountDevice, VaultHistoryEntry } from '@/core/account'
import { normalizeEmail } from '@/core/account'
import { useMaruAccount, type MaruAccountState } from '@/features/settings/account/account-store'
import { useUi } from '@/features/mail/ui-store'
import { elapsedTime } from '@/lib/format'
import { openExternalUrl } from '@/lib/env'
import { BottomSheet } from '@/mobile/components/bottom-sheet'
import { entitlementLabel, passwordMeter, syncLabel } from './account-logic'
import './account-screen.css'

type AuthMode = 'signIn' | 'signUp' | 'recover'
type AccountSheet =
  | { kind: 'restore'; entry: VaultHistoryEntry }
  | { kind: 'password' }
  | { kind: 'delete' }
  | null

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function AccountScreen({ onBack }: { onBack: () => void }) {
  const account = useMaruAccount()

  return (
    <section className="mobile-screen mobile-account-screen" aria-label="Maru account">
      <header className="mobile-nav mobile-account-nav">
        <button className="mobile-nav-back" type="button" onClick={onBack} aria-label="Back to Settings">
          <ArrowLeft size={22} aria-hidden />
          <span>Settings</span>
        </button>
        <h1>Maru account</h1>
        <span className="mobile-account-nav-spacer" aria-hidden />
      </header>

      {account.loading ? (
        <div className="mobile-account-loading" role="status">Loading Maru account…</div>
      ) : account.pending ? (
        <RecoveryCeremony account={account} />
      ) : account.email ? (
        <SignedIn account={account} />
      ) : (
        <SignedOut account={account} />
      )}
    </section>
  )
}

function SignedOut({ account }: { account: MaruAccountState }) {
  const [mode, setMode] = useState<AuthMode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const meter = passwordMeter(password)

  const selectMode = (next: AuthMode) => {
    setMode(next)
    setPassword('')
    setPhrase('')
    setError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode !== 'signIn' && !meter.valid) {
      setError('Choose a password with at least 12 characters')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signUp') await account.signUp(email, password)
      else if (mode === 'recover') await account.recover(email, phrase, password)
      else await account.signIn(email, password)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const actionLabel = mode === 'signUp' ? 'Create account' : mode === 'recover' ? 'Recover account' : 'Sign in'

  return (
    <div className="mobile-scroll mobile-account-scroll mobile-account-auth">
      <div className="mobile-account-intro">
        <span className="mobile-account-mark" aria-hidden><Cloud size={24} /></span>
        <h2>Take Maru with you</h2>
        <p>Restore your settings and Gmail account list on this iPhone.</p>
        {account.explanation && <p className="mobile-account-note" role="status">{account.explanation}</p>}
      </div>

      <div className="mobile-account-segments" role="tablist" aria-label="Maru account action">
        {([
          ['signIn', 'Sign in'],
          ['signUp', 'Sign up'],
          ['recover', 'Recover'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={mode === id ? 'is-active' : ''}
            onClick={() => selectMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <form className="mobile-account-form" onSubmit={(event) => void submit(event)} noValidate>
        <AccountField label="Email" htmlFor="mobile-account-email">
          <input
            id="mobile-account-email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="email"
            spellCheck={false}
            placeholder="name@example.com"
            required
            value={email}
            onChange={(event) => { setEmail(event.target.value); if (error) setError(null) }}
          />
        </AccountField>

        {mode === 'recover' && (
          <AccountField label="Recovery words" htmlFor="mobile-account-recovery">
            <textarea
              id="mobile-account-recovery"
              rows={3}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="Enter all 12 words in order"
              required
              value={phrase}
              onChange={(event) => { setPhrase(event.target.value); if (error) setError(null) }}
            />
          </AccountField>
        )}

        <AccountField label={mode === 'recover' ? 'New password' : 'Password'} htmlFor="mobile-account-password">
          <input
            id="mobile-account-password"
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            minLength={mode === 'signIn' ? undefined : 12}
            required
            value={password}
            onChange={(event) => { setPassword(event.target.value); if (error) setError(null) }}
          />
        </AccountField>

        {mode !== 'signIn' && <PasswordMeter password={password} />}
        {error && <p className="mobile-account-error" role="alert">{error}</p>}

        <button className="mobile-account-primary mobile-press" type="submit" disabled={busy}>
          {busy ? `${actionLabel}…` : actionLabel}
        </button>
      </form>
    </div>
  )
}

function RecoveryCeremony({ account }: { account: MaruAccountState }) {
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const phrase = account.pending?.phrase ?? ''
  const words = phrase.split(' ')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phrase)
      setCopyStatus('Recovery words copied')
    } catch {
      setCopyStatus('Unable to copy. Select and copy the words manually.')
    }
  }

  const activate = async () => {
    setBusy(true)
    setError(null)
    try {
      await account.confirmRecoverySaved()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mobile-account-ceremony-layer" role="dialog" aria-modal="true" aria-labelledby="mobile-recovery-title">
      <div className="mobile-account-ceremony-nav">
        <h2 id="mobile-recovery-title">Save your recovery words</h2>
        <button type="button" className="mobile-account-copy mobile-press" onClick={() => void copy()} aria-label="Copy all 12 recovery words">
          <Copy size={18} aria-hidden />
          <span>Copy</span>
        </button>
      </div>
      <div className="mobile-account-ceremony-scroll">
        <p>Maru shows these words once. Keep them somewhere only you can reach.</p>
        <ol className="mobile-account-words" aria-label="Twelve recovery words">
          {words.map((word, index) => (
            <li key={`${word}-${index}`}>
              <span>{index + 1}</span>
              <strong>{word}</strong>
            </li>
          ))}
        </ol>
        {copyStatus && <p className="mobile-account-copy-status" role="status">{copyStatus}</p>}
        <p className="mobile-account-loss-warning">If you lose both your password and these words, you lose your vault.</p>
        <label className="mobile-account-check-row">
          <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
          <span aria-hidden className="mobile-account-checkbox"><ShieldCheck size={17} /></span>
          <strong>I saved these 12 words somewhere safe</strong>
        </label>
        {error && <p className="mobile-account-error" role="alert">{error}</p>}
        <button className="mobile-account-primary mobile-press" type="button" disabled={!saved || busy} onClick={() => void activate()}>
          {busy ? 'Activating account…' : 'Activate account'}
        </button>
      </div>
    </div>
  )
}

function SignedIn({ account }: { account: MaruAccountState }) {
  const pendingAccounts = useUi((state) => state.pendingAccounts)
  const [sheet, setSheet] = useState<AccountSheet>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (key: string, action: () => Promise<void>): Promise<boolean> => {
    setBusy(key)
    setError(null)
    try {
      await action()
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mobile-scroll mobile-account-scroll mobile-account-signed-in">
        <section className="mobile-account-profile" aria-label="Account summary">
          <span className="mobile-account-mark" aria-hidden><Cloud size={24} /></span>
          <div>
            <h2>{account.email}</h2>
            {account.entitlement && <p>{entitlementLabel(account.entitlement)}</p>}
          </div>
        </section>

        {account.explanation && <p className="mobile-account-note" role="status">{account.explanation}</p>}
        {error && <p className="mobile-account-error mobile-account-page-error" role="alert">{error}</p>}

        <AccountGroup title="Sync">
          <div className="mobile-account-status-row" aria-live="polite">
            <span className={`mobile-account-status-icon is-${account.syncState.kind}`} aria-hidden>
              {account.syncState.kind === 'syncing' ? <RefreshCw size={18} /> : <Cloud size={18} />}
            </span>
            <span>
              <strong>{account.syncState.kind === 'paused' ? 'Sync paused' : account.syncState.kind === 'syncing' ? 'Syncing' : 'Sync state'}</strong>
              <small>{syncLabel(account.syncState)}</small>
            </span>
            {account.syncState.kind === 'paused' && (
              <button type="button" className="mobile-account-inline-button mobile-press" disabled={busy !== null} onClick={() => void run('retry', account.retrySync)}>
                {busy === 'retry' ? 'Retrying…' : 'Retry'}
              </button>
            )}
          </div>
        </AccountGroup>

        <AccountGroup title="Subscription">
          <AccountRow
            icon={<ExternalLink size={18} />}
            title="Manage on getmaru.app"
            detail="Opens in your browser"
            onClick={() => void run('manage', () => openExternalUrl('https://getmaru.app/account'))}
          />
        </AccountGroup>

        <Devices devices={account.devices} busy={busy} run={run} onRename={account.renameDevice} onRevoke={account.revokeDevice} />

        {pendingAccounts.length > 0 && (
          <AccountGroup title="Gmail accounts" footer="Available when Gmail sign-in reaches the phone (I3)">
            {pendingAccounts.map((email) => (
              <div className="mobile-account-row mobile-account-disabled-row" key={email} aria-label={`${email}. Sign in on this iPhone. Disabled`}>
                <span className="mobile-account-row-icon" aria-hidden><Mail size={18} /></span>
                <span><strong>{email}</strong><small>Restored from your Maru account</small></span>
                <button type="button" disabled aria-label={`Sign in to ${email} on this iPhone, unavailable until I3`}>Sign in on this iPhone</button>
              </div>
            ))}
          </AccountGroup>
        )}

        <AccountGroup title="Restore an earlier version">
          {account.history.length === 0 ? (
            <div className="mobile-account-empty-row">No earlier versions yet.</div>
          ) : account.history.map((entry) => (
            <AccountRow
              key={entry.version}
              icon={<RotateCcw size={18} />}
              title={dateFormatter.format(entry.updatedAt)}
              detail={`Version ${entry.version}`}
              onClick={() => setSheet({ kind: 'restore', entry })}
            />
          ))}
        </AccountGroup>

        <AccountGroup title="Account controls">
          <AccountRow icon={<KeyRound size={18} />} title="Change password" onClick={() => setSheet({ kind: 'password' })} />
          <AccountRow
            icon={<Smartphone size={18} />}
            title={busy === 'signout' ? 'Signing out…' : 'Sign out'}
            disabled={busy !== null}
            onClick={() => void run('signout', account.signOut)}
          />
          <AccountRow icon={<Trash2 size={18} />} title="Delete account" destructive onClick={() => setSheet({ kind: 'delete' })} />
        </AccountGroup>
      </div>

      {sheet?.kind === 'restore' && (
        <RestoreSheet
          entry={sheet.entry}
          busy={busy === `restore-${sheet.entry.version}`}
          onClose={() => setSheet(null)}
          onRestore={async () => {
            const ok = await run(`restore-${sheet.entry.version}`, () => account.restoreVersion(sheet.entry.version))
            if (ok) setSheet(null)
          }}
        />
      )}
      {sheet?.kind === 'password' && (
        <PasswordSheet
          busy={busy === 'password'}
          onClose={() => setSheet(null)}
          onChange={async (current, next) => {
            const ok = await run('password', () => account.changePassword(current, next))
            if (ok) setSheet(null)
            return ok
          }}
        />
      )}
      {sheet?.kind === 'delete' && (
        <DeleteSheet
          email={account.email!}
          busy={busy === 'delete'}
          onClose={() => setSheet(null)}
          onDelete={(password) => run('delete', () => account.deleteAccount(password))}
        />
      )}
    </>
  )
}

function Devices({
  devices,
  busy,
  run,
  onRename,
  onRevoke,
}: {
  devices: AccountDevice[]
  busy: string | null
  run(key: string, action: () => Promise<void>): Promise<boolean>
  onRename(id: string, name: string): Promise<void>
  onRevoke(id: string): Promise<void>
}) {
  const current = devices.find((device) => device.current)
  const others = devices.filter((device) => !device.current)

  return (
    <AccountGroup title="Devices">
      {current && (
        <form
          className="mobile-account-device-form"
          onSubmit={(event) => {
            event.preventDefault()
            const name = String(new FormData(event.currentTarget).get('device-name') ?? '').trim()
            if (name && name !== current.name) void run(`device-${current.id}`, () => onRename(current.id, name))
          }}
        >
          <label htmlFor="mobile-device-name">
            <span>This device</span>
            <input id="mobile-device-name" name="device-name" type="text" defaultValue={current.name} autoCapitalize="words" autoComplete="off" spellCheck={false} />
          </label>
          <button className="mobile-account-inline-button mobile-press" type="submit" disabled={busy !== null}>
            {busy === `device-${current.id}` ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
      {others.map((device) => (
        <div className="mobile-account-row mobile-account-device-row" key={device.id}>
          <span className="mobile-account-row-icon" aria-hidden><Smartphone size={18} /></span>
          <span><strong>{device.name}</strong><small>Seen {elapsedTime(device.lastSeenAt, Date.now())}</small></span>
          <button
            type="button"
            className="mobile-account-danger-button mobile-press"
            disabled={busy !== null}
            aria-label={`Sign out ${device.name}`}
            onClick={() => void run(`device-${device.id}`, () => onRevoke(device.id))}
          >
            {busy === `device-${device.id}` ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ))}
    </AccountGroup>
  )
}

function RestoreSheet({ entry, busy, onClose, onRestore }: { entry: VaultHistoryEntry; busy: boolean; onClose: () => void; onRestore: () => Promise<void> }) {
  return (
    <BottomSheet title="Restore this version?" onClose={onClose}>
      <div className="mobile-account-sheet-body">
        <p>This copies the vault from {dateFormatter.format(entry.updatedAt)} forward as the newest version.</p>
        <button className="mobile-account-primary mobile-press" type="button" disabled={busy} onClick={() => void onRestore()}>
          {busy ? 'Restoring…' : 'Restore earlier version'}
        </button>
        <button className="mobile-account-secondary mobile-press" type="button" onClick={onClose}>Keep current version</button>
      </div>
    </BottomSheet>
  )
}

function PasswordSheet({ busy, onClose, onChange }: { busy: boolean; onClose: () => void; onChange: (current: string, next: string) => Promise<boolean> }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const meter = passwordMeter(next)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!meter.valid) {
      setError('Choose a new password with at least 12 characters')
      return
    }
    setError(null)
    await onChange(current, next)
  }

  return (
    <BottomSheet title="Change password" onClose={onClose}>
      <form className="mobile-account-sheet-body mobile-account-form" onSubmit={(event) => void submit(event)}>
        <AccountField label="Current password" htmlFor="mobile-current-password">
          <input id="mobile-current-password" type="password" autoCapitalize="none" autoCorrect="off" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} />
        </AccountField>
        <AccountField label="New password" htmlFor="mobile-new-password">
          <input id="mobile-new-password" type="password" autoCapitalize="none" autoCorrect="off" autoComplete="new-password" minLength={12} required value={next} onChange={(event) => { setNext(event.target.value); if (error) setError(null) }} />
        </AccountField>
        <PasswordMeter password={next} />
        {error && <p className="mobile-account-error" role="alert">{error}</p>}
        <button className="mobile-account-primary mobile-press" type="submit" disabled={busy}>{busy ? 'Changing password…' : 'Change password'}</button>
      </form>
    </BottomSheet>
  )
}

function DeleteSheet({ email, busy, onClose, onDelete }: { email: string; busy: boolean; onClose: () => void; onDelete: (password: string) => Promise<boolean> }) {
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const matches = normalizeEmail(confirmation) === normalizeEmail(email)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!matches) {
      setError(`Type ${email} to confirm`)
      return
    }
    setError(null)
    await onDelete(password)
  }

  return (
    <BottomSheet title="Delete Maru account" onClose={onClose}>
      <form className="mobile-account-sheet-body mobile-account-form" onSubmit={(event) => void submit(event)}>
        <p className="mobile-account-destructive-copy">This permanently deletes your encrypted vault, devices and subscription. Local Gmail data stays on this iPhone.</p>
        <AccountField label={`Type ${email} to confirm`} htmlFor="mobile-delete-email">
          <input id="mobile-delete-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} required value={confirmation} onChange={(event) => { setConfirmation(event.target.value); if (error) setError(null) }} />
        </AccountField>
        <AccountField label="Password" htmlFor="mobile-delete-password">
          <input id="mobile-delete-password" type="password" autoCapitalize="none" autoCorrect="off" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </AccountField>
        {error && <p className="mobile-account-error" role="alert">{error}</p>}
        <button className="mobile-account-primary is-destructive mobile-press" type="submit" disabled={!matches || !password || busy}>
          {busy ? 'Deleting account…' : 'Delete Maru account'}
        </button>
      </form>
    </BottomSheet>
  )
}

function AccountGroup({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <section className="mobile-account-group">
      <h3>{title}</h3>
      <div>{children}</div>
      {footer && <p className="mobile-account-group-footer">{footer}</p>}
    </section>
  )
}

function AccountRow({ icon, title, detail, destructive = false, disabled = false, onClick }: { icon: ReactNode; title: string; detail?: string; destructive?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={`mobile-account-row mobile-account-action-row mobile-press${destructive ? ' is-destructive' : ''}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={detail ? `${title}. ${detail}` : title}
    >
      <span className="mobile-account-row-icon" aria-hidden>{icon}</span>
      <span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
      <ChevronRight size={17} aria-hidden />
    </button>
  )
}

function AccountField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label className="mobile-account-field" htmlFor={htmlFor}><span>{label}</span>{children}</label>
}

function PasswordMeter({ password }: { password: string }) {
  const meter = passwordMeter(password)
  return (
    <div className="mobile-account-meter" aria-live="polite">
      <span><i style={{ width: `${meter.percent}%` }} /></span>
      <small>{meter.label}</small>
    </div>
  )
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message
  return 'Unable to continue. Check your connection and try again.'
}
