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

export function AppShell() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)
  const sidebarRef = useRef<PanelImperativeHandle | null>(null)
  const listRef = useRef<PanelImperativeHandle | null>(null)

  // The four sidebar measures are CARD widths (tokens.css says so at the
  // group). The panel is the card plus a gutter each side, and that padding is
  // the visible ground channel the card floats on.
  const measures = useMemo(
    () => ({
      sidebar: pxToken('--wren-sidebar-w', 248),
      sidebarMin: pxToken('--wren-sidebar-w-min', 200),
      sidebarMax: pxToken('--wren-sidebar-w-max', 320),
      sidebarCollapsed: pxToken('--wren-sidebar-w-collapsed', 56),
      gutter: pxToken('--wren-sidebar-gutter', 8),
      list: pxToken('--wren-list-w', 400),
      listMin: pxToken('--wren-list-w-min', 340),
      listMax: pxToken('--wren-list-w-max', 520),
    }),
    [],
  )
  /** Card → panel. Every size handed to the library carries it. */
  const pad = measures.gutter * 2

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
    <div className="bg-canvas h-full">
      <ResizablePanelGroup className="h-full">
        <ResizablePanel
          panelRef={sidebarRef}
          // Card + gutter each side. The library's inner div takes the padding,
          // so the ground channel is the panel's own margin around the card.
          defaultSize={measures.sidebar + pad}
          minSize={measures.sidebarMin + pad}
          maxSize={measures.sidebarMax + pad}
          collapsible
          collapsedSize={measures.sidebarCollapsed + pad}
          onResize={(size) => {
            setCollapsed(size.inPixels <= measures.sidebarCollapsed + pad + 8)
            snapToWholePixels(sidebarRef.current, size.inPixels)
          }}
          className="flex min-h-0 flex-col p-(--wren-sidebar-gutter)"
        >
          <Sidebar />
        </ResizablePanel>
        {/* Invisible at rest, so the 8 px channel reads as ground rather than
            as a seam; the line appears only when it is reached for. `after:w-2`
            widens the grab strip from 4 to 8 px — entirely inside the empty
            gutter and the list's own `px-4`, so it steals no click from the
            card or from a row. */}
        <ResizableHandle className="bg-transparent hover:bg-brand/40 transition-colors duration-(--wren-dur-fast) after:w-2" />
        <ResizablePanel
          panelRef={listRef}
          defaultSize={measures.list}
          minSize={measures.listMin}
          maxSize={measures.listMax}
          onResize={(size) => snapToWholePixels(listRef.current, size.inPixels)}
        >
          <ThreadList />
        </ResizablePanel>
        <ResizableHandle className="bg-hairline hover:bg-brand/40 transition-colors duration-(--wren-dur-fast)" />
        <ResizablePanel minSize={360}>
          <ReadingPane />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
