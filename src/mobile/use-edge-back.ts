import type { PointerEvent as ReactPointerEvent } from 'react'

import { EDGE_BACK_START_PX, EDGE_BACK_THRESHOLD } from './state'
import { useDismissDrag } from './use-dismiss-drag'

/**
 * Swipe in from the left edge to go back — a screen, or a sheet.
 *
 * All of it is `useDismissDrag` now; what is left here is the three facts that
 * make the gesture this one rather than a sheet's.
 *
 * The axis matters as much as the edge. Before the lock lived in the pointer
 * hook, a scroll that happened to start within `EDGE_BACK_START_PX` of the
 * left edge dragged the whole screen sideways.
 */
export function useEdgeBack(onBack: () => void, onTap?: (event: ReactPointerEvent<HTMLElement>) => void) {
  return useDismissDrag({
    axis: 'horizontal',
    // A layer that carries this gesture is usually also a layer you can tap to
    // leave. The sheet's scrim is the one that does; a screen passes nothing.
    onTap,
    // Rightwards only, and never further than the screen is wide.
    clamp: ({ dx }) => Math.max(0, Math.min(window.innerWidth, dx)),
    past: (offset) => offset >= EDGE_BACK_THRESHOLD,
    onCommit: onBack,
    // A gesture is the back gesture because of where it STARTED. Anything that
    // begins further in is a scroll, a swipe on a row, or a tap.
    eligible: (event) => event.clientX <= EDGE_BACK_START_PX,
  })
}
