import type { ReactNode } from 'react'
import { WrenPerched } from '@/components/wren-figure'
import { useMotionMode } from '@/lib/motion'

export function EmptyInbox() {
  const motion = useMotionMode()
  return (
    <div className="mobile-empty-state">
      <WrenPerched alive={motion === 'full'} className="mobile-empty-wren" />
      <h2>All caught up</h2>
      <p>New mail will land here. Until then, Maru is keeping watch.</p>
    </div>
  )
}

export function MobileListSkeleton({ className = '' }: { className?: string }) {
  return <div className={`mobile-list-skeleton${className ? ` ${className}` : ''}`} role="status" aria-label="Loading"><span /><span /><span /><span /><span /></div>
}

export function MobilePrompt({ icon, title, copy, className = '', children }: { icon: ReactNode; title: string; copy: string; className?: string; children?: ReactNode }) {
  return <div className={`mobile-prompt${className ? ` ${className}` : ''}`}><span>{icon}</span><h2>{title}</h2><p>{copy}</p>{children}</div>
}
