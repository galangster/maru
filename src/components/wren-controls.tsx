// The chrome atoms every pane repeats: the primary button, an icon button on
// the 32 px hit box, a keycap, an account-tinted avatar, and the account dot.
// Kept together because they are the only places a saturated colour is allowed
// to appear at rest.

import { useState, type CSSProperties } from 'react'

import { Icon, type IconName, type IconSize } from '@/components/ui/icon'
import type { EmailAddress } from '@/core/types'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export type Tone = 'default' | 'star' | 'danger' | 'brand'

const TONES: Record<Tone, string> = {
  default: 'text-ink-3 hover:text-ink',
  brand: 'text-brand hover:text-brand',
  star: 'text-star hover:text-star',
  danger: 'text-ink-3 hover:text-destructive',
}

const ICON_BUTTON_BASE =
  'inline-flex size-8 items-center justify-center rounded-md outline-none ' +
  'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out) ' +
  'hover:bg-fill-hover focus-visible:ring-3 focus-visible:ring-ring/50 ' +
  'disabled:pointer-events-none disabled:opacity-40'

/**
 * The icon-button recipe, for the few places that cannot render <IconButton>
 * itself — a Base UI trigger needs to own the element it clones.
 */
export function iconButtonClass(tone: Tone = 'default', className?: string): string {
  return cn(ICON_BUTTON_BASE, TONES[tone], className)
}

/**
 * The one primary action on a surface: compose, send, add account, get
 * started. Height and padding are the caller's — the colour, the elevation,
 * the hover, the focus ring and the disabled state are not.
 */
export function PrimaryButton({
  className,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'font-ui bg-primary text-primary-foreground inline-flex items-center justify-center rounded-md text-base font-medium',
        'shadow-xs transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        'hover:bg-brand-hover focus-visible:ring-3 focus-visible:ring-ring/50 outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}

/** A key, as printed. The palette's footer and the "?" sheet share it. */
export function Keycap({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        'font-ui text-ink-3 bg-sunken inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-xs px-1 text-xs',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export interface IconButtonProps extends Omit<React.ComponentProps<'button'>, 'children'> {
  name: IconName
  /** Accessible name. Also the native tooltip. */
  label: string
  size?: IconSize
  tone?: Tone
  filled?: boolean
  active?: boolean
  /** Give the glyph a 200 ms pop on press. Reserved for the star. */
  pop?: boolean
}

export function IconButton({
  name,
  label,
  size = 18,
  tone = 'default',
  filled = false,
  active = false,
  pop = false,
  className,
  onClick,
  ...props
}: IconButtonProps) {
  // Counting presses rather than holding a boolean: the key remounts the span,
  // which is what makes a CSS animation run a second time. Zero means "not yet
  // pressed", so nothing pops on mount — including the starred rows that
  // scroll into view in a virtualized list.
  const [presses, setPresses] = useState(0)

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      onClick={(event) => {
        if (pop) setPresses((n) => n + 1)
        onClick?.(event)
      }}
      className={iconButtonClass(tone, cn(active && 'text-brand', className))}
      {...props}
    >
      <span
        key={presses}
        className="inline-flex"
        data-wren-pop={pop && presses > 0 ? '' : undefined}
      >
        <Icon name={name} size={size} filled={filled} />
      </span>
    </button>
  )
}

/** 32 px circular chip, tinted by the account colour. The one saturated
 *  element in a list row — Family's lesson, and the reason rows need no
 *  borders to stay scannable. */
export function AccountAvatar({
  address,
  color,
  ring = false,
  className,
}: {
  address: EmailAddress
  color: string
  /** Draw a full-chroma hairline around the chip, for unified views where the
   *  row has to say which account it came from. */
  ring?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={{ '--dot': color } as CSSProperties}
      className={cn(
        'font-ui inline-flex size-(--wren-avatar) shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        'bg-[color-mix(in_oklab,var(--dot)_16%,transparent)] text-[color-mix(in_oklab,var(--dot)_86%,black)]',
        'dark:bg-[color-mix(in_oklab,var(--dot)_28%,transparent)] dark:text-[color-mix(in_oklab,var(--dot)_55%,white)]',
        // An inset hairline, not a `ring`: it costs no layout, needs no offset
        // colour, and stays exactly 1 px on every DPI (DIRECTION §6).
        ring && 'shadow-[inset_0_0_0_1px_var(--dot)]',
        className,
      )}
    >
      {initials(address)}
    </span>
  )
}

/** Marks which account a row in a unified view came from.
 *
 *  6 px is a licensed exception to DIRECTION §5's 4 px grid: it is a glyph
 *  diameter, not a measure — nothing aligns to it, and it sits inside boxes
 *  that are themselves on the grid. 4 px disappears at 100% DPI and 8 px reads
 *  as a bullet rather than a marker. */
export function AccountDot({
  color,
  className,
  title,
}: {
  color: string
  className?: string
  title?: string
}) {
  return (
    <span
      aria-hidden
      title={title}
      style={{ backgroundColor: color }}
      className={cn('inline-block size-1.5 shrink-0 rounded-full', className)}
    />
  )
}
