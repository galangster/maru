// The window strip. In Tauri it is the drag region and it makes room for the
// native window controls; in a browser it is a quiet header that keeps the
// three panes from starting hard against the top of the viewport.
//
// There is no wordmark here at all — Nick's ruling (2026-08-29): the dock
// icon introduces the app; chrome that says its own name is noise. The window
// is `titleBarStyle: "Overlay"` with `hiddenTitle: true`, so the native bar
// keeps its traffic lights and no text. The `title` field stays set in
// tauri.conf.json, because it is what the window is called in Mission
// Control, the Window menu and the Dock.
//
// THE GRID. The strip used to hold a bare `pl-20` on macOS and `pl-4`
// everywhere else — two numbers that agreed with nothing, which is what made
// the top-left read as an accident:
//
//   · 80 px was one guess at where the traffic lights end, restated in a
//     utility class where nothing could check it against the (16, 11) inset
//     tauri.conf.json actually sets.
//   · 16 px was a second, unrelated guess for the browser case, and it did not
//     match the 12 px the sidebar directly beneath it indents its own content
//     by — so the wordmark sat 4 px to the right of the Compose button below
//     it, which is exactly the kind of near-miss that reads as wrong without
//     announcing why.
//
// Both are now measures. The lights zone is `--wren-titlebar-lights-w`,
// derived from the inset in tauri.conf.json and carrying the same 12 px gutter
// the sidebar uses; everywhere the lights are absent the strip falls back to
// that gutter alone, so the wordmark starts on the sidebar's own content
// column. Windows keeps its reserved trailing space, from a measure now too.

import { IconButton } from '@/components/wren-controls'
import { isTauri, platformOS } from '@/lib/env'
import { useUi } from '@/features/mail/ui-store'
import { cn } from '@/lib/utils'

export function Titlebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)
  const native = isTauri()
  const macOverlay = native && platformOS === 'mac'

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'bg-canvas relative z-10 flex h-(--wren-titlebar-h) shrink-0 items-center gap-2',
        // macOS traffic lights sit in the top-left of the window itself, so the
        // strip starts after them. Everywhere else it starts on the sidebar's
        // content column — `pl-3` is the `px-3` the nav directly beneath this
        // strip indents by, so the wordmark and the Compose button share one
        // left edge.
        macOverlay ? 'pl-(--wren-titlebar-lights-w)' : 'pl-3',
        // Windows draws its overlay controls on the right, so the strip ends
        // before them.
        native && platformOS === 'windows' ? 'pr-(--wren-titlebar-overlay-w)' : 'pr-2',
      )}
    >
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
