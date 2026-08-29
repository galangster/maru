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

import { ANRON_FILLED_PATHS, ANRON_PATHS } from './icon-glyphs'

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
  /**
   * Draw the Style=Filled twin instead of Style=Line — the star when it is on,
   * a sidebar folder when it is the current view. Filled *and* coloured is
   * what "selected" looks like in this system; Line is resting.
   *
   * Only the four glyphs in ANRON_FILLED_PATHS have a twin. Anything else
   * draws its Line paths unchanged and warns once in dev — see the `fill`
   * note below for why filling them is never the right fallback.
   */
  filled?: boolean
}

function isHoldout(name: IconName): name is keyof typeof HOLDOUTS {
  return name in HOLDOUTS
}

function hasFilledTwin(name: IconName): name is keyof typeof ANRON_FILLED_PATHS {
  return name in ANRON_FILLED_PATHS
}

/** Names already warned about, so a virtualized list logs once, not per row. */
const warned = new Set<string>()

function warnMissingTwin(name: IconName): void {
  if (!import.meta.env.DEV || warned.has(name)) return
  warned.add(name)
  console.warn(
    `[wren] Icon "${name}" has no Style=Filled twin; drawing the Line glyph. ` +
      'Add it to ANRON_FILLED_PATHS, or drop `filled` at the call site.',
  )
}

export function Icon({ name, size = 18, filled = false, className, ...props }: IconProps) {
  const twin = filled && hasFilledTwin(name)
  if (filled && !twin) warnMissingTwin(name)
  // Shared across both branches so a holdout cannot drift from the Anron
  // glyphs on weight, caps or the size grid.
  const shared = {
    'aria-hidden': true,
    focusable: false,
    width: size,
    height: size,
    // A filled twin is a solid shape: it carries no stroke at all, or the
    // 1.5 px outline would fatten every edge by three quarters of a pixel and
    // swallow the counters the Filled variant is drawn with.
    strokeWidth: twin ? 0 : 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    // `twin`, not `filled`: only a glyph *drawn* as a solid may be filled.
    // Flooding an open Line glyph with currentColor closes its counters and
    // turns a 1.5 px outline into a blob — a silent, ugly failure for a name
    // that simply has no Filled twin yet. It falls back to Line instead.
    fill: twin ? 'currentColor' : 'none',
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

  const paths: readonly string[] = twin ? ANRON_FILLED_PATHS[name] : ANRON_PATHS[name]

  return (
    <svg viewBox="0 0 24 24" stroke={twin ? 'none' : 'currentColor'} {...shared} {...props}>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
