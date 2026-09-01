import { PrimaryButton, SECTION_LABEL, TextField, textButtonClass } from '@/components/wren-controls'
import type { AccountDevice } from '@/core/account'
import { elapsedTime } from '@/lib/format'
import { useBusyAction } from './use-busy-action'

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
  const { busy, run } = useBusyAction()

  return (
    <div className="border-hairline flex flex-col gap-3 border-t pt-4">
      <p className={SECTION_LABEL}>Devices</p>
      {current && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const next = String(new FormData(event.currentTarget).get('device-name') ?? '').trim()
            if (!next || next === current.name) return
            run(current.id, () => onRename(current.id, next))
          }}
        >
          <TextField id="maru-device-name" name="device-name" label="This device" value={current.name} autoComplete="off" spellCheck={false} className="min-w-0 flex-1" inputClassName="h-10" />
          <PrimaryButton type="submit" disabled={busy !== null} className="h-10 px-3">
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
              onClick={() => run(item.id, () => onRevoke(item.id))}
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
