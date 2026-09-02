import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { MobileIcon } from './mobile-icon'
import { useHapticBoundary } from '../use-native-shell'
import { useModalFocus } from '../use-modal-focus'

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
  const layer = (
    <div
      className="mobile-sheet-layer mobile-bottom-layer"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section ref={dialogRef} className="mobile-bottom-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <span className="mobile-sheet-grabber" aria-hidden />
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}><MobileIcon name="close" scale="action" /></button>
        </header>
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
