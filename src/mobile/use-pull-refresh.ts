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
  const ready = useRef(false)
  const touch = useRef<{ identifier: number; y: number } | null>(null)
  const usingTouch = useRef(false)

  /** Every gesture entry point starts here, so neither flag can be forgotten. */
  const begin = () => {
    eligible.current = window.scrollY <= 0
    ready.current = false
    // The start of the drag, not the crossing: the tap at the threshold is the
    // one that has to land the instant the copy changes, and `prepare()` needs
    // the head start to give it that.
    if (eligible.current) void nativeShell.prepareHaptics()
  }
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
    writePull(region.current, offset, false, false)
  }
  const commit = (dy: number) => {
    const offset = offsetFor(dy)
    ready.current = false
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
      ready.current = false
      writePull(region.current, 0, true, false)
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
        writePull(region.current, 0, true, false)
        touch.current = null
        usingTouch.current = false
      },
    },
  }
}
