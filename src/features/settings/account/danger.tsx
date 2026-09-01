import { useState } from 'react'

import { PrimaryButton, textButtonClass } from '@/components/wren-controls'

export function Danger({
  email,
  onChangePassword,
  onSignOut,
  onDelete,
}: {
  email: string
  onChangePassword(current: string, next: string): Promise<void>
  onSignOut(): Promise<void>
  onDelete(password: string): Promise<void>
}) {
  const [changing, setChanging] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="border-hairline flex flex-col gap-3 border-t pt-4">
      <p className="text-ink-3 text-xs font-medium tracking-wide uppercase">Account controls</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setChanging((value) => !value)} className={textButtonClass('default', 'min-h-10')}>
          Change password
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => { setBusy('signout'); void onSignOut().finally(() => setBusy(null)) }}
          className={textButtonClass('default', 'min-h-10')}
        >
          {busy === 'signout' ? 'Signing out…' : 'Sign out of Maru account'}
        </button>
      </div>
      {changing && (
        <form
          className="bg-sunken flex flex-col gap-2 rounded-md p-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (next.length < 12) { setMessage('Choose a new password with at least 12 characters'); return }
            setBusy('password'); setMessage(null)
            void onChangePassword(current, next).then(() => { setChanging(false); setCurrent(''); setNext(''); setMessage('Password changed.') }).catch((error: Error) => setMessage(error.message)).finally(() => setBusy(null))
          }}
        >
          <label className="text-ink-2 flex flex-col gap-1 text-sm" htmlFor="maru-current-password">
            Current password
            <input id="maru-current-password" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} className="bg-raised text-ink focus-ring h-10 rounded-sm px-3 text-base" />
          </label>
          <label className="text-ink-2 flex flex-col gap-1 text-sm" htmlFor="maru-new-password">
            New password
            <input id="maru-new-password" type="password" autoComplete="new-password" minLength={12} required value={next} onChange={(event) => setNext(event.target.value)} className="bg-raised text-ink focus-ring h-10 rounded-sm px-3 text-base" />
          </label>
          <PrimaryButton type="submit" disabled={busy !== null} className="h-10 w-fit px-3">{busy === 'password' ? 'Changing…' : 'Change password'}</PrimaryButton>
        </form>
      )}
      {message && <p className="text-ink-2 text-sm" role="status">{message}</p>}

      <div className="border-destructive/20 flex flex-col gap-2 rounded-md border p-3">
        <div>
          <p className="text-destructive text-sm font-medium">Delete Maru account</p>
          <p className="text-ink-3 text-sm text-pretty">Permanently deletes the encrypted vault, devices and subscription. Local Gmail data stays on this device.</p>
        </div>
        <label className="text-ink-2 flex flex-col gap-1 text-sm" htmlFor="maru-delete-email">
          Type {email} to confirm
          <input id="maru-delete-email" type="email" autoComplete="off" spellCheck={false} value={confirm} onChange={(event) => setConfirm(event.target.value)} className="bg-sunken text-ink focus-ring h-10 rounded-sm px-3 text-base" />
        </label>
        <label className="text-ink-2 flex flex-col gap-1 text-sm" htmlFor="maru-delete-password">
          Password
          <input id="maru-delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="bg-sunken text-ink focus-ring h-10 rounded-sm px-3 text-base" />
        </label>
        <button
          type="button"
          disabled={confirm.trim().toLowerCase() !== email.toLowerCase() || !deletePassword || busy !== null}
          onClick={() => { setBusy('delete'); void onDelete(deletePassword).finally(() => setBusy(null)) }}
          className={textButtonClass('danger', 'min-h-10 w-fit disabled:pointer-events-none disabled:opacity-40')}
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete Maru account'}
        </button>
      </div>
    </div>
  )
}

