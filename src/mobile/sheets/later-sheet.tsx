import { useMemo } from 'react'

import {
  MAX_DEFER_DAYS,
  clampedDeferDay,
  deferPresets,
  isoDay,
  maxDeferAt,
  minDeferAt,
} from '@/core/defaults'
import { LATER_DISCLOSURE } from '@/features/list/later-picker'
import { plural } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { BottomSheet } from '../components/bottom-sheet'
import { MobileIcon } from '../components/mobile-icon'

export function LaterSheet({ count, onClose, onPick }: { count: number; onClose: () => void; onPick: (wakeAt: number) => void }) {
  const now = useNow()
  const presets = useMemo(() => deferPresets(now), [now])
  // "conversation" in the title: what the phone calls the object everywhere
  // else, and what the toast this sheet produces already said. The title said
  // "threads" over a toast that said "conversations".
  return (
    <BottomSheet title={count > 1 ? `Save ${plural(count, 'conversation')} for later` : 'Save for later'} onClose={onClose}>
      <div className="mobile-later-options">
        {presets.map((preset) => <button type="button" key={preset.id} onClick={() => onPick(preset.wakeAt)}><span className="mobile-sheet-icon"><MobileIcon name="calendar" scale="action" /></span><span><strong>{preset.label}</strong><small>{preset.detail}</small></span><MobileIcon name="chevronRight" /></button>)}
        <label className="mobile-custom-date"><span className="mobile-sheet-icon"><MobileIcon name="calendar" scale="action" /></span><span><strong>Pick a date</strong><small>Tomorrow at the earliest, {MAX_DEFER_DAYS} days at the latest</small></span><input type="date" aria-label="Bring it back on" min={isoDay(minDeferAt(now))} max={isoDay(maxDeferAt(now))} onChange={(event) => { const at = clampedDeferDay(event.target.value, now); if (at !== null) onPick(at) }} /><MobileIcon name="chevronRight" /></label>
      </div>
      <p className="mobile-later-note">{LATER_DISCLOSURE}</p>
    </BottomSheet>
  )
}
