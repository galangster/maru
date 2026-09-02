import { useCallback, useMemo, useRef } from 'react'

import { nativeShell } from '@/platform/shell'

/**
 * The tap a drag gives when it crosses its threshold.
 *
 * Every one-finger surface in the shell wants the same three-part bargain, and
 * each had its own copy of it: warm the haptic engine when the gesture starts,
 * tap once on the way *past* the threshold, and forget the crossing when the
 * gesture settles.
 *
 * The details that are easy to get wrong, and the reason this is one helper:
 *
 * - The engine is warmed on the FIRST report of a gesture rather than at the
 *   crossing. The tap has to land on the frame the copy changes -- "Release to
 *   refresh", or the action behind a row becoming the thing that will happen --
 *   and the engine needs the head start to manage that. Warming it at
 *   `pointerdown` instead warms it for every tap and every scroll that starts
 *   on a row, which on a list is nearly all of them, so the warm-up waits for
 *   the first frame that is unmistakably a drag.
 * - The tap fires on the false-to-true edge only. A finger held at the
 *   threshold wanders across it, and a tap per frame is a buzz.
 * - Crossing back and out again taps again, because the answer changed twice.
 *
 * That first-report rule used to be a `primed` ref beside each caller's own
 * state, written out three times. It is one fact about a gesture's life, so it
 * lives with the crossing it belongs to.
 */
export function useThresholdTick(): { report: (crossed: boolean) => void; settle: () => void } {
  /** Whether this gesture has already warmed the engine. */
  const primed = useRef(false)
  const crossed = useRef(false)

  const report = useCallback((past: boolean) => {
    if (!primed.current) {
      primed.current = true
      void nativeShell.prepareHaptics()
    }
    if (past && !crossed.current) void nativeShell.impact('light')
    crossed.current = past
  }, [])

  /** The gesture is over. The next one must inherit none of it. */
  const settle = useCallback(() => {
    primed.current = false
    crossed.current = false
  }, [])

  // Memoized so a caller can put the pair in a `useCallback` dependency list
  // without rebuilding the callback on every render.
  return useMemo(() => ({ report, settle }), [report, settle])
}
