import type { ReactNode } from 'react'
import { ChevronRight, X } from 'lucide-react'

export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="mobile-sheet-layer mobile-bottom-layer"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="mobile-bottom-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="mobile-sheet-grabber" aria-hidden />
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
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
      <span className="mobile-sheet-icon">{icon}</span><span>{label}</span><ChevronRight size={17} />
    </button>
  )
}
