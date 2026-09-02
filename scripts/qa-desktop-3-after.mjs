// The "after" frames for the desktop QA wave 3 fixes — issues 23, 32, 54, 55, 56.
//
//   node scripts/qa-desktop-3-after.mjs
//
// One frame per finding, under the name wave 3 filed it under, so
// `captures/qa-desktop-3/<name>.png` and
// `captures/qa-desktop-3/after/<name>.png` sit side by side and show the one
// change. Wave 3's own encoding: driven at 1600×1000 (2560 where the finding
// was bracketed there), written 880 px wide, palette-encoded, no dithering.
//
// The Later frames run on the LIVE clock — under the frozen capture clock every
// preset the picker offers is already due. The runner and the shared acts are
// `scripts/lib/capture.mjs` and `scripts/lib/page-acts.mjs`.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { runShots } from './lib/capture.mjs'
import { openLater, search } from './lib/page-acts.mjs'

import { startServerIfNeeded } from './dev-server.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'wayfinder/captures/qa-desktop-3/after')

const VIEWPORT = { width: 1600, height: 1000 }
/** Wave 3's file width. The viewport is 1600 or 2560; the file is always 880. */
const FILE_W = 880

/** Rest the pointer on the first row, which is the frame's whole subject. */
const hoverFirstRow = async (page) => {
  const box = await page.locator('[data-thread-key]').first().boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(300)
}

const SHOTS = [
  // #23 — the subject takes everything after the sender column.
  { file: 'a23-search-results-light.png', act: search('is:unread') },
  { file: 'a23-search-2560.png', width: 2560, act: search('is:unread') },

  // #32 — the cluster in the first line's empty lane; line two untouched.
  { file: 'a32-row-hover-light.png', act: hoverFirstRow, keepPointer: true },
  { file: 'a32-hover-2560.png', width: 2560, act: hoverFirstRow, keepPointer: true },

  // #54 — the typed date reaches the field and the menu stays open.
  {
    file: 'n-later-date-digit-fires-preset.png',
    live: true,
    keepPointer: true,
    act: async (page) => {
      await openLater(page)
      await page.getByRole('button', { name: /Pick a date/ }).click()
      await page.waitForSelector('input[type="date"]', { timeout: 10_000 })
      // Every digit a preset used to answer for, typed into the field.
      await page.keyboard.type('12/24')
      await page.waitForTimeout(300)
    },
  },

  // #55 — the highlighted row's time, in dark.
  { file: 'n-later-picker-dark.png', theme: 'dark', live: true, act: openLater },
  { file: 'n-later-picker-light.png', live: true, act: openLater },

  // #56 — the sidebar divider after one right arrow and one left.
  {
    file: 'n-divider-arrow-steps.png',
    act: async (page) => {
      await page.evaluate(() => {
        document
          .querySelector('[data-slot="resizable-handle"][aria-label="Resize the sidebar"]')
          .focus()
      })
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(150)
      await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(150)
    },
  },
]

const browser = await chromium.launch()
const child = await startServerIfNeeded(ROOT)

try {
  await runShots(browser, SHOTS, { out: OUT, viewport: VIEWPORT, fileWidth: FILE_W })
} finally {
  await browser.close()
  if (child) child.kill('SIGTERM')
}
