import {
  useRef,
  useState,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from 'react'

import {
  PULL_DISTANCE_FACTOR,
  PULL_MAX_OFFSET,
  PULL_REFRESH_OFFSET,
  PULL_REFRESH_THRESHOLD,
  resolveDragAxis,
  type DragAxis,
} from './state'
import { usePointerDrag } from './use-pointer-drag'
import { useThresholdTick } from './use-threshold-tick'

function writePull(node: HTMLElement | null, offset: number, settling: boolean, refreshing: boolean): void {
  if (!node) return
  node.style.setProperty('--mobile-pull-offset', `${offset}px`)
  node.dataset.pullReady = offset >= PULL_REFRESH_THRESHOLD ? 'true' : 'false'
  node.dataset.pullSettling = settling ? 'true' : 'false'
  node.dataset.refreshing = refreshing ? 'true' : 'false'
}

/**
 * Pull to refresh, on the document's scroll position.
 *
 * `region` is only written to -- it carries the offset and the state that the
 * CSS reads. Eligibility comes from `window.scrollY`, because the page itself
 * scrolls now (mobile.css). A rubber-band overshoot at the top reports a
 * negative scrollY in WebKit, which is still the top.
 */
export function usePullRefresh(
  region: RefObject<HTMLDivElement | null>,
  refresh: () => Promise<void>,
) {
  const [refreshing, setRefreshing] = useState(false)
  const eligible = useRef(false)
  const touch = useRef<{ identifier: number; x: number; y: number; axis: DragAxis | null } | null>(null)
  const usingTouch = useRef(false)
  // The tap at "Release to refresh", shared with the swipe rows.
  const tick = useThresholdTick()

  /** Every gesture entry point starts here, so neither flag can be forgotten. */
  const begin = () => {
    eligible.current = window.scrollY <= 0
    // The last gesture's crossing and its warm-up both go. The engine is
    // warmed by the first frame that reports, and only an eligible gesture
    // ever reports one, so an ineligible one warms nothing.
    tick.settle()
  }
  const offsetFor = (dy: number) => dy <= 0 ? 0 : Math.min(PULL_MAX_OFFSET, dy * PULL_DISTANCE_FACTOR)
  const move = (dy: number) => {
    if (!eligible.current) return
    const offset = offsetFor(dy)
    tick.report(offset >= PULL_REFRESH_THRESHOLD)
    writePull(region.current, offset, false, false)
  }
  const commit = (dy: number) => {
    const offset = offsetFor(dy)
    tick.settle()
    if (!eligible.current || offset < PULL_REFRESH_THRESHOLD) {
      writePull(region.current, 0, true, false)
      return
    }
    writePull(region.current, PULL_REFRESH_OFFSET, true, true)
    setRefreshing(true)
    void refresh().finally(() => {
      setRefreshing(false)
      writePull(region.current, 0, true, false)
    })
  }
  /** The gesture was never ours, or never finished. Put the indicator back. */
  const abandon = () => {
    tick.settle()
    writePull(region.current, 0, true, false)
  }
  const drag = usePointerDrag({
    // Vertical, so a horizontal swipe across a row at the top of the list no
    // longer drags the refresh indicator down with it.
    axis: 'vertical',
    onMove: ({ dy }) => {
      if (!usingTouch.current) move(dy)
    },
    onCommit: ({ dy }) => {
      if (!usingTouch.current) commit(dy)
    },
    onCancel: () => {
      if (usingTouch.current) return
      abandon()
    },
  })

  const trackedTouch = (event: ReactTouchEvent<HTMLElement>) => {
    if (!touch.current) return null
    for (let index = 0; index < event.touches.length; index += 1) {
      const point = event.touches.item(index)
      if (point.identifier === touch.current.identifier) return point
    }
    for (let index = 0; index < event.changedTouches.length; index += 1) {
      const point = event.changedTouches.item(index)
      if (point.identifier === touch.current.identifier) return point
    }
    return null
  }

  return {
    refreshing,
    drag: {
      ...drag,
      onPointerDown: (event: Parameters<typeof drag.onPointerDown>[0]) => {
        begin()
        drag.onPointerDown(event)
      },
      onTouchStart: (event: ReactTouchEvent<HTMLElement>) => {
        const point = event.changedTouches[0]
        if (!point) return
        usingTouch.current = true
        begin()
        touch.current = { identifier: point.identifier, x: point.clientX, y: point.clientY, axis: null }
      },
      // Both branches consult one rule. `resolveDragAxis` is what the pointer
      // branch locks on inside `usePointerDrag`, so a horizontal swipe across
      // a row at the top of the list cannot drag the indicator down here
      // either -- which is exactly what it did while only the pointer branch
      // was gated.
      onTouchMove: (event: ReactTouchEvent<HTMLElement>) => {
        const point = trackedTouch(event)
        const active = touch.current
        if (!point || !active) return
        const dx = point.clientX - active.x
        const dy = point.clientY - active.y
        if (!active.axis) active.axis = resolveDragAxis(dx, dy)
        // Held until the lock says otherwise, because WebKit decides whether
        // the gesture is its own in the first few points and a `preventDefault`
        // that arrives after the scroll view has claimed it arrives too late.
        if (active.axis !== 'horizontal' && eligible.current && dy > 0) event.preventDefault()
        if (active.axis !== 'vertical') return
        move(dy)
      },
      onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => {
        const point = trackedTouch(event)
        const active = touch.current
        if (point && active) {
          if (active.axis === 'vertical') commit(point.clientY - active.y)
          else abandon()
        }
        touch.current = null
        usingTouch.current = false
      },
      onTouchCancel: () => {
        abandon()
        touch.current = null
        usingTouch.current = false
      },
    },
  }
}
