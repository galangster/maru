import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * How many frames a restore is allowed to keep asserting itself, and how far
 * off the target still counts as landed.
 *
 * Six frames is a tenth of a second at 60 Hz — long enough for a document that
 * is still growing to reach its full height, short enough that nobody sees the
 * argument. One pixel of tolerance, because a device-pixel-ratio of 3 makes a
 * sub-pixel offset a legitimate resting place.
 */
export const SCROLL_RESTORE_FRAMES = 6
export const SCROLL_RESTORE_TOLERANCE_PX = 1

/** The first input that means the restore is no longer the page's business. */
const GESTURES = ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const

/**
 * Whether a restore should assert the offset again: it should not once the page
 * holds it, and it must not once the budget is spent — those are the same
 * answer, because both mean the restore is over.
 *
 * A pure function so the rule can be tested without a page —
 * tests/mobile-state.test.ts.
 */
export function shouldReassert(scrollY: number, target: number, framesLeft: number): boolean {
  if (Math.abs(scrollY - target) <= SCROLL_RESTORE_TOLERANCE_PX) return false
  return framesLeft > 0
}

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
    // Read on the event, not on the next frame.
    //
    // This used to coalesce into a `requestAnimationFrame`, which is the usual
    // advice and is wrong for a *sample*: a scheduled frame that never runs —
    // the page going to the background, a long task, a commit that lands
    // between the schedule and the callback — takes every scroll event after
    // it with it, because the `if (frame) return` guard stays armed. The
    // position then keeps whatever it held when the frame was lost, which is
    // the shape of issue 10: the list came back where the sampling stopped
    // rather than where the finger did.
    //
    // `window.scrollY` inside a scroll listener is not a thrashing read.
    // Layout is clean by the time the event is dispatched, so it is a lookup
    // rather than a forced reflow, and it is exact.
    const sample = () => {
      positions.current.set(current.current, window.scrollY)
    }
    window.addEventListener('scroll', sample, { passive: true })
    return () => window.removeEventListener('scroll', sample)
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
    // same frame — WebKit re-applies its own idea of the old offset, and a
    // document that has not finished growing clamps the target to whatever
    // fits — and the page can settle a row or a screen away from where it was
    // asked to go.
    //
    // One re-assert was not enough, because neither cause is guaranteed to be
    // over in one frame. It re-asserts until the page holds the offset, for at
    // most `SCROLL_RESTORE_FRAMES`, and stops the moment a finger or a key
    // arrives: a restore that is still arguing with the page after a tenth of
    // a second has lost, and fighting a person who has started scrolling is
    // worse than landing in the wrong place.
    let frame = 0
    let framesLeft = SCROLL_RESTORE_FRAMES
    const stop = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      for (const type of GESTURES) window.removeEventListener(type, stop)
    }
    const settle = () => {
      if (!shouldReassert(window.scrollY, target, framesLeft)) return stop()
      framesLeft -= 1
      window.scrollTo(0, target)
      frame = requestAnimationFrame(settle)
    }
    for (const type of GESTURES) window.addEventListener(type, stop, { passive: true })
    frame = requestAnimationFrame(settle)
    return stop
  }, [routeKey])

  // Called during render, which is before the layout effect above advances
  // `current` — so an unequal `current` means this route is the one arriving.
  return useCallback(
    () => (current.current === routeKey ? window.scrollY : positions.current.get(routeKey) ?? 0),
    [routeKey],
  )
}
