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
import { selectSidebarRail, useUi } from '@/features/mail/ui-store'
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
 *
 * **Keyboard focus is reaching for it, so it shows the accent too** (issue 45).
 * Both channels are real tab stops that resize with the arrow keys, and they
 * used to be the only stops in the app with nothing on screen to say they had
 * focus. At full strength rather than the hover's 40%: a 1 px line is the
 * thinnest indicator in the build, and it is the only thing marking the stop.
 *
 * `focus-visible:ring-0` takes off the base handle's ring, which is not a
 * second indicator here — a ring drawn around a 1 px-wide element is a ring
 * nobody can see. The background IS the indicator, so the ring is removed
 * rather than left underneath it claiming to be one.
 */
const CHANNEL_HANDLE =
  'bg-transparent hover:bg-brand/40 focus-visible:bg-brand focus-visible:ring-0 ' +
  'transition-colors duration-(--wren-dur-fast) after:w-2'

/** Collapse snaps once a drag comes within this of the collapsed width. */
const SNAP_SLACK = 8

/**
 * The reading region's floor. Its own constant rather than a literal in the
 * JSX, because the narrow-window threshold below is arithmetic over it.
 */
const READING_MIN = 360

/** A channel is `w-px` — see components/ui/resizable.tsx. */
const HANDLE_W = 1

/**
 * One arrow press, in pixels — issue #56.
 *
 * The panel library steps the keyboard by **5% of the group**, which is 80 px
 * at a 1600 px window and 64 at 1280. The sidebar's whole range is 120 px, so a
 * single step crossed most of it: from the 260 px it opens at, one right arrow
 * clamped to the 332 px maximum and one left arrow then took a full step down
 * from there to 252. Right-then-left did not put the pane back, and nothing on
 * the keyboard returned it to where it started. It is the same handler on both
 * channels, so the thread list only escaped because its range is wider than one
 * step.
 *
 * A fixed pixel step is what makes the two arrows opposites. 16 px is four on
 * the 4 px grid and gives the sidebar's 120 px range seven and a half stops —
 * fine enough to place the pane, coarse enough to cross it without holding the
 * key. Home and End still go to the ends, and are untouched.
 */
const ARROW_STEP = 16

/**
 * The arrow keys on a channel, stepped symmetrically — issue #56.
 *
 * The library's own arrow handling is a 5% step, so one press right and one
 * press left do not return a panel to where it started. This replaces it with a
 * fixed ±16 px.
 *
 * It is `onKeyDownCapture` on the separator rather than a listener of our own:
 * the library binds a native `keydown` on the separator ELEMENT, React's
 * delegated capture listener sits on the root above it, and a capture listener
 * on an ancestor runs before a listener on the target itself. The library's
 * handler opens with `if (event.defaultPrevented) return`, so preventing the
 * default here is the whole handshake — nothing is unbound and no component is
 * forked.
 *
 * A collapsed sidebar is left to the library: the arrows are a resize, and the
 * panel is not at a width the user placed it at. Enter, and the footer button,
 * are what expand it.
 */
function stepArrows(panelRef: React.RefObject<PanelImperativeHandle | null>) {
  return (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    const panel = panelRef.current
    if (!panel || panel.isCollapsed()) return
    event.preventDefault()
    // From the ROUNDED current width, so a step never inherits a fractional
    // origin and the two directions cannot land 0.4 px apart.
    const from = Math.round(panel.getSize().inPixels)
    panel.resize(`${from + (event.key === 'ArrowRight' ? ARROW_STEP : -ARROW_STEP)}px`)
  }
}

/**
 * A shell card: the sidebar and the list, which are the two things that float
 * on the ground. (The reading region is the ground, so it is not one.)
 *
 * No `ring-1` — every --wren-shadow-* carries `0 0 0 1px` as its first layer,
 * so `shadow-xs` IS the border (DIRECTION §6).
 *
 * The radius is `rounded-md` **12** — the owner's number, ruled twice on
 * 2026-08-31 (18 "looks bad visually", and flush was rejected too). This
 * comment used to say 18 and derive it from the rows: a card's 8 px inset
 * leaves 10 inside, which is --wren-radius-row. **That derivation no longer
 * holds** — 12 − 8 is 4, and the rows are still 10. The rows were left alone
 * on purpose, because changing --wren-radius-row to satisfy an equation would
 * move every list and sidebar row to fix one card.
 *
 * The consequence is live and is an open owner decision (NICK-QUEUE): message
 * cards in the reading pane are `rounded-lg` 14, so this card is now LESS
 * rounded than the small cards floating on it. Do not "fix" either number
 * from here.
 */
export const SHELL_CARD =
  'bg-surface rounded-md shadow-xs flex min-h-0 flex-1 flex-col overflow-hidden'

export function AppShell() {
  // ONE mechanism — issue #57. `selectSidebarRail` is the rail's only answer,
  // so the shortcut's intent and a window too narrow to seat a wide sidebar
  // produce the same layout instead of the wide layout inside a narrow rail.
  const rail = useUi(selectSidebarRail)
  // Nothing open ⇒ the ground IS the character's field, channels included,
  // and the sidebar and list read as cards floating on it. The reading pane
  // is transparent, so this is what shows through behind its bird.
  const atRest = useUi((s) => s.selected === null)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)
  const setCramped = useUi((s) => s.setSidebarCramped)
  const sidebarRef = useRef<PanelImperativeHandle | null>(null)
  const listRef = useRef<PanelImperativeHandle | null>(null)
  const groupRef = useRef<HTMLDivElement | null>(null)
  // The same fact the store holds, readable from `onResize` without waiting
  // for a render: the two fire against the same width and must agree within
  // the tick, or a narrow window writes the collapse back into the persisted
  // preference.
  const crampedRef = useRef(false)

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

  /**
   * The narrowest window that can seat a WIDE sidebar — issue #57.
   *
   * Every term is a minimum the panel group is already holding: the sidebar's
   * own floor plus its ground, a channel, the list's floor plus its ground,
   * a second channel, and the reading region's floor. Below this the group has
   * nowhere to put a wide sidebar and pins it to the collapsed width on its
   * own, which is the state the toggle used to draw the wide layout into.
   *
   * Derived rather than written down, so it stays true if a measure moves.
   */
  const wideSidebarFloor =
    measures.sidebarMin +
    SIDEBAR_PAD +
    HANDLE_W +
    measures.listMin +
    LIST_PAD +
    HANDLE_W +
    READING_MIN

  // Measured off the group itself rather than off `window`: the shell is the
  // whole window today, and this stays true if it is ever inset.
  useEffect(() => {
    const el = groupRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (width: number) => {
      // A zero width is a hidden or not-yet-laid-out shell, not a narrow one.
      const next = width > 0 && width < wideSidebarFloor
      crampedRef.current = next
      setCramped(next)
    }
    measure(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) measure(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [wideSidebarFloor, setCramped])

  // The footer button drives the panel; dragging the handle past the min
  // drives the store. Both end up at the same place — and so does a window
  // too narrow to hold a wide sidebar, which is the whole of issue #57: the
  // panel follows the RAIL, not the preference, so the two can never disagree
  // about which layout is on screen.
  useEffect(() => {
    const panel = sidebarRef.current
    if (!panel) return
    if (rail && !panel.isCollapsed()) panel.collapse()
    if (!rail && panel.isCollapsed()) panel.expand()
  }, [rail])

  return (
    // No titlebar row. `titleBarStyle: "Overlay"` with `hiddenTitle: true`
    // already hands the webview the whole window on macOS, so the panes start
    // at y=0 and the traffic lights land on the sidebar card's own top band —
    // Apple Mail's arrangement. Deleting the strip rather than filling it is
    // what buys the list 52 px of body (11.0 rows at --wren-row-h instead of
    // 10.2 at 1280×800); every control that could have filled it already lives
    // in the list header or the sidebar footer.
    // The field is back on the ground at rest — "i like how the nothing open
    // pane turned full pink and had the bird, we should bring that back"
    // (owner, 2026-08-31). What does NOT come back is the field on the list
    // card: "inbox should always be white" was the actual complaint, and the
    // earned mark now uses .wren-stage so the inbox-zero bird keeps its
    // bounded disc on white.
    <div ref={groupRef} className={cn('bg-canvas h-full', atRest && 'wren-empty')}>
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
            // In a cramped window the group collapses the sidebar because it
            // has no room, not because anyone asked — so that collapse must
            // not be written into the preference that survives a relaunch.
            // Widening the window then gives back the sidebar you had.
            if (!crampedRef.current) {
              setCollapsed(size.inPixels <= measures.sidebarCollapsed + SIDEBAR_PAD + SNAP_SLACK)
            }
            snapToWholePixels(sidebarRef.current, size.inPixels)
          }}
          // The card's LEFT edge must stay at x=8: place_traffic_lights in the
          // Rust puts the lights there, and tests/traffic-lights.test.ts holds
          // the pair together.
          className="flex min-h-0 flex-col py-(--wren-sidebar-gutter) pl-(--wren-sidebar-gutter) pr-(--wren-shell-seam)"
        >
          <Sidebar />
        </ResizablePanel>
        {/* Named, because it is a tab stop (issue 45). The panel library
            already gives the channel `role="separator"`, its orientation and
            a live `aria-valuenow`; what it cannot know is which two things
            this one sits between. Removing the stop was the other option and
            was rejected: the arrow keys genuinely resize the panes, so these
            are useful stops, and every other control in the app is named. */}
        <ResizableHandle
          aria-label="Resize the sidebar"
          onKeyDownCapture={stepArrows(sidebarRef)}
          className={CHANNEL_HANDLE}
        />
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
        <ResizableHandle
          aria-label="Resize the thread list"
          onKeyDownCapture={stepArrows(listRef)}
          className={CHANNEL_HANDLE}
        />
        {/* No padding, no card. The reading region IS the ground — it runs
            full-bleed to the window's top, right and bottom edges, and it is
            what the other two float on. Rounding it would delete the ~610 px
            field that makes the channels read as ground rather than as
            cracks, and it would put white paper on a white card on a white
            pane with a 4%-alpha ring as the only separator. */}
        <ResizablePanel minSize={READING_MIN}>
          <ReadingPane />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
