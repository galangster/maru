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

export function AppShell() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)
  const sidebarRef = useRef<PanelImperativeHandle | null>(null)

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
          onResize={(size) => setCollapsed(size.inPixels <= measures.sidebarCollapsed + 8)}
        >
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle className="bg-hairline hover:bg-brand/40 transition-colors duration-(--wren-dur-fast)" />
        <ResizablePanel
          defaultSize={measures.list}
          minSize={measures.listMin}
          maxSize={measures.listMax}
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
