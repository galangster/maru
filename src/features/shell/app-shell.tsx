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

import { Titlebar } from './titlebar'

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

  const measures = useMemo(
    () => ({
      sidebar: pxToken('--wren-sidebar-w', 248),
      sidebarCollapsed: pxToken('--wren-sidebar-w-collapsed', 64),
      list: pxToken('--wren-list-w', 400),
      listMin: pxToken('--wren-list-w-min', 340),
      listMax: pxToken('--wren-list-w-max', 520),
    }),
    [],
  )

  // The titlebar button drives the panel; dragging the handle past the min
  // drives the store. Both end up at the same place.
  useEffect(() => {
    const panel = sidebarRef.current
    if (!panel) return
    if (collapsed && !panel.isCollapsed()) panel.collapse()
    if (!collapsed && panel.isCollapsed()) panel.expand()
  }, [collapsed])

  return (
    <div className="bg-canvas flex h-full flex-col">
      <Titlebar />
      <ResizablePanelGroup className="min-h-0 flex-1">
        <ResizablePanel
          panelRef={sidebarRef}
          defaultSize={measures.sidebar}
          minSize={200}
          maxSize={320}
          collapsible
          collapsedSize={measures.sidebarCollapsed}
          onResize={(size) => {
            setCollapsed(size.inPixels <= measures.sidebarCollapsed + 8)
            snapToWholePixels(sidebarRef.current, size.inPixels)
          }}
        >
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle className="bg-hairline hover:bg-brand/40 transition-colors duration-(--wren-dur-fast)" />
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
