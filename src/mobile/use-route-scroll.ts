import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Gives a document-scrolled shell the scroll behaviour a native stack has: a
 * pushed screen opens at its top, and coming back lands where you left.
 *
 * An inner scroll container used to get this for free by unmounting. The page
 * does not unmount, so opening a thread from halfway down the inbox would show
 * the thread halfway down.
 *
 * The position is sampled while scrolling instead of read when the route
 * changes, because by then the new screen has already re-laid out the document
 * and WebKit may have clamped the old offset to a shorter page.
 *
 * A route with no sample yet opens at the top, which is also what happens if a
 * screen never scrolled. The worst case is therefore the plain reset, never a
 * wrong offset.
 */
export function useRouteScroll(routeKey: string): void {
  const positions = useRef(new Map<string, number>())
  const current = useRef(routeKey)

  useEffect(() => {
    // One read per frame. WebKit fires `scroll` far more often than it paints,
    // and `window.scrollY` is a layout read: coalescing into a frame keeps the
    // sample as fresh as anything on screen and stops the thrash.
    let frame = 0
    const sample = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        positions.current.set(current.current, window.scrollY)
      })
    }
    window.addEventListener('scroll', sample, { passive: true })
    return () => {
      window.removeEventListener('scroll', sample)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  useLayoutEffect(() => {
    if (current.current === routeKey) return
    current.current = routeKey
    window.scrollTo(0, positions.current.get(routeKey) ?? 0)
  }, [routeKey])
}
