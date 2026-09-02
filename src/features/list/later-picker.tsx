// The Later picker — P21 lane 1.
//
// The one surface that turns "not now" into a time. Three doors open it: `h`
// (or `b`), the row's hover cluster, and the command palette. All three land
// here, so there is one list of times and one place the disclosure is made.
//
// It is a dialog rather than a popover anchored to a row, and that is a
// consequence of the doors rather than a preference: `h` is a global key
// handler with no anchor, and a picker that appears in one place from the mouse
// and another from the keyboard is two surfaces wearing one name.

import { useEffect, useMemo, useRef, useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { ICON_SLOT, KEYCAP_SLOT, Keycap } from '@/components/wren-controls'
import { MAX_DEFER_DAYS, deferAtDate, deferPresets, maxDeferAt } from '@/core/defaults'
import { focusThreadList, useSurfaces } from '@/features/shell/surface-store'
import { wakeTime } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/**
 * The sentence that rides permanently with Later.
 *
 * **The rule, stated here and nowhere else: every surface that offers Later, or
 * lists what Later is holding, carries this sentence verbatim.** No surface
 * keeps its own count of the others, and none restates the promise in its own
 * words — a site that paraphrases is a second promise, and two promises about
 * privacy are one promise too many. Import the constant, or leave it out.
 *
 * Exported so they cannot drift into different promises. Deliberately
 * NOT in the confirmation toast: that fires many times a day, and a permanent
 * caveat on a frequent toast is read as chrome inside a week. And deliberately
 * not a first-run tip — dismissible means misremembered six months later, which
 * is exactly how a limitation turns into a broken promise.
 *
 * Rewritten 2026-09-02 for A9 (owner ruling: yes). Until then it said "saved on
 * this device", which was the whole truth; now it is the truth only when nobody
 * is signed in, and a disclosure that overstates a limitation is as wrong as
 * one that hides it. One sentence still, and still unconditional: it states
 * both cases rather than branching on the account, because a caveat that
 * appears and disappears is a caveat nobody learns.
 *
 * The Gmail half is unchanged and always true. Later reaches no Gmail method
 * on any device, signed in or not — see MARU-ACCOUNT.md §6.
 */
export const LATER_DISCLOSURE =
  "Later follows your Maru account when you're signed in, and stays on this device when you're not. Gmail never sees it, so these still show in Gmail's inbox."

export function isoDay(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Parse an ISO day and enforce the Later window even when input bounds are ignored. */
export function clampedDeferDay(value: string, now: number): number | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return Math.min(deferAtDate(year, month - 1, day), maxDeferAt(now))
}

export interface LaterPickerProps {
  /**
   * Save the target threads for `wakeAt`, or bring them back now with `null`.
   * The picker never mutates: the list owns the selection advance, the held
   * mutation and the undo, and this is the one call that reaches them.
   */
  onCommit: (wakeAt: number | null, target: { keys: string[]; bulk: boolean }) => void
  /** True when every target thread is already saved for later. */
  isDeferred: (keys: string[]) => boolean
}

export function LaterPicker({ onCommit, isDeferred }: LaterPickerProps) {
  const target = useSurfaces((s) => s.later)
  const closeLater = useSurfaces((s) => s.closeLater)
  const now = useNow()

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (next) return
        closeLater()
        focusThreadList()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="bg-raised rounded-xl shadow-lg w-[360px] max-w-[calc(100%-2rem)] gap-0 border-0 p-0 ring-0 sm:max-w-[360px]"
      >
        {target && (
          <PickerBody
            key={target.keys.join(',')}
            target={target}
            now={now}
            deferred={isDeferred(target.keys)}
            onPick={(wakeAt) => {
              closeLater()
              onCommit(wakeAt, target)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({
  target,
  now,
  deferred,
  onPick,
}: {
  target: { keys: string[]; bulk: boolean }
  now: number
  deferred: boolean
  onPick: (wakeAt: number | null) => void
}) {
  const presets = useMemo(() => deferPresets(now), [now])
  const first = useRef<HTMLButtonElement>(null)
  const [custom, setCustom] = useState(false)

  // The first row takes focus, so Enter alone picks the commonest answer and
  // ↓/↑ walk the rest without anyone having to know the digits exist.
  useEffect(() => {
    first.current?.focus()
  }, [])

  // 1..n pick a preset outright. Bound on the dialog rather than globally
  // because the keymap has already stood down — `anyDialogOpen()` — which is
  // what keeps `1` from meaning two things at once.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const index = Number(event.key) - 1
    if (!Number.isInteger(index) || index < 0 || index >= presets.length) return
    event.preventDefault()
    onPick(presets[index].wakeAt)
  }

  const count = target.keys.length
  const title = target.bulk
    ? `Save ${count} thread${count === 1 ? '' : 's'} for later`
    : deferred
      ? 'Change when it comes back'
      : 'Save for later'

  return (
    <div onKeyDown={onKeyDown}>
      <DialogTitle className="font-ui text-ink px-4 pt-4 pb-2 text-base font-semibold">
        {title}
      </DialogTitle>
      <DialogDescription className="sr-only">
        Choose when this comes back to your inbox. {LATER_DISCLOSURE}
      </DialogDescription>

      <ul className="flex flex-col gap-1 px-2 pb-2">
        {presets.map((preset, index) => (
          <li key={preset.id}>
            <PickerRow
              ref={index === 0 ? first : undefined}
              icon="calendar"
              label={preset.label}
              detail={preset.detail}
              hint={String(index + 1)}
              onClick={() => onPick(preset.wakeAt)}
            />
          </li>
        ))}

        <li>
          {custom ? (
            <CustomDate now={now} onPick={onPick} />
          ) : (
            <PickerRow
              icon="calendar"
              label="Pick a date…"
              detail={`up to ${MAX_DEFER_DAYS} days`}
              onClick={() => setCustom(true)}
            />
          )}
        </li>

        {/* Only when there is a deferral to take off. An always-present
            "bring it back now" on a thread that was never saved is a control
            that does nothing, and the person cannot tell which case they are
            in from the row itself. */}
        {deferred && (
          <li>
            <PickerRow
              icon="inbox"
              label="Bring it back now"
              onClick={() => onPick(null)}
            />
          </li>
        )}
      </ul>

      {/* The disclosure at the point of the action, every single time. A rule
          above it rather than a card around it: it is a caveat on the choice
          just made, not a fifth option. */}
      <p className="border-hairline text-ink-3 border-t px-4 py-3 text-xs text-pretty">
        {LATER_DISCLOSURE}
      </p>
    </div>
  )
}

function PickerRow({
  ref,
  icon,
  label,
  detail,
  hint,
  onClick,
}: {
  ref?: React.Ref<HTMLButtonElement>
  icon: 'calendar' | 'inbox'
  label: string
  detail?: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-row font-ui text-ink flex h-9 w-full items-center gap-2 px-2 text-left text-base outline-none',
        'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        'focus-ring hover:bg-fill-hover focus-visible:bg-fill-hover',
      )}
    >
      <span className={ICON_SLOT}>
        <Icon name={icon} size={18} className="text-ink-3" />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="text-ink-3 shrink-0 text-xs tabular-nums">{detail}</span>}
      {/* The keycap's column, reserved whether or not this row has one — issue
          #37. Four preset rows right-aligned their time at one x and put a
          digit in a column beyond it; the fifth, "Pick a date…", has no digit,
          so "up to 30 days" ran 28 px past where the four above it stop and
          into the empty keycap column. In a five-row menu, one row broke the
          column the other four establish. A slot rather than a conditional
          keeps every meta value ending at the same x. */}
      <span className={KEYCAP_SLOT}>{hint && <Keycap>{hint}</Keycap>}</span>
    </button>
  )
}

/**
 * The custom date, capped at MAX_DEFER_DAYS.
 *
 * The cap is a real constraint rather than a taste: `resyncWindow` deletes local
 * threads outside the 90-day sync window, so a thread saved six months out whose
 * last message is already old would be evicted with its deferral and the promise
 * would evaporate silently. `max` on the input is what stops that being
 * reachable, and the sentence under it is why.
 */
function CustomDate({ now, onPick }: { now: number; onPick: (wakeAt: number) => void }) {
  const min = isoDay(now + 86_400_000)
  const max = isoDay(maxDeferAt(now))

  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <input
        type="date"
        autoFocus
        min={min}
        max={max}
        aria-label="Bring it back on"
        onChange={(event) => {
          const at = clampedDeferDay(event.target.value, now)
          if (at !== null) onPick(at)
        }}
        className="text-ink bg-sunken focus-ring h-9 w-full rounded-inset px-2 text-base outline-none"
      />
      <span className="text-ink-3 px-1 text-xs">
        Mail older than 90 days leaves Maru, so Later stops at {MAX_DEFER_DAYS} days.
      </span>
    </div>
  )
}
