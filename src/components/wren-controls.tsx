// The three chrome atoms every pane repeats: an icon button on the 32 px hit
// box, an account-tinted avatar, and the account dot. Kept together because
// they are the only places a saturated colour is allowed to appear at rest.

import type { CSSProperties } from 'react'

import { Icon, type IconName, type IconSize } from '@/components/ui/icon'
import type { EmailAddress } from '@/core/types'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'star' | 'danger' | 'brand'

const TONES: Record<Tone, string> = {
  default: 'text-ink-3 hover:text-ink',
  brand: 'text-brand hover:text-brand',
  star: 'text-star hover:text-star',
  danger: 'text-ink-3 hover:text-destructive',
}

export interface IconButtonProps extends Omit<React.ComponentProps<'button'>, 'children'> {
  name: IconName
  /** Accessible name. Also the native tooltip. */
  label: string
  size?: IconSize
  tone?: Tone
  filled?: boolean
  active?: boolean
}

export function IconButton({
  name,
  label,
  size = 18,
  tone = 'default',
  filled = false,
  active = false,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md outline-none',
        'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        'hover:bg-fill-hover focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:pointer-events-none disabled:opacity-40',
        TONES[tone],
        active && 'text-brand',
        className,
      )}
      {...props}
    >
      <Icon name={name} size={size} filled={filled} />
    </button>
  )
}

/** 32 px circular chip, tinted by the account colour. The one saturated
 *  element in a list row — Family's lesson, and the reason rows need no
 *  borders to stay scannable. */
export function AccountAvatar({
  address,
  color,
  className,
}: {
  address: EmailAddress
  color: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={{ '--dot': color } as CSSProperties}
      className={cn(
        'font-ui inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        'bg-[color-mix(in_oklab,var(--dot)_16%,transparent)] text-[color-mix(in_oklab,var(--dot)_86%,black)]',
        'dark:bg-[color-mix(in_oklab,var(--dot)_28%,transparent)] dark:text-[color-mix(in_oklab,var(--dot)_55%,white)]',
        className,
      )}
    >
      {initials(address)}
    </span>
  )
}

/** 6 px dot. Marks which account a row in a unified view came from. */
export function AccountDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: color }}
      className={cn('inline-block size-1.5 shrink-0 rounded-full', className)}
    />
  )
}
