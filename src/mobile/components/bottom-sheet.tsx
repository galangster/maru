import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { MobileIcon } from './mobile-icon'
import { sheetDismisses, sheetDragOffset } from '../state'
import { useDismissDrag } from '../use-dismiss-drag'
import { useEdgeBack } from '../use-edge-back'
import { useHapticBoundary } from '../use-native-shell'
import { useModalFocus } from '../use-modal-focus'

/**
 * Every bottom sheet on the phone, and every way out of one.
 *
 * There were four ways out and they worked on different sheets. The grab
 * handle at the top is the shape iOS uses to say "drag me down to close" and
 * dragging it did nothing, on any of them. The back gesture closed Labels and
 * Move — by accident: those two are short, so a finger at the left edge lands
 * on the scrim and the scrim's tap closed them — and did nothing on Mailboxes
 * or the actions sheet, which are tall enough that the same finger lands on
 * the sheet. Mailboxes is nearly full height, so the strip of scrim left to
 * tap is about the width of a fingernail, and the small Close button in the
 * corner was the only reliable way out (issue 53).
 *
 * So both gestures are here, once, for every sheet:
 *
 * - **Down, from the grab area.** Not from the whole sheet: a sheet scrolls,
 *   and a dismissal that starts anywhere fights that scroll for every gesture.
 *   The handle is where iOS puts the affordance and it is what the report
 *   named.
 * - **In from the left edge, anywhere on the layer.** The same `useEdgeBack`
 *   the thread screen uses, so the gesture that pops a screen closes a sheet,
 *   and the reducer's own rule — a sheet goes before a screen does — is what
 *   the two of them add up to.
 *
 * Both are `useDismissDrag`, which is what the two of them have in common: a
 * surface that follows a finger and leaves if the finger goes far enough. The
 * downward one taps at its threshold, the same haptic a row's swipe and the
 * pull to refresh give at theirs; the edge back gives none, because the
 * system's own back gesture gives none either.
 */
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useModalFocus<HTMLElement>(onClose)
  useHapticBoundary()
  const edge = useEdgeBack(onClose)
  // Down only, and only from the grab area. Both rules are pure functions in
  // state.ts, so what the handle does can be checked without a finger.
  const down = useDismissDrag({
    axis: 'vertical',
    clamp: ({ dy }) => sheetDragOffset(dy),
    past: sheetDismisses,
    onCommit: onClose,
    haptic: true,
  })

  const layer = (
    <div
      className="mobile-sheet-layer mobile-bottom-layer"
      role="presentation"
      {...edge.handlers}
      onPointerDown={(event) => {
        edge.handlers.onPointerDown(event)
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className={`mobile-bottom-sheet${down.settling && edge.settling ? ' is-settling' : ''}`}
        // Both gestures move the same sheet, on their own axes, and neither
        // can be running while the other is: `usePointerDrag` locks an axis
        // for the life of a gesture and these two are locked to different ones.
        style={{ transform: `translate3d(${edge.offset}px, ${down.offset}px, 0)` }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="mobile-sheet-grip" {...down.handlers}>
          <span className="mobile-sheet-grabber" aria-hidden />
          <header>
            <h2>{title}</h2>
            <button type="button" onClick={onClose} aria-label={`Close ${title}`}><MobileIcon name="close" scale="action" /></button>
          </header>
        </div>
        {children}
      </section>
    </div>
  )
  // Into `.mobile-app`, not the calling screen, which is transformed — see
  // docs/IOS.md. The host is the shell rather than the body because the
  // shell's resets are scoped to it.
  const host = typeof document === 'undefined' ? null : document.querySelector('.mobile-app')
  return host ? createPortal(layer, host) : layer
}

/**
 * One row in a sheet: a glyph, a name, and a trailing mark.
 *
 * Two kinds of row, one component. A row that GOES somewhere ends in a
 * chevron, which is what `selected` being absent means. A row that CHOOSES
 * ends in a checkmark when it is the choice and in nothing when it is not —
 * the mailbox picker and the label picker had each drawn that row out by hand
 * rather than this one, differing only in whether being chosen is the one
 * current view or a toggle that is on.
 */
export function SheetAction({
  icon,
  label,
  destructive = false,
  selected,
  toggle = false,
  disabled = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  destructive?: boolean
  /** A row that chooses. Omit it for a row that goes somewhere. */
  selected?: boolean
  /** Whether being chosen is a toggle, or the one current choice. */
  toggle?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const chooses = selected !== undefined
  return (
    <button
      className={[destructive ? 'is-destructive' : '', selected ? 'is-current' : ''].filter(Boolean).join(' ')}
      type="button"
      disabled={disabled}
      aria-pressed={chooses && toggle ? selected : undefined}
      aria-current={chooses && !toggle && selected ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="mobile-sheet-icon">{icon}</span>
      <span>{label}</span>
      {chooses
        ? selected && <MobileIcon name="check" scale="action" />
        : <MobileIcon name="chevronRight" />}
    </button>
  )
}
