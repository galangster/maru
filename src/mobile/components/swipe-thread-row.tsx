import { memo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Archive, Check, Clock3, Star } from 'lucide-react'

import type { Thread } from '@/core/types'
import {
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_MOVE_THRESHOLD,
  SWIPE_OFFSET_LIMIT,
  resolveSwipeIntent,
  type MobileRowModel,
} from '../state'
import { usePointerDrag } from '../use-pointer-drag'

interface SwipeThreadRowProps {
  thread: Thread
  model: MobileRowModel
  editing: boolean
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onArchive: () => void
  onLater: () => void
  onContext: () => void
  onStar: () => void
}

export const SwipeThreadRow = memo(function SwipeThreadRow({
  model,
  editing,
  selected,
  onSelect,
  onOpen,
  onArchive,
  onLater,
  onContext,
  onStar,
}: SwipeThreadRowProps) {
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState(true)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)

  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
  }

  const drag = usePointerDrag({
    onMove: ({ dx, dy }) => {
      if (editing) return
      if (Math.abs(dx) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(dy) > LONG_PRESS_MOVE_THRESHOLD) {
        cancelLongPress()
      }
      if (Math.abs(dx) <= Math.abs(dy)) return
      setSettling(false)
      setOffset(Math.max(-SWIPE_OFFSET_LIMIT, Math.min(SWIPE_OFFSET_LIMIT, dx)))
    },
    onCommit: ({ dx, dy }) => {
      cancelLongPress()
      if (editing) return
      const intent = resolveSwipeIntent(dx, dy)
      if (intent) suppressClick.current = true
      setSettling(true)
      setOffset(0)
      if (intent === 'archive') onArchive()
      if (intent === 'later') onLater()
    },
  })

  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    drag.onPointerDown(event)
    if (editing) return
    suppressClick.current = false
    longPress.current = setTimeout(() => {
      suppressClick.current = true
      onContext()
    }, LONG_PRESS_DELAY_MS)
  }

  return (
    <div className="mobile-swipe-row">
      <div className="mobile-swipe-action is-archive"><Archive size={21} /><span>Archive</span></div>
      <div className="mobile-swipe-action is-later"><Clock3 size={21} /><span>Later</span></div>
      <div
        className={`mobile-thread-row${model.unread ? ' is-unread' : ''}${selected ? ' is-selected' : ''}${settling ? ' is-settling' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        {...drag}
        onPointerDown={pointerDown}
        onContextMenu={(event) => { event.preventDefault(); onContext() }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          editing ? onSelect() : onOpen()
        }}
        role="button"
        tabIndex={0}
        aria-label={`${model.sender}, ${model.subject}`}
        aria-pressed={editing ? selected : undefined}
        aria-haspopup="dialog"
        aria-description="Swipe right to archive or left to save for later. Long press for more actions."
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') editing ? onSelect() : onOpen()
        }}
      >
        {editing ? (
          <span className={`mobile-select-dot${selected ? ' is-checked' : ''}`} aria-hidden>
            {selected && <Check size={14} />}
          </span>
        ) : (
          <span className="mobile-unread-slot" aria-hidden>{model.unread && <span />}</span>
        )}
        <div className="mobile-row-copy">
          <div className="mobile-row-topline"><strong>{model.sender}</strong><time>{model.time}</time></div>
          <div className="mobile-row-subject"><span>{model.subject}</span>{model.messageCount > 1 && <small>{model.messageCount}</small>}</div>
          <p>{model.snippet}</p>
        </div>
        <button
          className={`mobile-star-button mobile-press${model.starred ? ' is-starred' : ''}`}
          type="button"
          aria-label={model.starred ? 'Unstar thread' : 'Star thread'}
          onClick={(event) => { event.stopPropagation(); onStar() }}
        >
          <Star size={17} fill={model.starred ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
})
