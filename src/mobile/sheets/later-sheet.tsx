import { useMemo } from 'react'

import { MAX_DEFER_DAYS, deferPresets, maxDeferAt } from '@/core/defaults'
import { LATER_DISCLOSURE, clampedDeferDay, isoDay } from '@/features/list/later-picker'
import { useNow } from '@/lib/use-now'
import { BottomSheet } from '../components/bottom-sheet'
import { MobileIcon } from '../components/mobile-icon'

export function LaterSheet({ count, onClose, onPick }: { count: number; onClose: () => void; onPick: (wakeAt: number) => void }) {
  const now = useNow()
  const presets = useMemo(() => deferPresets(now), [now])
  return (
    <BottomSheet title={count > 1 ? `Save ${count} threads for later` : 'Save for later'} onClose={onClose}>
      <div className="mobile-later-options">
        {presets.map((preset) => <button type="button" key={preset.id} onClick={() => onPick(preset.wakeAt)}><span className="mobile-sheet-icon"><MobileIcon name="calendar" scale="action" /></span><span><strong>{preset.label}</strong><small>{preset.detail}</small></span><MobileIcon name="chevronRight" /></button>)}
        <label className="mobile-custom-date"><span className="mobile-sheet-icon"><MobileIcon name="calendar" scale="action" /></span><span><strong>Pick a date</strong><small>Up to {MAX_DEFER_DAYS} days</small></span><input type="date" aria-label="Bring it back on" min={isoDay(now + 86_400_000)} max={isoDay(maxDeferAt(now))} onChange={(event) => { const at = clampedDeferDay(event.target.value, now); if (at !== null) onPick(at) }} /><MobileIcon name="chevronRight" /></label>
      </div>
      <p className="mobile-later-note">{LATER_DISCLOSURE}</p>
    </BottomSheet>
  )
}
