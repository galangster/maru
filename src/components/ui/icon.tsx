// The icon seam — DIRECTION.md §8.
//
// Every icon in Wren comes from here, by semantic name. No component imports
// from `lucide-react` directly, which is what made the swap below a one-file
// change.
//
// ANRON SWAP — done. The glyphs are now the owner's Anron set (Style=Line),
// pulled from Figma and normalized into `ANRON_PATHS` in ./icon-glyphs. The
// only lucide left is HOLDOUTS, below.
//
// Size grid: 16 inline with text and meta · 18 toolbars and menus · 20 sidebar
// nav and primary actions. Never 24 in chrome.
// Stroke: 1.5 on the 24 grid, scaling naturally with the box — Anron is drawn
// at 1.5@24, so 16/18/20 land on 1.0/1.125/1.25 and read as one family. The
// old size-dependent 1.75/1.5 branch was a lucide correction (lucide's default
// 2 reads hard next to Open Runde) and no longer applies.

import { MailOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { ANRON_PATHS } from './icon-glyphs'

/**
 * Names with no honest Anron Line equivalent, still served by lucide.
 *
 * · `read` — Anron ships `email` (closed envelope, used for `unread`) but no
 *   open-envelope glyph in any style. Nothing else in the set carries
 *   "already read" without changing what the icon means. Revisit if Anron adds
 *   one; the swap is a single line here.
 */
const HOLDOUTS = {
  read: MailOpen,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ANRON_PATHS | keyof typeof HOLDOUTS

/** The three permitted sizes. 24 is the icon *box*, never the glyph. */
export type IconSize = 16 | 18 | 20

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  name: IconName
  size?: IconSize
  /** Star and similar duotone-by-fill glyphs. */
  filled?: boolean
}

function isHoldout(name: IconName): name is keyof typeof HOLDOUTS {
  return name in HOLDOUTS
}

export function Icon({ name, size = 18, filled = false, className, ...props }: IconProps) {
  // Shared across both branches so a holdout cannot drift from the Anron
  // glyphs on weight, caps or the size grid.
  const shared = {
    'aria-hidden': true,
    focusable: false,
    width: size,
    height: size,
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: filled ? 'currentColor' : 'none',
    // No `vector-effect: non-scaling-stroke`. DIRECTION §8 asks for it, but
    // it is what made a 16 px glyph scaled down by CSS keep its stroke on a
    // 12 px box — ~33% heavier than every other icon in the app
    // (UI-REVIEW-2026-08-28 S9). With the stroke scaling with the viewBox,
    // an off-grid glyph now reads *lighter* rather than heavier, which fails
    // quietly instead of loudly; the call sites that forced one are gone.
    className: cn('shrink-0', className),
  } as const

  if (isHoldout(name)) {
    const Glyph = HOLDOUTS[name]
    return <Glyph {...shared} {...props} />
  }

  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...shared} {...props}>
      {ANRON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
