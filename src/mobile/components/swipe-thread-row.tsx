import { memo, useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { Thread } from '@/core/types'
import { MobileIcon } from './mobile-icon'
import {
  LONG_PRESS_DELAY_MS,
  SWIPE_ACTION_THRESHOLD,
  SWIPE_OFFSET_LIMIT,
  resolveSwipeIntent,
  type MobileRowModel,
} from '../state'
import { removeChrome, rowActions, swipeRange, type RemoveAction } from '../thread-actions'
import { usePointerDrag } from '../use-pointer-drag'
import { useThresholdTick } from '../use-threshold-tick'

/** A list with no selection mode passes none of the three below. */
const NOT_SELECTABLE = () => {}

interface SwipeThreadRowProps {
  thread: Thread
  model: MobileRowModel
  /** Selection mode, which only the inbox has. Absent means never in it. */
  editing?: boolean
  selected?: boolean
  onSelect?: () => void
  onOpen: () => void
  /** Put it away, whatever that means here — `rowActions` decides which. */
  onRemove: (type: RemoveAction) => void
  onLater: () => void
  onContext: () => void
  onStar: () => void
}

export const SwipeThreadRow = memo(function SwipeThreadRow({
  thread,
  model,
  editing = false,
  selected = false,
  onSelect = NOT_SELECTABLE,
  onOpen,
  onRemove,
  onLater,
  onContext,
  onStar,
}: SwipeThreadRowProps) {
  // The row resolves its own verbs off the conversation it is drawing, rather
  // than being told them: every list that draws this row — the inbox, Sent,
  // Trash, Later, a label, search results — would otherwise need the same rule
  // written into it, and search is the list that mixes all of them in one set.
  const actions = useMemo(() => rowActions(thread), [thread])
  const range = swipeRange(actions, SWIPE_OFFSET_LIMIT)
  const chrome = removeChrome(actions.remove)
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState(true)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)
  /** The tap at the action threshold, shared with the pull to refresh. */
  const tick = useThresholdTick()

  const cancelLongPress = useCallback(function cancel() {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
    window.removeEventListener('scroll', cancel)
    window.removeEventListener('touchmove', cancel)
  }, [])

  /** Back to rest, with the transition on. Every ending goes through here. */
  const settle = useCallback(() => {
    tick.settle()
    setSettling(true)
    setOffset(0)
  }, [tick])

  const drag = usePointerDrag({
    // The hook now owns the axis. This row only ever hears about a gesture
    // that locked horizontal, so a scroll cannot move it and a swipe of its
    // own cannot scroll the page — `data-gesture="pan-y"` below is the other
    // half of that, and mobile.css explains why it was not applying.
    axis: 'horizontal',
    onMove: ({ dx }) => {
      if (editing) return
      // A gesture that reached this callback has travelled at least
      // `AXIS_LOCK_THRESHOLD`, which is further than a long press is allowed
      // to wander. It is a drag, so it is not a press.
      cancelLongPress()
      setSettling(false)
      const next = Math.max(range.min, Math.min(range.max, dx))
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
      // Gated on the same two facts the travel was: a direction that could not
      // move cannot have reached its threshold, and this is the second half of
      // that promise rather than a second opinion about it.
      if (intent === 'archive' && actions.remove) onRemove(actions.remove)
      if (intent === 'later' && actions.defer) onLater()
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
    // Neither the warm-up nor the crossing is reset here: every ending goes
    // through `settle`, and `settle` hands both back to `useThresholdTick`.
    // The first `report` of the next swipe warms the engine again — on the
    // first frame of a *drag*, rather than on every tap and every scroll that
    // starts on a row, which on a list is nearly all of them.
    //
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
      {actions.remove && <div className="mobile-swipe-action is-archive"><MobileIcon name={chrome.icon} scale="large" /><span>{chrome.swipe}</span></div>}
      {actions.defer && <div className="mobile-swipe-action is-later"><MobileIcon name="calendar" scale="large" /><span>Later</span></div>}
      <button
        type="button"
        className={`mobile-thread-row${model.unread ? ' is-unread' : ''}${selected ? ' is-selected' : ''}${settling ? ' is-settling' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        // Vertical is the page scroller's, horizontal is this row's. Claimed
        // here rather than named in a list in mobile.css, so the row that
        // takes the axis is the row that says so.
        data-gesture="pan-y"
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
          {/* `dir="auto"` on each of the three, and not on the row around
              them: a Hebrew subject under an English sender is one row with
              two directions, and a direction set on the container would give
              the whole row the first one it found. The browser reads each
              string's own first strong character, which is exactly the
              question being asked. */}
          <div className="mobile-row-topline"><strong dir="auto">{model.sender}</strong><time>{model.time}</time></div>
          <div className="mobile-row-subject"><span dir="auto">{model.subject}</span>{model.messageCount > 1 && <small>{model.messageCount}</small>}</div>
          {/* When it comes back. The phone's list has no date group headers
              anywhere, so the desktop Later view's "Tomorrow" headers have no
              counterpart here — the exact moment on the row is the same fact
              at a higher resolution, and it travels into search results too. */}
          {model.until && <p className="mobile-row-until"><MobileIcon name="calendar" scale="small" />Back {model.until}</p>}
          <p dir="auto">{model.snippet}</p>
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
