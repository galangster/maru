import type { ReactNode } from 'react'
import { MobileIcon } from './mobile-icon'
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
  return (
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
}

export function SheetAction({
  icon,
  label,
  destructive = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button className={destructive ? 'is-destructive' : ''} type="button" onClick={onClick}>
      <span className="mobile-sheet-icon">{icon}</span><span>{label}</span><MobileIcon name="chevronRight" />
    </button>
  )
}
