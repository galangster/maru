import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

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
 *
 * Returns `readScrollTop`: where the page is, or — on the render that brings a
 * screen back — where it is about to be. See docs/IOS.md, "The inbox stays
 * mounted".
 */
export function useRouteScroll(routeKey: string): () => number {
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
    const target = positions.current.get(routeKey) ?? 0
    window.scrollTo(0, target)
    // A reset to the top always sticks, and re-asserting it would fight a
    // finger that has already started scrolling the new screen.
    if (target === 0) return
    // Measured on an iPhone 16: a restore does not always stick. A short
    // screen leaving and a tall one coming back moves the page twice in the
    // same frame — WebKit re-applies its own idea of the old offset — and the
    // page can settle about a row away from the target. One re-assert on the
    // next frame makes the offset this hook promises the offset the page
    // actually holds. Nothing legitimate is scrolling in that frame: the
    // finger has just left the back control.
    const frame = requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, target)
    })
    return () => cancelAnimationFrame(frame)
  }, [routeKey])

  // Called during render, which is before the layout effect above advances
  // `current` — so an unequal `current` means this route is the one arriving.
  return useCallback(
    () => (current.current === routeKey ? window.scrollY : positions.current.get(routeKey) ?? 0),
    [routeKey],
  )
}
