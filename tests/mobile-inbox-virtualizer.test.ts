import { describe, expect, it } from 'vitest'
import { Virtualizer, type VirtualizerOptions } from '@tanstack/virtual-core'

/**
 * Why the mobile inbox never sets `enabled: false` on its window virtualizer.
 *
 * The inbox is the one screen the stage keeps mounted, and the only thing that
 * exception buys is the measured height of every row already seen. `enabled`
 * looks like the switch that parks the screen, and it is the one option that
 * throws those heights away: `getMeasurements()` in `@tanstack/virtual-core`
 * short-circuits when the option is false and empties both the measurements
 * cache and the item size cache on its way out. See docs/IOS.md, "The inbox
 * stays mounted".
 */
const ROW_COUNT = 40
const ESTIMATED_ROW = 88
const MEASURED_ROW = 132

function inboxOptions(): VirtualizerOptions<Window, Element> {
  return {
    count: ROW_COUNT,
    getScrollElement: () => null,
    estimateSize: () => ESTIMATED_ROW,
    getItemKey: (index) => `account/thread-${index}`,
    overscan: 8,
    scrollMargin: 0,
    initialOffset: 0,
    initialRect: { width: 390, height: 844 },
    observeElementRect: () => undefined,
    observeElementOffset: () => undefined,
    scrollToFn: () => undefined,
  }
}

/** What a screen full of rows reporting their real height leaves behind. */
function measureEveryRow(virtualizer: Virtualizer<Window, Element>): void {
  virtualizer.getVirtualItems()
  for (let index = 0; index < ROW_COUNT; index += 1) {
    virtualizer.resizeItem(index, MEASURED_ROW)
  }
}

describe('mobile inbox virtualizer', () => {
  it('keeps its measured row heights across a pause', () => {
    const virtualizer = new Virtualizer(inboxOptions())
    measureEveryRow(virtualizer)
    const measured = virtualizer.getTotalSize()
    expect(measured).toBe(ROW_COUNT * MEASURED_ROW)

    // The pause is three refusals, not an option: the rows are not rebuilt,
    // no row is rendered, and neither `getVirtualItems()` nor `getTotalSize()`
    // is called. Only the re-renders reach the virtualizer.
    virtualizer.setOptions(inboxOptions())
    virtualizer.setOptions(inboxOptions())

    expect(virtualizer.getTotalSize()).toBe(measured)
    expect(virtualizer.getVirtualItems()[0]?.size).toBe(MEASURED_ROW)
  })

  it('would lose them to `enabled: false`, which is why the option is unused', () => {
    const virtualizer = new Virtualizer(inboxOptions())
    measureEveryRow(virtualizer)
    expect(virtualizer.getTotalSize()).toBe(ROW_COUNT * MEASURED_ROW)

    virtualizer.setOptions({ ...inboxOptions(), enabled: false })
    virtualizer.getVirtualItems()
    virtualizer.setOptions(inboxOptions())

    expect(virtualizer.getTotalSize()).toBe(ROW_COUNT * ESTIMATED_ROW)
  })
})
