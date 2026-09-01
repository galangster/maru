import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, PointerEventHandler } from 'react'

export interface PointerDragDelta {
  dx: number
  dy: number
}

interface PointerDragOptions {
  onMove: (delta: PointerDragDelta) => void
  onCommit: (delta: PointerDragDelta) => void
}

interface PointerDragHandlers {
  onPointerDown: PointerEventHandler<HTMLElement>
  onPointerMove: PointerEventHandler<HTMLElement>
  onPointerUp: PointerEventHandler<HTMLElement>
  onPointerCancel: PointerEventHandler<HTMLElement>
}

export function usePointerDrag({ onMove, onCommit }: PointerDragOptions): PointerDragHandlers {
  const start = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const latest = useRef<PointerDragDelta>({ dx: 0, dy: 0 })
  const callbacks = useRef({ onMove, onCommit })
  callbacks.current = { onMove, onCommit }

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    start.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    latest.current = { dx: 0, dy: 0 }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current
    if (!origin || origin.pointerId !== event.pointerId) return
    const delta = { dx: event.clientX - origin.x, dy: event.clientY - origin.y }
    latest.current = delta
    callbacks.current.onMove(delta)
  }, [])

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current
    if (!origin || origin.pointerId !== event.pointerId) return
    const delta = latest.current
    start.current = null
    latest.current = { dx: 0, dy: 0 }
    callbacks.current.onCommit(delta)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish }
}
