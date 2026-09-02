import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { MobileIcon } from './mobile-icon'
import { useBodyScrollLock } from '../use-body-scroll-lock'
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
  useBodyScrollLock()
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
  // Into the shell root, not the calling screen. The thread and account screens
  // keep a transform from their push animation, and a transformed ancestor is
  // the containing block for a fixed child — the sheet would be pinned to the
  // bottom of a page-tall screen instead of the bottom of the phone. The host
  // is `.mobile-app` rather than the body because the shell's resets are
  // scoped to it.
  const host = typeof document === 'undefined' ? null : document.querySelector('.mobile-app')
  return host ? createPortal(layer, host) : layer
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
