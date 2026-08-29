// The window strip. In Tauri it is the drag region and it makes room for the
// native window controls; in a browser it is a quiet header that keeps the
// three panes from starting hard against the top of the viewport.
//
// There is exactly one wordmark in the app, and it is the span below. macOS
// used to draw a second one: the window carried a visible native title bar
// rendering `Wren` from tauri.conf.json, directly above this strip rendering
// `Wren` again. The window is now `titleBarStyle: "Overlay"` with
// `hiddenTitle: true`, so the native bar keeps its traffic lights, drops its
// text, and lets this strip be the title bar — which is what the `pl-20` below
// always assumed. The `title` field stays set, because it is what the window
// is called in Mission Control, the Window menu and the Dock.
//
// Windows is untouched: both of those fields are macOS-only, and the overlay
// controls still get their reserved 140 px on the trailing edge.

import { IconButton } from '@/components/wren-controls'
import { isTauri, platformOS } from '@/lib/env'
import { useUi } from '@/features/mail/ui-store'
import { cn } from '@/lib/utils'

export function Titlebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)
  const native = isTauri()

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'bg-canvas relative z-10 flex h-(--wren-titlebar-h) shrink-0 items-center gap-2',
        // macOS traffic lights sit in the top-left of the window itself, so the
        // strip starts after them. Windows draws its overlay controls on the
        // right, so the strip ends before them.
        native && platformOS === 'mac' ? 'pl-20' : 'pl-4',
        native && platformOS === 'windows' ? 'pr-[140px]' : 'pr-2',
      )}
    >
      <span
        data-tauri-drag-region
        className="font-ui text-ink-3 pointer-events-none text-xs font-semibold"
      >
        Wren
      </span>
      <div data-tauri-drag-region className="flex-1" />
      {/* 18: chrome toolbar, DIRECTION §8's default (S8). */}
      <IconButton
        name="panelLeft"
        label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setCollapsed(!collapsed)}
      />
    </header>
  )
}
