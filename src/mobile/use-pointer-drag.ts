import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, PointerEventHandler } from 'react'

import { resolveDragAxis, type DragAxis } from './state'

export interface PointerDragDelta {
  dx: number
  dy: number
}

interface PointerDragOptions {
  /**
   * The axis this drag owns. A gesture that locks the other way is dropped
   * for the rest of its life: `onMove` and `onCommit` are never called for it,
   * and `onCancel` cleans up instead.
   */
  axis: DragAxis
  onMove: (delta: PointerDragDelta) => void
  onCommit: (delta: PointerDragDelta) => void
  /**
   * The gesture ended without ever being ours — it went the other way, it was
   * a tap, or WebKit took it. Whatever the drag was showing must spring back.
   */
  onCancel?: () => void
}

interface PointerDragHandlers {
  onPointerDown: PointerEventHandler<HTMLElement>
  onPointerMove: PointerEventHandler<HTMLElement>
  onPointerUp: PointerEventHandler<HTMLElement>
  onPointerCancel: PointerEventHandler<HTMLElement>
}

interface Gesture {
  x: number
  y: number
  pointerId: number
  /** `null` until the finger has travelled far enough to declare itself. */
  axis: DragAxis | null
  delta: PointerDragDelta
}

/**
 * One finger, one axis.
 *
 * The lock is here rather than in each caller because every caller was getting
 * it slightly differently and all three were wrong on a real phone. A row
 * decided the axis afresh on every `pointermove`, so a drag that wandered a
 * few degrees stuttered between following the finger and ignoring it; the edge
 * back had no test at all, so a scroll that started near the left edge dragged
 * the whole screen sideways.
 *
 * Two rules do all the work:
 *
 * 1. **Nothing is reported before the lock.** Below `AXIS_LOCK_THRESHOLD` the
 *    gesture is still a tap as far as anyone here is concerned.
 * 2. **The lock is taken once and never revisited.** After it, a gesture is
 *    either ours for its whole life or not ours at all. That is what makes a
 *    vertical scroll unable to trigger a swipe, and a swipe unable to scroll.
 *
 * The pointer is captured at the lock rather than at `pointerdown`. Claiming a
 * touch the moment it lands means claiming every tap and every scroll that
 * starts on this element, and the capture then has to be handed back to
 * WebKit's scroll view mid-gesture. Capturing when we know the gesture is ours
 * is both honest and one less thing to undo.
 *
 * `pointercancel` is a real answer, not an alias for `pointerup`. WKWebView
 * fires it when its own scroll view takes the gesture, and a swipe cancelled
 * that way must spring back rather than commit — it was a scroll.
 */
export function usePointerDrag({ axis, onMove, onCommit, onCancel }: PointerDragOptions): PointerDragHandlers {
  const gesture = useRef<Gesture | null>(null)
  const wanted = useRef(axis)
  wanted.current = axis
  const callbacks = useRef({ onMove, onCommit, onCancel })
  callbacks.current = { onMove, onCommit, onCancel }

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      axis: null,
      delta: { dx: 0, dy: 0 },
    }
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const delta = { dx: event.clientX - active.x, dy: event.clientY - active.y }
    if (!active.axis) {
      const locked = resolveDragAxis(delta.dx, delta.dy)
      if (!locked) return
      active.axis = locked
      if (locked === wanted.current) event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    if (active.axis !== wanted.current) return
    active.delta = delta
    callbacks.current.onMove(delta)
  }, [])

  const release = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    release(event)
    if (active.axis === wanted.current) callbacks.current.onCommit(active.delta)
    else callbacks.current.onCancel?.()
  }, [])

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    release(event)
    callbacks.current.onCancel?.()
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
