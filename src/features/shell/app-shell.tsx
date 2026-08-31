// The three-pane frame. Measures come from DIRECTION §5 and are passed in
// pixels, so the panes hold their decided widths at any window size.

import { useEffect, useMemo, useRef } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { ThreadList } from '@/features/list/thread-list'
import { useUi } from '@/features/mail/ui-store'
import { ReadingPane } from '@/features/reading/reading-pane'
import { Sidebar } from '@/features/sidebar/sidebar'
import { cn } from '@/lib/utils'

/**
 * The panel library wants numbers, and the measures are tokens — so they are
 * read off the document rather than restated here. The fallbacks are the same
 * values tokens.css holds, for the case where the stylesheet has not landed.
 */
function pxToken(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Snap a panel to whole pixels.
 *
 * The library stores sizes as percentages and lays the panes out with
 * `flex-grow`, so a 248 px sidebar resolved to 248.172 px and every pane edge —
 * a real 1 px separator — landed between two device pixels, which is exactly
 * the blurry hairline DIRECTION §6 forbids. It also put every column inside the
 * list on a fractional origin, so text rasterized at sub-pixel offsets that
 * differed pane to pane (UI-REVIEW-2026-08-28 S7).
 *
 * Writing the rounded value back in pixels makes the library recompute the
 * percentage against the same free width, which lands on the integer. The
 * epsilon is what stops it running again on its own answer.
 */
function snapToWholePixels(panel: PanelImperativeHandle | null, inPixels: number): void {
  if (!panel) return
  // A collapsed panel is at its `collapsedSize` and is not the user's to
  // measure: resizing it here would take it out of the collapsed state, and the
  // effect below would collapse it straight back.
  if (panel.isCollapsed()) return
  const rounded = Math.round(inPixels)
  if (Math.abs(inPixels - rounded) < 0.02) return
  panel.resize(`${rounded}px`)
}

/**
 * Both channels, from one string.
 *
 * Invisible at rest, so a channel reads as ground rather than as a seam; the
 * line appears only when it is reached for. `after:w-2` widens the grab strip
 * from 4 to 8 px, which stays inside the empty channel and steals no click.
 *
 * Neither channel is stroked at rest. A channel is ground showing between two
 * cards, and ground is not a separator — DIRECTION §6.
 */
const CHANNEL_HANDLE =
  'bg-transparent hover:bg-brand/40 transition-colors duration-(--wren-dur-fast) after:w-2'

/** Collapse snaps once a drag comes within this of the collapsed width. */
const SNAP_SLACK = 8

/**
 * A shell card: the sidebar and the list, which are the two things that float
 * on the ground. (The reading region is the ground, so it is not one.)
 *
 * No `ring-1` — every --wren-shadow-* carries `0 0 0 1px` as its first layer,
 * so `shadow-xs` IS the border (DIRECTION §6). The radius is 18 because a
 * card's 8px inset then leaves 10 inside, which is --wren-radius-row: the
 * thread rows have been drawing the inside of this card since they shipped.
 */
export const SHELL_CARD =
  'bg-surface rounded-xl shadow-xs flex min-h-0 flex-1 flex-col overflow-hidden'

export function AppShell() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  // Nothing open ⇒ the whole ground is the character's field, channels
  // included, and the sidebar and list read as cards floating on it. The
  // reading pane goes transparent in that state so this shows through it.
  const atRest = useUi((s) => s.selected === null)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)
  const sidebarRef = useRef<PanelImperativeHandle | null>(null)
  const listRef = useRef<PanelImperativeHandle | null>(null)

  // Sidebar and list measures are CARD widths (tokens.css says so at each
  // group). A panel is its card plus the padding below, and that padding is
  // the ground channel the card floats on.
  const measures = useMemo(
    () => ({
      sidebar: pxToken('--wren-sidebar-w', 248),
      sidebarMin: pxToken('--wren-sidebar-w-min', 200),
      sidebarMax: pxToken('--wren-sidebar-w-max', 320),
      sidebarCollapsed: pxToken('--wren-sidebar-w-collapsed', 68),
      gutter: pxToken('--wren-sidebar-gutter', 8),
      seam: pxToken('--wren-shell-seam', 4),
      list: pxToken('--wren-list-w', 400),
      listMin: pxToken('--wren-list-w-min', 340),
      listMax: pxToken('--wren-list-w-max', 520),
    }),
    [],
  )
  // Card → panel. Two quantities, and the difference is the idea: the gutter
  // is ground that ENDS at the window frame, the seam is ground that CONTINUES
  // past a card. So the sidebar pays a gutter on its left and a seam on its
  // right; the list pays a seam on both. The resulting channels are NOT equal —
  // sidebar-to-list is seam + handle + seam (9px), list-to-reading is seam +
  // handle (5px), because the reading region contributes no padding of its own.
  const SIDEBAR_PAD = measures.gutter + measures.seam
  const LIST_PAD = measures.seam * 2

  // The footer button drives the panel; dragging the handle past the min
  // drives the store. Both end up at the same place.
  useEffect(() => {
    const panel = sidebarRef.current
    if (!panel) return
    if (collapsed && !panel.isCollapsed()) panel.collapse()
    if (!collapsed && panel.isCollapsed()) panel.expand()
  }, [collapsed])

  return (
    // No titlebar row. `titleBarStyle: "Overlay"` with `hiddenTitle: true`
    // already hands the webview the whole window on macOS, so the panes start
    // at y=0 and the traffic lights land on the sidebar card's own top band —
    // Apple Mail's arrangement. Deleting the strip rather than filling it is
    // what buys the list 52 px of body (11.0 rows at --wren-row-h instead of
    // 10.2 at 1280×800); every control that could have filled it already lives
    // in the list header or the sidebar footer.
    <div className={cn('bg-canvas h-full', atRest && 'wren-empty')}>
      <ResizablePanelGroup className="h-full">
        <ResizablePanel
          panelRef={sidebarRef}
          // The library's inner div takes the padding, which is why the card
          // itself must never carry a margin — one layer owns the channel.
          defaultSize={measures.sidebar + SIDEBAR_PAD}
          minSize={measures.sidebarMin + SIDEBAR_PAD}
          maxSize={measures.sidebarMax + SIDEBAR_PAD}
          collapsible
          collapsedSize={measures.sidebarCollapsed + SIDEBAR_PAD}
          onResize={(size) => {
            setCollapsed(size.inPixels <= measures.sidebarCollapsed + SIDEBAR_PAD + SNAP_SLACK)
            snapToWholePixels(sidebarRef.current, size.inPixels)
          }}
          // The card's LEFT edge must stay at x=8: place_traffic_lights in the
          // Rust puts the lights there, and tests/traffic-lights.test.ts holds
          // the pair together.
          className="flex min-h-0 flex-col py-(--wren-sidebar-gutter) pl-(--wren-sidebar-gutter) pr-(--wren-shell-seam)"
        >
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle className={CHANNEL_HANDLE} />
        <ResizablePanel
          panelRef={listRef}
          defaultSize={measures.list + LIST_PAD}
          minSize={measures.listMin + LIST_PAD}
          maxSize={measures.listMax + LIST_PAD}
          onResize={(size) => snapToWholePixels(listRef.current, size.inPixels)}
          className="flex min-h-0 flex-col py-(--wren-sidebar-gutter) px-(--wren-shell-seam)"
        >
          <ThreadList />
        </ResizablePanel>
        <ResizableHandle className={CHANNEL_HANDLE} />
        {/* No padding, no card. The reading region IS the ground — it runs
            full-bleed to the window's top, right and bottom edges, and it is
            what the other two float on. Rounding it would delete the ~610 px
            field that makes the channels read as ground rather than as
            cracks, and it would put white paper on a white card on a white
            pane with a 4%-alpha ring as the only separator. */}
        <ResizablePanel minSize={360}>
          <ReadingPane />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
