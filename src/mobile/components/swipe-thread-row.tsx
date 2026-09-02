import { memo, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { Thread } from '@/core/types'
import { MobileIcon } from './mobile-icon'
import {
  LONG_PRESS_DELAY_MS,
  SWIPE_ACTION_THRESHOLD,
  SWIPE_OFFSET_LIMIT,
  resolveSwipeIntent,
  type MobileRowModel,
} from '../state'
import { usePointerDrag } from '../use-pointer-drag'
import { useThresholdTick } from '../use-threshold-tick'

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
  /** The tap at the action threshold, shared with the pull to refresh. */
  const tick = useThresholdTick()
  /** Whether this gesture has already warmed the haptic engine. */
  const primed = useRef(false)

  const cancelLongPress = useCallback(function cancel() {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
    window.removeEventListener('scroll', cancel)
    window.removeEventListener('touchmove', cancel)
  }, [])

  /** Back to rest, with the transition on. Every ending goes through here. */
  const settle = useCallback(() => {
    tick.report(false)
    setSettling(true)
    setOffset(0)
  }, [tick])

  const drag = usePointerDrag({
    // The hook now owns the axis. This row only ever hears about a gesture
    // that locked horizontal, so a scroll cannot move it and a swipe of its
    // own cannot scroll the page — `touch-action: pan-y` on the row is the
    // other half of that, and mobile.css explains why it was not applying.
    axis: 'horizontal',
    onMove: ({ dx }) => {
      if (editing) return
      // A gesture that reached this callback has travelled at least
      // `AXIS_LOCK_THRESHOLD`, which is further than a long press is allowed
      // to wander. It is a drag, so it is not a press.
      cancelLongPress()
      // The first frame of a *swipe*, which is the earliest moment this row
      // knows there is a threshold ahead to tap at. Warming the engine on
      // `pointerdown` instead warmed it for every tap and every scroll that
      // started on a row, which on a list is nearly all of them.
      if (!primed.current) {
        primed.current = true
        tick.prepare()
      }
      setSettling(false)
      const next = Math.max(-SWIPE_OFFSET_LIMIT, Math.min(SWIPE_OFFSET_LIMIT, dx))
      setOffset(next)
      // The tap at the threshold, on the way out only: this is the moment the
      // action behind the row becomes the thing that will happen, and a thumb
      // covering the label is exactly who needs telling.
      tick.report(Math.abs(next) >= SWIPE_ACTION_THRESHOLD)
    },
    onCommit: ({ dx, dy }) => {
      cancelLongPress()
      if (editing) return settle()
      const intent = resolveSwipeIntent(dx, dy)
      if (intent) suppressClick.current = true
      settle()
      if (intent === 'archive') onArchive()
      if (intent === 'later') onLater()
    },
    // A tap, a scroll, or WebKit taking the gesture. None of them committed to
    // anything, so the row goes back the way it came.
    onCancel: () => {
      cancelLongPress()
      settle()
    },
  })

  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    drag.onPointerDown(event)
    if (editing) return
    suppressClick.current = false
    // Only the warm-up is reset here. The crossing needs no reset: every
    // ending goes through `settle`, and `settle` reports its way back to false.
    primed.current = false
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
        aria-label={model.label}
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
