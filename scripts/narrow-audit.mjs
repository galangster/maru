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

/** The demo app, loaded and listed, at one viewport. Every page this script
 *  opens starts here — same URL, same wait, one place to change either. */
async function openDemoPage(browser, viewport, options = {}) {
  const page = await browser.newPage({ viewport, ...options })
  await page.goto(`${ORIGIN}/?demo=1&screenshot=1`)
  await page.waitForSelector('[data-thread-key]', { timeout: 15_000 })
  return page
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

/**
 * The row's centre must open the thread, at every width — issue 39.
 *
 * The hover cluster is absolutely positioned over the row's second line, so on
 * a short enough row it reaches the middle and a click aimed at the subject
 * fires Archive instead. This is the assertion rather than a frame, because
 * the failure is invisible in a screenshot: at 800 px nothing overflows and
 * nothing collides — only the meaning of a click has changed.
 *
 * Driven at the reported width (800) and at the window minimum (940). One
 * page for both: the row's threshold is `--container-row`, a container query,
 * so resizing the viewport is the whole of the change and a reload would only
 * cost a second app boot.
 *
 * Returns the failure rather than throwing it, so one bad width still lets the
 * other be measured and reported in the same run.
 */
const HIT_WIDTHS = [800, 940]

async function checkRowCentreOpens(page, width) {
  await page.setViewportSize({ width, height: 600 })
  // Hover is what mounts the cluster's pointer events; without it the strip
  // is `pointer-events-none` and the check would pass for the wrong reason.
  await page.locator('[data-thread-key]').nth(2).hover()
  await page.waitForTimeout(200)
  const hit = await page.evaluate(() => {
    const row = document.querySelectorAll('[data-thread-key]')[2]
    const box = row.getBoundingClientRect()
    const at = document.elementFromPoint(
      Math.round(box.left + box.width / 2),
      Math.round(box.top + box.height / 2),
    )
    return {
      rowWidth: Math.round(box.width),
      onRow: at instanceof Element && at.closest('[data-thread-key]') === row,
      onButton: at instanceof Element && at.closest('button') !== null,
    }
  })
  if (!hit.onRow || hit.onButton) {
    return (
      `row centre at ${width}px is a ${hit.onButton ? 'button' : 'non-row element'} ` +
      `(row ${hit.rowWidth}px) — issue 39`
    )
  }
  console.log(`  hit ${width}px: row centre is the row (row ${hit.rowWidth}px)`)
  return null
}

const server = await startServerIfNeeded()
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const failures = []

try {
  // Frames first, assertions second. The frames are the thing a person came
  // for, and a regression at 800 px used to throw before a single one was
  // written — leaving the run with nothing to look at in exactly the case
  // where looking is the point.
  for (const shot of SHOTS) {
    const page = await openDemoPage(browser, FLOOR, { deviceScaleFactor: 2 })
    try {
      if (shot.act) await shot.act(page)
      await page.waitForTimeout(250)
      await page.screenshot({ path: join(OUT, shot.file) })
      console.log(`  ${shot.file}`)
    } finally {
      await page.close()
    }
  }

  const hitPage = await openDemoPage(browser, { width: HIT_WIDTHS[0], height: 600 })
  try {
    for (const width of HIT_WIDTHS) {
      const failure = await checkRowCentreOpens(hitPage, width)
      if (failure) failures.push(failure)
    }
  } finally {
    await hitPage.close()
  }
} finally {
  await browser.close()
  await server?.kill()
}

console.log(`\nFrames in docs/captures/narrow/ — eyeball for: wrapped labels,`)
console.log(`missing truncation, overflow, grids that fail to collapse.`)

// After the browser and the server are down, so a failure still cleans up.
if (failures.length > 0) {
  throw new Error(`narrow audit failed:\n  ${failures.join('\n  ')}`)
}
