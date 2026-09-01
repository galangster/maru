import { useState } from 'react'

import { PrimaryButton, SECTION_LABEL, TextField, textButtonClass } from '@/components/wren-controls'
import { normalizeEmail } from '@/core/account'
import { useBusyAction } from './use-busy-action'

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
  const [message, setMessage] = useState<string | null>(null)
  const { busy, run } = useBusyAction()

  return (
    <div className="border-hairline flex flex-col gap-3 border-t pt-4">
      <p className={SECTION_LABEL}>Account controls</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setChanging((value) => !value)} className={textButtonClass('default', 'min-h-10')}>
          Change password
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('signout', onSignOut)}
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
            setMessage(null)
            run('password', async () => {
              await onChangePassword(current, next)
              setChanging(false)
              setCurrent('')
              setNext('')
              setMessage('Password changed.')
            })
          }}
        >
          <TextField id="maru-current-password" label="Current password" type="password" autoComplete="current-password" required value={current} onValueChange={setCurrent} inputClassName="bg-raised h-10" />
          <TextField id="maru-new-password" label="New password" type="password" autoComplete="new-password" minLength={12} required value={next} onValueChange={setNext} inputClassName="bg-raised h-10" />
          <PrimaryButton type="submit" disabled={busy !== null} className="h-10 w-fit px-3">{busy === 'password' ? 'Changing…' : 'Change password'}</PrimaryButton>
        </form>
      )}
      {message && <p className="text-ink-2 text-sm" role="status">{message}</p>}

      <div className="border-destructive/20 flex flex-col gap-2 rounded-md border p-3">
        <div>
          <p className="text-destructive text-sm font-medium">Delete Maru account</p>
          <p className="text-ink-3 text-sm text-pretty">Permanently deletes the encrypted vault, devices and subscription. Local Gmail data stays on this device.</p>
        </div>
        <TextField id="maru-delete-email" label={`Type ${email} to confirm`} type="email" autoComplete="off" spellCheck={false} value={confirm} onValueChange={setConfirm} inputClassName="h-10" />
        <TextField id="maru-delete-password" label="Password" type="password" autoComplete="current-password" value={deletePassword} onValueChange={setDeletePassword} inputClassName="h-10" />
        <button
          type="button"
          disabled={normalizeEmail(confirm) !== normalizeEmail(email) || !deletePassword || busy !== null}
          onClick={() => run('delete', () => onDelete(deletePassword))}
          className={textButtonClass('danger', 'min-h-10 w-fit disabled:pointer-events-none disabled:opacity-40')}
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete Maru account'}
        </button>
      </div>
    </div>
  )
}
