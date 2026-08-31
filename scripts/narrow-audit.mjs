// The narrow-width audit — the pane-width matrix, captured.
//
//   node scripts/narrow-audit.mjs
//
// Maru's "breakpoints" are not viewports: the three panes are user-draggable,
// so every surface must survive its container's minimum, not the window's.
// This drives the demo app through the real extremes —
//
//   floor    the 940px window minimum (tauri.conf.json), default pane split
//   squeeze  940px window with the list/reading separator dragged so the
//            READING pane sits at its 360px minimum
//   wide     940px window with the separator dragged the other way, list at
//            its minimum and the reading pane at its widest
//
// — and captures the layout-sensitive surfaces at each. Frames land in
// docs/captures/narrow/ for eyeballing; like screenshot.mjs they are
// deterministic (?screenshot=1 freezes the clock and removes motion), so a
// diff against the previous run shows exactly what a change did to the
// narrow end. Run it whenever a surface's layout changes; what to look for:
// wrapped button labels, missing truncation, toolbars that overflow, grids
// that fail to collapse, text touching container edges.

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { ORIGIN, startServerIfNeeded } from './dev-server.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/captures/narrow')

const FLOOR = { width: 940, height: 640 }
const RICH_THREAD = 'demo-personal/p-marginal'
const PHOTO_THREAD = 'demo-personal/p-mum'

/** Move the list/reading separator by |dx| px (positive = reading narrows).
 *  Keyboard, not mouse: the separator is a 1px target and react-resizable-
 *  panels answers arrow keys deterministically once focused. */
async function dragReadingSeparator(page, dx) {
  const handle = page.locator('[data-slot="resizable-handle"]').last()
  await handle.focus()
  const key = dx > 0 ? 'ArrowRight' : 'ArrowLeft'
  // Each press moves ~1% of the group; press well past the min so the pane
  // pins at its floor whatever the exact step size.
  for (let i = 0; i < 60; i++) await page.keyboard.press(key)
}

const openThread = (key) => async (page) => {
  await page.locator(`[data-thread-key="${key}"]`).click()
  await page.waitForSelector('section[aria-label="Reading"] iframe', { timeout: 10_000 })
}

const SHOTS = [
  { file: 'floor-01-inbox.png', act: null },
  { file: 'floor-02-thread.png', act: openThread(RICH_THREAD) },
  {
    file: 'squeeze-03-thread.png',
    act: async (page) => {
      await openThread(RICH_THREAD)(page)
      await dragReadingSeparator(page, 400)
    },
  },
  {
    file: 'squeeze-04-photos.png',
    act: async (page) => {
      await openThread(PHOTO_THREAD)(page)
      await dragReadingSeparator(page, 400)
    },
  },
  {
    file: 'wide-05-thread-narrow-list.png',
    act: async (page) => {
      await openThread(RICH_THREAD)(page)
      await dragReadingSeparator(page, -400)
    },
  },
  {
    file: 'squeeze-06-composer.png',
    act: async (page) => {
      await openThread(RICH_THREAD)(page)
      await dragReadingSeparator(page, 400)
      await page.keyboard.press('r')
      await page.waitForSelector('section[aria-label="Reply"]', { timeout: 10_000 })
    },
  },
]

const server = await startServerIfNeeded()
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()

try {
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: FLOOR, deviceScaleFactor: 2 })
    await page.goto(`${ORIGIN}/?demo=1&screenshot=1`)
    await page.waitForSelector('[data-thread-key]', { timeout: 15_000 })
    if (shot.act) await shot.act(page)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(OUT, shot.file) })
    await page.close()
    console.log(`  ${shot.file}`)
  }
} finally {
  await browser.close()
  await server?.kill()
}
console.log(`\nFrames in docs/captures/narrow/ — eyeball for: wrapped labels,`)
console.log(`missing truncation, overflow, grids that fail to collapse.`)
