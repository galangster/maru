import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { EDGE_BACK_START_PX, EDGE_BACK_THRESHOLD } from './state'
import { usePointerDrag } from './use-pointer-drag'

export function useEdgeBack(onBack: () => void) {
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState(true)
  const eligible = useRef(false)
  const drag = usePointerDrag({
    onMove: ({ dx }) => {
      if (!eligible.current) return
      setSettling(false)
      setOffset(Math.max(0, Math.min(window.innerWidth, dx)))
    },
    onCommit: ({ dx }) => {
      if (eligible.current && dx >= EDGE_BACK_THRESHOLD) onBack()
      eligible.current = false
      setSettling(true)
      setOffset(0)
    },
  })

  return {
    offset,
    settling,
    handlers: {
      ...drag,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        eligible.current = event.clientX <= EDGE_BACK_START_PX
        drag.onPointerDown(event)
      },
    },
  }
}
