import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { DragAxis } from './state'
import { usePointerDrag, type PointerDragDelta } from './use-pointer-drag'
import { useThresholdTick } from './use-threshold-tick'

interface DismissDragOptions {
  /** The axis this gesture owns. `usePointerDrag` drops every other one. */
  axis: DragAxis
  /** Where the surface sits for this delta. `0` is rest. */
  clamp: (delta: PointerDragDelta) => number
  /** Whether letting go at this offset does the thing. */
  past: (offset: number) => boolean
  /** Do it. Called on release, past the threshold, and nowhere else. */
  onCommit: () => void
  /**
   * Whether a gesture starting HERE may move the surface at all, answered once
   * at `pointerdown`. The edge back is the caller that needs it: a drag has to
   * start within a few points of the left edge to be one. Absent means every
   * gesture on the element is eligible.
   */
  eligible?: (event: ReactPointerEvent<HTMLElement>) => boolean
  /**
   * Tap at the threshold, on the way past. Opt-in: the sheet gives one and the
   * edge back gives none, because the system's own back gesture gives none
   * either and two answers to one flick is worse than neither.
   */
  haptic?: boolean
  /**
   * The gesture was a tap — released without ever declaring an axis.
   *
   * `eligible` does not gate it. That rule is about whether a gesture may MOVE
   * the surface, and a tap moves nothing: the sheet's scrim has to close on a
   * tap anywhere on it, while only a gesture from the left edge may drag it.
   */
  onTap?: (event: ReactPointerEvent<HTMLElement>) => void
}

/**
 * A surface that follows a finger, and leaves if the finger goes far enough.
 *
 * Three surfaces do exactly this — the edge back on a screen, the edge back on
 * a sheet layer, and a sheet dragged down by its handle — and each had written
 * out the same five parts: an offset, a `settling` flag for the transition, a
 * settle that puts both back, an eligibility ref read on the first frame, and
 * a threshold crossing to tap at. Five parts copied three ways is where they
 * drifted: only one of the three tapped at its threshold, and the sheet's copy
 * had to reach into `useThresholdTick` to prime the engine by hand.
 *
 * What is left to a caller is what genuinely differs: which axis, where the
 * surface sits for a given delta, how far is far enough, and what happens then.
 *
 * `settling` is false only while a finger is actually moving the surface, so
 * the CSS transition is off during the drag and back on for the spring return.
 * Every ending — a commit, a release short of the threshold, a gesture that
 * went the other way, WebKit taking it — goes through one `settle`.
 */
export function useDismissDrag({ axis, clamp, past, onCommit, eligible, haptic = false, onTap }: DismissDragOptions): {
  offset: number
  settling: boolean
  handlers: ReturnType<typeof usePointerDrag>
} {
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState(true)
  /** Whether this gesture was ever allowed to move anything. */
  const allowed = useRef(true)
  const tick = useThresholdTick()

  /** Back to rest, with the transition on. Every ending goes through here. */
  const settle = useCallback(() => {
    tick.settle()
    setSettling(true)
    setOffset(0)
  }, [tick])

  const drag = usePointerDrag({
    axis,
    onMove: (delta) => {
      if (!allowed.current) return
      setSettling(false)
      const next = clamp(delta)
      setOffset(next)
      // On the way past only: this is the moment letting go becomes the
      // action, and the hand covering the surface is who needs telling.
      if (haptic) tick.report(past(next))
    },
    onCommit: (delta) => {
      // Read off the clamped offset rather than the raw delta, so what commits
      // is what the surface actually did — a promise it could not keep on
      // screen is not one to keep on release either.
      const commits = allowed.current && past(clamp(delta))
      settle()
      if (commits) onCommit()
    },
    onCancel: settle,
    onTap,
  })

  return {
    offset,
    settling,
    handlers: {
      ...drag,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        allowed.current = eligible?.(event) ?? true
        drag.onPointerDown(event)
      },
    },
  }
}
