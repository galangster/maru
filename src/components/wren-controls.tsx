// The chrome atoms every pane repeats: the primary button, an icon button on
// the 32 px hit box, a keycap, an account-tinted avatar, and the account dot.
// Kept together because they are the only places a saturated colour is allowed
// to appear at rest.

import { useState, type CSSProperties } from 'react'

import { Icon, type IconName, type IconSize } from '@/components/ui/icon'
import { Tooltip, TooltipContent, TooltipHint, TooltipTrigger } from '@/components/ui/tooltip'
import type { EmailAddress } from '@/core/types'
import { initials } from '@/lib/format'
import { hueSolid, hueVars, type Hue } from '@/lib/hue'
import { cn } from '@/lib/utils'

export type Tone =
  | 'default'
  | 'star'
  | 'starHover'
  | 'danger'
  | 'brand'
  | 'success'
  | 'info'

/**
 * Resting icons stay in the ink tiers; hover reveals the action's own colour
 * (owner ruling 2026-08-31 — trash was the only action that coloured, "which
 * feels weird"). `star` is the already-on state; `starHover` is the invitation.
 */
const TONES: Record<Tone, string> = {
  default: 'text-ink-3 hover:text-ink',
  brand: 'text-brand hover:text-brand',
  star: 'text-star hover:text-star',
  starHover: 'text-ink-3 hover:text-star',
  danger: 'text-ink-3 hover:text-destructive',
  success: 'text-ink-3 hover:text-success',
  info: 'text-ink-3 hover:text-hue-blue',
}

/**
 * Press feedback — MAGIC §3.2. Exactly 0.96, never below 0.95, and only on the
 * pointer: a button activated from the keyboard already reports itself through
 * the focus ring, and scaling it there would put motion on a path the audit
 * rules must stay at zero cost. `:focus-visible:active` carries one more
 * pseudo-class than `:active`, so it wins the tie and cancels the scale.
 *
 * Reduced motion drops the scale and keeps the colour transition.
 */
export const PRESS =
  'motion-safe:active:scale-[0.96] motion-safe:focus-visible:active:scale-100'

const ICON_BUTTON_BASE =
  'focus-ring inline-flex size-8 items-center justify-center rounded-md ' +
  'transition-[color,background-color,scale] duration-(--wren-dur-fast) ease-(--wren-ease-out) ' +
  `${PRESS} ` +
  'hover:bg-fill-hover ' +
  'disabled:pointer-events-none disabled:opacity-40'

/**
 * The 32 px round chip a row leads with. The avatar is one; so is the archive
 * tick that replaces it mid-animation, and the two have to be the same shape to
 * the pixel or the swap reads as a jump rather than as a state change.
 */
export const AVATAR_CHIP =
  'inline-flex size-(--wren-avatar) shrink-0 items-center justify-center rounded-full'

/**
 * The icon-button recipe, for the few places that cannot render <IconButton>
 * itself — a Base UI trigger needs to own the element it clones.
 */
export function iconButtonClass(tone: Tone = 'default', className?: string): string {
  return cn(ICON_BUTTON_BASE, TONES[tone], className)
}

/**
 * The quiet text button — a surface's secondary action beside its one
 * accent: Audit log, Deny, Copy debug report. Layout (w-fit / shrink-0 /
 * disabled handling) stays the caller's, exactly like `iconButtonClass`.
 */
export function textButtonClass(
  tone: 'default' | 'danger' = 'default',
  className?: string,
): string {
  return cn(
    'font-ui text-ink-2 focus-ring h-8 rounded-full px-3 text-base font-medium',
    'transition-colors duration-(--wren-dur-fast)',
    tone === 'danger'
      ? 'hover:bg-fill-hover hover:text-destructive'
      : 'hover:bg-fill-hover hover:text-ink',
    className,
  )
}

/** A surface's h2. `SurfaceHeader` renders it; the composer, whose chrome sits
 * on its own grid (S8), renders the recipe without the header. */
export const SURFACE_TITLE = 'font-ui text-ink min-w-0 flex-1 truncate text-base font-semibold'

/** Timestamps, sizes, counts — the quiet numerals beside a row's text. */
export const META_TEXT = 'text-ink-3 shrink-0 text-xs tabular-nums'

/**
 * The right-aligned date column the list row and the search row share. One
 * width for both, because subjects across the two row kinds start at the same
 * x only while their trailing columns agree.
 */
export const DATE_COLUMN = `${META_TEXT} w-16 text-right`

/** The uppercase group label settings surfaces and the shortcut sheet share. */
export const SECTION_LABEL = 'font-ui text-ink-3 text-xs font-semibold uppercase'

/**
 * The fixed-width icon slot a repeated row leads with. Width comes from the
 * token, `shrink-0` is the point: gap alone cannot align a column of icons
 * across rows whose text runs long.
 */
export const ICON_SLOT = 'flex w-(--wren-icon-box) shrink-0 items-center justify-center'

/**
 * The send action's sizing, and its confirmation. One recipe for the composer
 * and the approval queue, because the queue's Approve promises to confirm
 * "exactly as the composer runs it" — a promise a shared constant keeps and a
 * second copy lets drift. `disabled:opacity-100` because both call sites
 * disable the button the moment it fires, and the confirmation must not grey.
 */
export const SEND_BUTTON =
  'h-8 gap-2 px-4 transition-[background-color,color] duration-(--wren-dur-fast) ease-(--wren-ease-out)'
export const SEND_CONFIRM = 'bg-hue-green text-hue-fg disabled:opacity-100'

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
        // A pill. Amie uses one for every primary action at both densities
        // (AMIE-STUDY §4.1), and it is the one shape in the app that says
        // "this is the thing to press" without a second colour.
        'font-ui bg-primary text-primary-foreground inline-flex items-center justify-center rounded-full text-base font-medium',
        'shadow-xs transition-[color,background-color,scale] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        PRESS,
        'focus-ring hover:bg-brand-hover',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The 48 px header every full surface opens with: title left, actions right.
 * `title` is a node, not a string, because the queue's count rides inside the
 * h2 where a screen reader announces them together.
 */
export function SurfaceHeader({
  title,
  children,
}: {
  title: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b pr-2 pl-6">
      <h2 className={SURFACE_TITLE}>{title}</h2>
      {children}
    </header>
  )
}

/**
 * A surface's quiet empty block: one glyph, one line, one explanation. Sits at
 * the top of a scroll area rather than centering in it — an empty queue and an
 * empty timeline keep their chrome where the full versions put it.
 */
export function SurfaceEmpty({
  icon,
  title,
  children,
}: {
  icon: IconName
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
      <Icon name={icon} size={20} className="text-ink-3" />
      <p className="font-ui text-ink text-base font-medium">{title}</p>
      <p className="text-ink-3 max-w-80 text-sm text-pretty">{children}</p>
    </div>
  )
}

/**
 * The white-thumb-on-sunken choice group — the theme picker's shape, promoted
 * the day the list lens became its second user. `full` stretches the track and
 * centers each segment; the default hugs its content like the theme picker.
 * `whitespace-nowrap` because a segment that wraps reads as two options.
 */
export function SegmentedGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  full = false,
}: {
  label: string
  value: T
  onChange: (id: T) => void
  options: { id: T; label: string; icon?: IconName }[]
  full?: boolean
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'bg-sunken inline-flex h-9 items-center gap-1 rounded-md p-1',
        full ? 'w-full' : 'w-fit',
      )}
    >
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'font-ui inline-flex h-7 items-center gap-2 rounded-sm px-3 text-base whitespace-nowrap outline-none',
              'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
              'focus-ring',
              full && 'flex-1 justify-center',
              active ? 'bg-surface text-ink font-medium shadow-xs' : 'text-ink-2 hover:text-ink',
            )}
          >
            {option.icon && (
              <Icon name={option.icon} size={16} className={active ? 'text-brand' : 'text-ink-3'} />
            )}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One choice in a small popover list — the filter menu and the label menu
 * share it: aria-pressed, quiet until hovered, a brand check when on.
 */
export function OptionRow({
  selected,
  disabled = false,
  onClick,
  children,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'font-ui flex h-8 items-center justify-between rounded-md px-2 text-left text-base',
        'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        'focus-ring hover:bg-fill-hover disabled:opacity-40',
        selected ? 'text-ink font-medium' : 'text-ink-2',
      )}
    >
      {children}
      {selected && <Icon name="check" size={16} className="text-brand" />}
    </button>
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
  /** Accessible name, and the tooltip's first line. */
  label: string
  /** The key that does the same thing. Printed in the tooltip, Things-3 style:
   *  the slow path teaches the fast one at the moment it is used (MAGIC §2.7). */
  hint?: string
  size?: IconSize
  tone?: Tone
  filled?: boolean
  active?: boolean
  /** Give the glyph a 200 ms pop on press, and crossfade outline → fill.
   *  Reserved for the star. */
  pop?: boolean
}

export function IconButton({
  name,
  label,
  hint,
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
    <Tooltip>
      <TooltipTrigger
        // A real tooltip rather than the native `title`, which waits about a
        // second, cannot be styled, never appears on keyboard focus, and is
        // read inconsistently by screen readers (UI-REVIEW-2026-08-28 S12).
        // `aria-label` stays the accessible name; the popup is presentation.
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active || undefined}
            onClick={(event) => {
              if (pop) setPresses((n) => n + 1)
              onClick?.(event)
            }}
            className={iconButtonClass(tone, cn(active && 'text-brand', className))}
            {...props}
          />
        }
      >
        <span
          key={presses}
          className="inline-flex"
          data-wren-pop={pop && presses > 0 ? '' : undefined}
        >
          {pop ? (
            <FillingGlyph name={name} size={size} filled={filled} />
          ) : (
            <Icon name={name} size={size} filled={filled} />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span>{label}</span>
        {hint && <TooltipHint>{hint}</TooltipHint>}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Outline and fill stacked, crossfading — so the star *fills* rather than being
 * *replaced* (MAGIC §3.4). The fill layer carries the glyph's own semantic
 * colour, which the icon seam supplies, so the bloom is the colour arriving as
 * well as the shape. It used to name the star hue here; the seam names it now,
 * and a second copy of the same answer could only ever drift from it.
 *
 * Opacity only, which is what lets reduced motion keep it: DIRECTION §9 retains
 * the 120 ms crossfade and removes only transform.
 */
function FillingGlyph({
  name,
  size,
  filled,
}: {
  name: IconName
  size: IconSize
  filled: boolean
}) {
  const fade = 'transition-opacity duration-(--wren-dur-fast) ease-(--wren-ease-out)'
  return (
    <span className="relative inline-flex">
      <Icon name={name} size={size} className={cn(fade, filled && 'opacity-0')} />
      <Icon
        name={name}
        size={size}
        filled
        className={cn('absolute inset-0', fade, !filled && 'opacity-0')}
      />
    </span>
  )
}

/**
 * 32 px circular chip, in one of the eight category hues. The one saturated
 * element in a list row — Family's lesson, and the reason rows need no borders
 * to stay scannable.
 *
 * The hue comes from a stable hash of the sender's address (AMIE-STUDY §7b),
 * replacing the six ad-hoc hexes the account palette used to hand out. The
 * chip is the hue's *wash* carrying its *ink*, so the initials are a
 * contrast-verified token rather than a `color-mix` toward black that nothing
 * had measured.
 */
export function AccountAvatar({
  address,
  hue,
  ringHue,
  className,
}: {
  address: EmailAddress
  hue: Hue
  /** Draw a full-chroma hairline around the chip, for unified views where the
   *  row has to say which account it came from. The account's own hue. */
  ringHue?: Hue
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={{ ...hueVars(hue), '--ring-hue': ringHue && hueSolid(ringHue) } as CSSProperties}
      className={cn(
        AVATAR_CHIP,
        'font-ui text-xs font-semibold',
        'bg-(--hue-wash) text-(--hue-ink)',
        // An inset hairline, not a `ring`: it costs no layout, needs no offset
        // colour, and stays exactly 1 px on every DPI (DIRECTION §6).
        ringHue && 'shadow-[inset_0_0_0_1px_var(--ring-hue)]',
        className,
      )}
    >
      {initials(address)}
    </span>
  )
}

/**
 * Amie's coloured squircle — a 28 px tile filled with a hue solid, carrying a
 * white-ish glyph. It is the cheapest place in the app to buy personality, and
 * it is what marks a settings section and a label.
 *
 * The glyph is the hue's own on-solid ink, `--hue-fg`, which is white on the
 * hues where white clears the 3:1 a non-text glyph needs and the fixed dark ink
 * on the ones where it does not. It used to be that dark ink on all eight, and
 * on a saturated blue or violet solid a near-black glyph read as a hole punched
 * in the tile rather than as a mark on it. The measurements, per hue and per
 * theme, are in tokens.css §3.
 */
export function HueTile({
  name,
  hue,
  className,
}: {
  name: IconName
  hue: Hue
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={hueVars(hue)}
      className={cn(
        'inline-flex size-(--wren-tile) shrink-0 items-center justify-center rounded-sm bg-(--hue)',
        className,
      )}
    >
      <Icon name={name} size={16} className="text-(--hue-fg)" />
    </span>
  )
}

/** Marks which account a row in a unified view came from.
 *
 *  6 px is a licensed exception to DIRECTION §5's 4 px grid: it is a glyph
 *  diameter, not a measure — nothing aligns to it, and it sits inside boxes
 *  that are themselves on the grid. 4 px disappears at 100% DPI and 8 px reads
 *  as a bullet rather than a marker. */
export function AccountDot({ hue }: { hue: Hue }) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: hueSolid(hue) }}
      className="inline-block size-1.5 shrink-0 rounded-full"
    />
  )
}
