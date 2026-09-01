import { useState } from 'react'

import { PrimaryButton, SegmentedGroup } from '@/components/wren-controls'
import { cn } from '@/lib/utils'

type Mode = 'signIn' | 'signUp' | 'recover'

function strength(password: string): { label: string; value: number } {
  if (password.length < 12) return { label: `${12 - password.length} more characters`, value: Math.min(35, password.length * 3) }
  let value = 55
  if (password.length >= 16) value += 15
  if (/[a-z]/u.test(password) && /[A-Z]/u.test(password)) value += 10
  if (/\d/u.test(password)) value += 10
  if (/[^\p{L}\p{N}]/u.test(password)) value += 10
  return { label: value >= 80 ? 'Strong' : 'Good', value: Math.min(value, 100) }
}

export function SignIn({
  explanation,
  onSignIn,
  onSignUp,
  onRecover,
}: {
  explanation: string | null
  onSignIn(email: string, password: string): Promise<void>
  onSignUp(email: string, password: string): Promise<void>
  onRecover(email: string, phrase: string, password: string): Promise<void>
}) {
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const meter = strength(password)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (mode !== 'signIn' && password.length < 12) {
      setError('Choose a password with at least 12 characters')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signUp') await onSignUp(email, password)
      else if (mode === 'recover') await onRecover(email, phrase, password)
      else await onSignIn(email, password)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to continue. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-ink text-base font-medium">Sync this Maru</p>
        <p className="text-ink-3 text-sm text-pretty">
          Restore your settings, Gmail accounts and desktop sign-ins on another computer.
        </p>
        {explanation && <p className="text-ink-2 text-sm" role="status">{explanation}</p>}
      </div>

      <SegmentedGroup
        label="Maru account action"
        value={mode}
        onChange={(value) => { setMode(value); setError(null) }}
        options={[
          { id: 'signIn', label: 'Sign in' },
          { id: 'signUp', label: 'Sign up' },
          { id: 'recover', label: 'Recover' },
        ]}
      />

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1" htmlFor="maru-account-email">
          <span className="text-ink-3 text-xs font-medium tracking-wide uppercase">Email</span>
          <input
            id="maru-account-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className="bg-sunken text-ink placeholder:text-ink-3 focus-ring h-10 rounded-sm px-3 text-base"
          />
        </label>
        {mode === 'recover' && (
          <label className="flex flex-col gap-1" htmlFor="maru-recovery-phrase">
            <span className="text-ink-3 text-xs font-medium tracking-wide uppercase">Recovery words</span>
            <textarea
              id="maru-recovery-phrase"
              required
              rows={3}
              autoComplete="off"
              spellCheck={false}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              placeholder="Enter all 12 words in order"
              className="bg-sunken text-ink placeholder:text-ink-3 focus-ring rounded-sm px-3 py-2 text-base"
            />
          </label>
        )}
        <label className="flex flex-col gap-1" htmlFor="maru-account-password">
          <span className="text-ink-3 text-xs font-medium tracking-wide uppercase">
            {mode === 'recover' ? 'New password' : 'Password'}
          </span>
          <input
            id="maru-account-password"
            type="password"
            required
            minLength={mode === 'signIn' ? undefined : 12}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => { setPassword(event.target.value); if (error) setError(null) }}
            className="bg-sunken text-ink focus-ring h-10 rounded-sm px-3 text-base"
          />
        </label>
        {mode !== 'signIn' && (
          <div className="flex items-center gap-2" aria-live="polite">
            <div className="bg-fill-hover h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className={cn('h-full rounded-full transition-[width,background-color] duration-150', meter.value >= 80 ? 'bg-success' : 'bg-brand')}
                style={{ width: `${meter.value}%` }}
              />
            </div>
            <span className="text-ink-3 min-w-28 text-right text-xs tabular-nums">{meter.label}</span>
          </div>
        )}
        {error && <p className="text-destructive text-sm text-pretty" role="alert">{error}</p>}
        <PrimaryButton type="submit" disabled={busy} className="h-10 w-fit px-4">
          {busy ? 'Working…' : mode === 'signUp' ? 'Create account' : mode === 'recover' ? 'Recover account' : 'Sign in'}
        </PrimaryButton>
      </form>
    </div>
  )
}
