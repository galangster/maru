import { useCallback, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'

import { type VaultHistoryEntry } from '@/core/account'
import { normalizeEmail } from '@/core/service/vault-port'
import { useMaruAccount } from '@/features/settings/account/account-store'
import {
  accountDate,
  entitlementCopy,
  passwordMeter,
  type PasswordMeterValue,
} from '@/features/settings/account/entitlement-copy'
import { useBusyAction } from '@/features/settings/account/use-busy-action'
import { useUi } from '@/features/mail/ui-store'
import { elapsedTime } from '@/lib/format'
import { openExternalUrl } from '@/lib/env'
import { useNow } from '@/lib/use-now'
import { BottomSheet } from '@/mobile/components/bottom-sheet'
import { MobileIcon } from '@/mobile/components/mobile-icon'
import { MobileListSkeleton, MobilePrompt } from '@/mobile/components/placeholders'
import type { MobileSheet } from '@/mobile/state'
import { useEdgeBack } from '@/mobile/use-edge-back'
import { useModalFocus } from '@/mobile/use-modal-focus'
import { syncLabel, syncTitle } from './account-logic'
import './account-screen.css'

type AuthMode = 'signIn' | 'signUp' | 'recover'

export function AccountScreen({
  onBack,
  backLabel,
  sheet,
  openSheet,
  closeSheet,
}: {
  onBack: () => void
  /** The screen underneath, named. The account route is reached from Settings
      and, since the notification offer, from the inbox — a back control that
      says "Settings" and lands on the inbox is a small lie the whole screen
      has to carry. */
  backLabel: string
  sheet: MobileSheet | null
  openSheet: (sheet: MobileSheet) => void
  closeSheet: () => void
}) {
  const loading = useMaruAccount((state) => state.loading)
  const pending = useMaruAccount((state) => state.pending)
  const email = useMaruAccount((state) => state.email)
  const edge = useEdgeBack(onBack)

  return (
    <section
      className={`mobile-screen mobile-account-screen${edge.settling ? ' is-settling' : ''}`}
      style={{ transform: `translateX(${edge.offset}px)` }}
      {...edge.handlers}
      aria-label="Maru account"
    >
      <header className="mobile-nav mobile-account-nav" inert={Boolean(pending || sheet)}>
        <button className="mobile-nav-back" type="button" onClick={onBack} aria-label={`Back to ${backLabel}`}>
          <MobileIcon name="chevronRight" className="mobile-icon-back" scale="large" />
          <span>{backLabel}</span>
        </button>
        <h1>Maru account</h1>
        <span className="mobile-account-nav-spacer" aria-hidden />
      </header>

      {loading ? (
        <MobileListSkeleton />
      ) : pending ? (
        <RecoveryCeremony />
      ) : email ? (
        <SignedIn sheet={sheet} openSheet={openSheet} closeSheet={closeSheet} />
      ) : (
        <SignedOut />
      )}
    </section>
  )
}

function SignedOut() {
  const explanation = useMaruAccount((state) => state.explanation)
  const signUp = useMaruAccount((state) => state.signUp)
  const signIn = useMaruAccount((state) => state.signIn)
  const recover = useMaruAccount((state) => state.recover)
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
      if (mode === 'signUp') await signUp(email, password)
      else if (mode === 'recover') await recover(email, phrase, password)
      else await signIn(email, password)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const actionLabel = mode === 'signUp' ? 'Create account' : mode === 'recover' ? 'Recover account' : 'Sign in'

  return (
    <div className="mobile-scroll mobile-account-scroll mobile-account-auth">
      <MobilePrompt
        className="mobile-account-intro"
        icon={<MobileIcon name="sync" scale="hero" />}
        title="Take Maru with you"
        copy="Restore your settings and Gmail account list on this iPhone."
      >
        {explanation && <p className="mobile-account-note" role="status">{explanation}</p>}
      </MobilePrompt>

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

        {mode !== 'signIn' && <PasswordMeter meter={meter} />}
        {error && <p className="mobile-account-error" role="alert">{error}</p>}

        <button className="mobile-button-primary mobile-press" type="submit" disabled={busy}>
          {busy ? `${actionLabel}…` : actionLabel}
        </button>
      </form>
    </div>
  )
}

function RecoveryCeremony() {
  const pending = useMaruAccount((state) => state.pending)
  const confirmRecoverySaved = useMaruAccount((state) => state.confirmRecoverySaved)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const phrase = pending?.phrase ?? ''
  const words = phrase.split(' ')
  const dialogRef = useModalFocus<HTMLDivElement>()

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
      await confirmRecoverySaved()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={dialogRef} className="mobile-account-ceremony-layer" role="dialog" aria-modal="true" aria-labelledby="mobile-recovery-title" tabIndex={-1}>
      <div className="mobile-account-ceremony-nav">
        <h2 id="mobile-recovery-title">Save your recovery words</h2>
        <button type="button" className="mobile-account-copy mobile-press" onClick={() => void copy()} aria-label="Copy all 12 recovery words">
          <MobileIcon name="file" />
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
          <span className="mobile-account-checkbox"><MobileIcon name="success" /></span>
          <strong>I saved these 12 words somewhere safe</strong>
        </label>
        {error && <p className="mobile-account-error" role="alert">{error}</p>}
        <button className="mobile-button-primary mobile-press" type="button" disabled={!saved || busy} onClick={() => void activate()}>
          {busy ? 'Activating account…' : 'Activate account'}
        </button>
      </div>
    </div>
  )
}

function SignedIn({
  sheet,
  openSheet,
  closeSheet,
}: {
  sheet: MobileSheet | null
  openSheet: (sheet: MobileSheet) => void
  closeSheet: () => void
}) {
  const email = useMaruAccount((state) => state.email)
  const entitlement = useMaruAccount((state) => state.entitlement)
  const explanation = useMaruAccount((state) => state.explanation)
  const history = useMaruAccount((state) => state.history)
  const restoreVersion = useMaruAccount((state) => state.restoreVersion)
  const changePassword = useMaruAccount((state) => state.changePassword)
  const signOut = useMaruAccount((state) => state.signOut)
  const deleteAccount = useMaruAccount((state) => state.deleteAccount)
  const pendingAccounts = useUi((state) => state.pendingAccounts)
  const [error, setError] = useState<string | null>(null)
  const now = useNow()
  const onError = useCallback((cause: Error) => setError(errorMessage(cause)), [])
  const { isBusy, run } = useBusyAction(onError)

  return (
    <>
      <div className="mobile-scroll mobile-account-scroll mobile-account-signed-in" inert={sheet !== null}>
        <section className="mobile-account-profile" aria-label="Account summary">
          <span className="mobile-account-mark"><MobileIcon name="sync" scale="hero" /></span>
          <div>
            <h2>{email}</h2>
            {entitlement && <p>{entitlementCopy(entitlement, now)}</p>}
          </div>
        </section>

        {explanation && <p className="mobile-account-note" role="status">{explanation}</p>}
        {error && <p className="mobile-account-error mobile-account-page-error" role="alert">{error}</p>}

        <SyncRow onError={onError} />

        <AccountGroup title="Subscription">
          <AccountRow
            icon={<MobileIcon name="external" />}
            title="Manage on getmaru.app"
            detail="Opens in your browser"
            // The phone has no purchase control, so it opens the web account instead of manageSubscription().
            onClick={() => void openExternalUrl('https://getmaru.app/account').catch(onError)}
          />
        </AccountGroup>

        <Devices now={now} onError={onError} />

        {pendingAccounts.length > 0 && (
          <AccountGroup title="Gmail accounts" footer="Available when Gmail sign-in reaches the phone (I3)">
            {pendingAccounts.map((email) => (
              <div className="mobile-row mobile-account-row mobile-account-disabled-row" key={email} aria-label={`${email}. Sign in on this iPhone. Disabled`}>
                <span className="mobile-row-icon mobile-account-row-icon"><MobileIcon name="unread" /></span>
                <span><strong>{email}</strong><small>Restored from your Maru account</small></span>
                <button type="button" disabled aria-label={`Sign in to ${email} on this iPhone, unavailable until I3`}>Sign in on this iPhone</button>
              </div>
            ))}
          </AccountGroup>
        )}

        <AccountGroup title="Restore an earlier version">
          {history.length === 0 ? (
            <div className="mobile-row mobile-account-empty-row">No earlier versions yet.</div>
          ) : history.map((entry) => (
            <AccountRow
              key={entry.version}
              icon={<MobileIcon name="sync" />}
              title={accountDate(entry.updatedAt)}
              detail={`Version ${entry.version}`}
              onClick={() => openSheet({ kind: 'accountRestore', entry })}
            />
          ))}
        </AccountGroup>

        <AccountGroup title="Account controls">
          <AccountRow icon={<MobileIcon name="key" />} title="Change password" onClick={() => openSheet({ kind: 'accountPassword' })} />
          <AccountRow
            icon={<MobileIcon name="settings" />}
            title={isBusy('signout') ? 'Signing out…' : 'Sign out'}
            disabled={isBusy('signout')}
            onClick={() => void run('signout', signOut)}
          />
          <AccountRow icon={<MobileIcon name="trash" />} title="Delete account" destructive onClick={() => openSheet({ kind: 'accountDelete' })} />
        </AccountGroup>
      </div>

      {sheet?.kind === 'accountRestore' && (
        <RestoreSheet
          entry={sheet.entry}
          busy={isBusy(`restore-${sheet.entry.version}`)}
          onClose={closeSheet}
          onRestore={async () => {
            const ok = await run(`restore-${sheet.entry.version}`, () => restoreVersion(sheet.entry.version))
            if (ok) closeSheet()
          }}
        />
      )}
      {sheet?.kind === 'accountPassword' && (
        <PasswordSheet
          busy={isBusy('password')}
          onClose={closeSheet}
          onChange={async (current, next) => {
            const ok = await run('password', () => changePassword(current, next))
            if (ok) closeSheet()
            return ok
          }}
        />
      )}
      {sheet?.kind === 'accountDelete' && (
        <DeleteSheet
          email={email!}
          busy={isBusy('delete')}
          onClose={closeSheet}
          onDelete={(password) => run('delete', () => deleteAccount(password))}
        />
      )}
    </>
  )
}

function SyncRow({ onError }: { onError: (error: Error) => void }) {
  const syncState = useMaruAccount((state) => state.syncState)
  const { isBusy, run } = useBusyAction(onError)

  return (
    <AccountGroup title="Sync">
      <div className="mobile-row mobile-account-status-row" aria-live="polite">
        <span className={`mobile-row-icon mobile-account-status-icon is-${syncState.kind}`}>
          <MobileIcon name={syncState.kind === 'paused' ? 'warning' : 'sync'} />
        </span>
        <span>
          <strong>{syncTitle(syncState)}</strong>
          <small>{syncLabel(syncState)}</small>
        </span>
        {syncState.kind === 'paused' && (
          <button
            type="button"
            className="mobile-account-inline-button mobile-press"
            disabled={isBusy('retry')}
            onClick={() => void run('retry', useMaruAccount.getState().retrySync)}
          >
            {isBusy('retry') ? 'Retrying…' : 'Retry'}
          </button>
        )}
      </div>
    </AccountGroup>
  )
}

function Devices({
  now,
  onError,
}: {
  now: number
  onError: (error: Error) => void
}) {
  const devices = useMaruAccount((state) => state.devices)
  const { isBusy, run } = useBusyAction(onError)
  const current = devices.find((device) => device.current)
  const others = devices.filter((device) => !device.current)

  return (
    <AccountGroup title="Devices">
      {current && (
        <form
          className="mobile-row mobile-account-device-form"
          onSubmit={(event) => {
            event.preventDefault()
            const name = String(new FormData(event.currentTarget).get('device-name') ?? '').trim()
            if (name && name !== current.name) {
              void run(`device-${current.id}`, () => useMaruAccount.getState().renameDevice(current.id, name))
            }
          }}
        >
          <label htmlFor="mobile-device-name">
            <span>This device</span>
            <input id="mobile-device-name" name="device-name" type="text" defaultValue={current.name} autoCapitalize="words" autoComplete="off" spellCheck={false} />
          </label>
          <button className="mobile-account-inline-button mobile-press" type="submit" disabled={isBusy(`device-${current.id}`)}>
            {isBusy(`device-${current.id}`) ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
      {others.map((device) => (
        <div className="mobile-row mobile-account-row mobile-account-device-row" key={device.id}>
          <span className="mobile-row-icon mobile-account-row-icon"><MobileIcon name="settings" /></span>
          <span><strong>{device.name}</strong><small>Seen {elapsedTime(device.lastSeenAt, now)}</small></span>
          <button
            type="button"
            className="mobile-account-danger-button mobile-press"
            disabled={isBusy(`device-${device.id}`)}
            aria-label={`Sign out ${device.name}`}
            onClick={() => void run(`device-${device.id}`, () => useMaruAccount.getState().revokeDevice(device.id))}
          >
            {isBusy(`device-${device.id}`) ? 'Signing out…' : 'Sign out'}
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
        <p>This copies the vault from {accountDate(entry.updatedAt)} forward as the newest version.</p>
        <button className="mobile-button-primary mobile-press" type="button" disabled={busy} onClick={() => void onRestore()}>
          {busy ? 'Restoring…' : 'Restore earlier version'}
        </button>
        <button className="mobile-button-secondary mobile-press" type="button" onClick={onClose}>Keep current version</button>
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
        <PasswordMeter meter={meter} />
        {error && <p className="mobile-account-error" role="alert">{error}</p>}
        <button className="mobile-button-primary mobile-press" type="submit" disabled={busy}>{busy ? 'Changing password…' : 'Change password'}</button>
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
        <button className="mobile-button-primary is-destructive mobile-press" type="submit" disabled={!matches || !password || busy}>
          {busy ? 'Deleting account…' : 'Delete Maru account'}
        </button>
      </form>
    </BottomSheet>
  )
}

function AccountGroup({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <section className="mobile-group mobile-account-group">
      <h3>{title}</h3>
      <div>{children}</div>
      {footer && <p className="mobile-account-group-footer">{footer}</p>}
    </section>
  )
}

function AccountRow({ icon, title, detail, destructive = false, disabled = false, onClick }: { icon: ReactNode; title: string; detail?: string; destructive?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={`mobile-row mobile-account-row mobile-account-action-row mobile-press${destructive ? ' is-destructive' : ''}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={detail ? `${title}. ${detail}` : title}
    >
      <span className="mobile-row-icon mobile-account-row-icon">{icon}</span>
      <span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
      <MobileIcon name="chevronRight" />
    </button>
  )
}

function AccountField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label className="mobile-account-field" htmlFor={htmlFor}><span>{label}</span>{children}</label>
}

function PasswordMeter({ meter }: { meter: PasswordMeterValue }) {
  return (
    <div className="mobile-account-meter" aria-live="polite">
      <span><i style={{ '--fill': meter.percent / 100 } as CSSProperties} /></span>
      <small>{meter.label}</small>
    </div>
  )
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message
  return 'Unable to continue. Check your connection and try again.'
}
