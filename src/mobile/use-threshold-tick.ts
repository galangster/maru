import { useCallback, useMemo, useRef } from 'react'

import { nativeShell } from '@/platform/shell'

/**
 * The tap a drag gives when it crosses its threshold.
 *
 * Both one-finger surfaces in the shell want the same three-part bargain, and
 * both had their own copy of it: warm the haptic engine when the gesture
 * starts, tap once on the way *past* the threshold, and forget the crossing
 * when the gesture settles.
 *
 * The details that are easy to get wrong, and the reason this is one helper:
 *
 * - `prepare()` is called at the start rather than at the crossing. The tap
 *   has to land on the frame the copy changes -- "Release to refresh", or the
 *   action behind a row becoming the thing that will happen -- and the engine
 *   needs the head start to manage that.
 * - The tap fires on the false-to-true edge only. A finger held at the
 *   threshold wanders across it, and a tap per frame is a buzz.
 * - Crossing back and out again taps again, because the answer changed twice.
 *
 * `report(false)` is also how a gesture ends: the next one must not inherit
 * this one's crossing.
 */
export function useThresholdTick(): { prepare: () => void; report: (crossed: boolean) => void } {
  const crossed = useRef(false)

  const prepare = useCallback(() => {
    crossed.current = false
    void nativeShell.prepareHaptics()
  }, [])

  const report = useCallback((past: boolean) => {
    if (past && !crossed.current) void nativeShell.impact('light')
    crossed.current = past
  }, [])

  // Memoized so a caller can put the pair in a `useCallback` dependency list
  // without rebuilding the callback on every render.
  return useMemo(() => ({ prepare, report }), [prepare, report])
}
