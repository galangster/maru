import {
  useRef,
  useState,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from 'react'

import { nativeShell } from '@/platform/shell'
import {
  PULL_DISTANCE_FACTOR,
  PULL_MAX_OFFSET,
  PULL_REFRESH_OFFSET,
  PULL_REFRESH_THRESHOLD,
} from './state'
import { usePointerDrag } from './use-pointer-drag'

function writePull(node: HTMLElement | null, offset: number, settling: boolean, refreshing: boolean): void {
  if (!node) return
  node.style.setProperty('--mobile-pull-offset', `${offset}px`)
  node.dataset.pullReady = offset >= PULL_REFRESH_THRESHOLD ? 'true' : 'false'
  node.dataset.pullSettling = settling ? 'true' : 'false'
  node.dataset.refreshing = refreshing ? 'true' : 'false'
}

export function usePullRefresh(
  scroller: RefObject<HTMLDivElement | null>,
  refresh: () => Promise<void>,
) {
  const [refreshing, setRefreshing] = useState(false)
  const eligible = useRef(false)
  const ready = useRef(false)
  const touch = useRef<{ identifier: number; y: number } | null>(null)
  const usingTouch = useRef(false)

  const offsetFor = (dy: number) => dy <= 0 ? 0 : Math.min(PULL_MAX_OFFSET, dy * PULL_DISTANCE_FACTOR)
  const move = (dy: number) => {
    if (!eligible.current) return
    const offset = offsetFor(dy)
    // The tap on the threshold, on the way past it only. This is the moment the
    // copy changes to "Release to refresh", and the whole point of the haptic
    // is that a thumb covering that copy can still feel it.
    const crossed = offset >= PULL_REFRESH_THRESHOLD
    if (crossed && !ready.current) void nativeShell.impact('light')
    ready.current = crossed
    writePull(scroller.current, offset, false, false)
  }
  const commit = (dy: number) => {
    const offset = offsetFor(dy)
    ready.current = false
    if (!eligible.current || offset < PULL_REFRESH_THRESHOLD) {
      writePull(scroller.current, 0, true, false)
      return
    }
    writePull(scroller.current, PULL_REFRESH_OFFSET, true, true)
    setRefreshing(true)
    void refresh().finally(() => {
      setRefreshing(false)
      writePull(scroller.current, 0, true, false)
    })
  }
  const drag = usePointerDrag({
    onMove: ({ dy }) => {
      if (!usingTouch.current) move(dy)
    },
    onCommit: ({ dy }) => {
      if (!usingTouch.current) commit(dy)
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
        eligible.current = (scroller.current?.scrollTop ?? 0) <= 0
        ready.current = false
        drag.onPointerDown(event)
      },
      onTouchStart: (event: ReactTouchEvent<HTMLElement>) => {
        const point = event.changedTouches[0]
        if (!point) return
        usingTouch.current = true
        eligible.current = (scroller.current?.scrollTop ?? 0) <= 0
        ready.current = false
        touch.current = { identifier: point.identifier, y: point.clientY }
      },
      onTouchMove: (event: ReactTouchEvent<HTMLElement>) => {
        const point = trackedTouch(event)
        if (!point || !touch.current) return
        const dy = point.clientY - touch.current.y
        if (eligible.current && dy > 0) event.preventDefault()
        move(dy)
      },
      onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => {
        const point = trackedTouch(event)
        if (point && touch.current) commit(point.clientY - touch.current.y)
        touch.current = null
        usingTouch.current = false
      },
      onTouchCancel: () => {
        ready.current = false
        writePull(scroller.current, 0, true, false)
        touch.current = null
        usingTouch.current = false
      },
    },
  }
}
