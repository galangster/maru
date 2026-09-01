import { useState } from 'react'

import { PrimaryButton, textButtonClass } from '@/components/wren-controls'
import type { AccountDevice } from '@/core/account'
import { elapsedTime } from '@/lib/format'

export function Devices({
  devices,
  onRename,
  onRevoke,
}: {
  devices: AccountDevice[]
  onRename(id: string, name: string): Promise<void>
  onRevoke(id: string): Promise<void>
}) {
  const current = devices.find((item) => item.current)
  const [name, setName] = useState(current?.name ?? '')
  const [busy, setBusy] = useState<string | null>(null)

  return (
    <div className="border-hairline flex flex-col gap-3 border-t pt-4">
      <p className="text-ink-3 text-xs font-medium tracking-wide uppercase">Devices</p>
      {current && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const next = name.trim()
            if (!next || next === current.name) return
            setBusy(current.id)
            void onRename(current.id, next).finally(() => setBusy(null))
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1" htmlFor="maru-device-name">
            <span className="text-ink-3 text-xs">This device</span>
            <input
              id="maru-device-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="bg-sunken text-ink focus-ring h-10 rounded-sm px-3 text-base"
            />
          </label>
          <PrimaryButton type="submit" disabled={busy !== null || !name.trim()} className="h-10 px-3">
            {busy === current.id ? 'Saving…' : 'Save name'}
          </PrimaryButton>
        </form>
      )}
      <ul className="flex flex-col gap-1">
        {devices.filter((item) => !item.current).map((item) => (
          <li key={item.id} className="flex min-h-10 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-sm">{item.name}</p>
              <p className="text-ink-3 text-xs tabular-nums">Seen {elapsedTime(item.lastSeenAt, Date.now())}</p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => { setBusy(item.id); void onRevoke(item.id).finally(() => setBusy(null)) }}
              className={textButtonClass('danger', 'min-h-10')}
            >
              {busy === item.id ? 'Signing out…' : 'Sign out'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
