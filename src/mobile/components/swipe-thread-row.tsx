import { memo, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { Thread } from '@/core/types'
import { MobileIcon } from './mobile-icon'
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

  const cancelLongPress = useCallback(function cancel() {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
    window.removeEventListener('scroll', cancel)
    window.removeEventListener('touchmove', cancel)
  }, [])

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
    // The page is the scroller now, so a press that becomes a scroll can stop
    // reaching this row entirely: WebKit hands the gesture to the scroll view
    // and `onMove` never fires to cancel the timer. A drag is never a long
    // press, so the finger moving at all is the cancel — `touchmove` as well as
    // `scroll`, because at the end of the list the gesture is still claimed by
    // the scroll view and nothing scrolls.
    window.addEventListener('scroll', cancelLongPress, { once: true, passive: true })
    window.addEventListener('touchmove', cancelLongPress, { once: true, passive: true })
    longPress.current = setTimeout(() => {
      // The press won, so the listeners it armed have no one left to cancel.
      // They are `once`, but a gesture that ends without a scroll or a
      // touchmove never fires them, and they would outlive the row.
      cancelLongPress()
      suppressClick.current = true
      onContext()
    }, LONG_PRESS_DELAY_MS)
  }

  return (
    <div className="mobile-swipe-row">
      <div className="mobile-swipe-action is-archive"><MobileIcon name="archive" scale="large" /><span>Archive</span></div>
      <div className="mobile-swipe-action is-later"><MobileIcon name="calendar" scale="large" /><span>Later</span></div>
      <button
        type="button"
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
        aria-label={`${model.sender}, ${model.subject}`}
        aria-pressed={editing ? selected : undefined}
      >
        {editing ? (
          <span className={`mobile-select-dot${selected ? ' is-checked' : ''}`} aria-hidden>
            {selected && <MobileIcon name="check" scale="small" />}
          </span>
        ) : (
          <span className="mobile-unread-slot" aria-hidden>{model.unread && <span />}</span>
        )}
        <div className="mobile-row-copy">
          <div className="mobile-row-topline"><strong>{model.sender}</strong><time>{model.time}</time></div>
          <div className="mobile-row-subject"><span>{model.subject}</span>{model.messageCount > 1 && <small>{model.messageCount}</small>}</div>
          <p>{model.snippet}</p>
        </div>
        <span />
      </button>
      <button
        className={`mobile-star-button${model.starred ? ' is-starred' : ''}`}
        type="button"
        aria-label={model.starred ? 'Unstar thread' : 'Star thread'}
        onClick={onStar}
      >
        <MobileIcon name="star" filled={model.starred} />
      </button>
    </div>
  )
})
