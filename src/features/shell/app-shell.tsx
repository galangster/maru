// The three-pane frame. Measures come from DIRECTION §5 and are passed in
// pixels, so the panes hold their decided widths at any window size.

import { useEffect, useRef } from 'react'
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

const SIDEBAR_COLLAPSED = 64

export function AppShell() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)
  const sidebarRef = useRef<PanelImperativeHandle | null>(null)

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
          defaultSize={248}
          minSize={200}
          maxSize={320}
          collapsible
          collapsedSize={SIDEBAR_COLLAPSED}
          onResize={(size) => setCollapsed(size.inPixels <= SIDEBAR_COLLAPSED + 8)}
        >
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle className="bg-hairline hover:bg-brand/40 transition-colors duration-(--wren-dur-fast)" />
        <ResizablePanel defaultSize={400} minSize={340} maxSize={520}>
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
