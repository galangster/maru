// The "after" captures for the 2026-09-02 desktop interface review.
//
//   node scripts/ui-review-after.mjs
//
// One frame per surface the review filed an issue against, at the width it was
// reviewed at, under the name it was reviewed under — so a reader can put
// `captures/ui-review-desktop/<name>.png` beside
// `captures/ui-review-desktop/after/<name>.png` and see the one change.
//
// 1280 px, palette-encoded PNG with no dithering, exactly as the review's own
// set. `?screenshot=1` freezes the clock and removes every transition, so two
// runs a week apart produce comparable frames.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import sharp from 'sharp'

import { ORIGIN, startServerIfNeeded } from './dev-server.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'wayfinder/captures/ui-review-desktop/after')

const VIEWPORT = { width: 1280, height: 800 }

/** A thread with several messages and a rich body — the reply tiles' home. */
const openThird = async (page) => {
  await page.locator('[data-thread-key]').nth(2).click()
  await page.waitForSelector('section[aria-label="Reading"] [data-message-card]', {
    timeout: 10_000,
  })
}

const search = (query) => async (page) => {
  await page.keyboard.press('/')
  await page.waitForSelector('input[type="search"], input[aria-label="Search mail"]', {
    timeout: 10_000,
  })
  await page.keyboard.type(query)
  // The debounce, then the query.
  await page.waitForTimeout(1200)
}

const SHOTS = [
  // #22 — the ring is the same on every control; the sidebar is where the
  // review sampled it. Three tabs lands on "Starred".
  {
    file: 'focus-ring-light-1280.png',
    act: async (page) => {
      // Empty sidebar card, below the accounts group: a click that focuses
      // nothing, so the Tab count below starts where the review's did.
      await page.mouse.click(130, 620)
      for (let i = 0; i < 3; i++) await page.keyboard.press('Tab')
      await page.waitForTimeout(200)
    },
  },
  { file: 'focus-ring-dark-1280.png', theme: 'dark', sameAs: 'focus-ring-light-1280.png' },

  // #23 — the fixed sender column.
  { file: 'search-light-1280.png', act: search('is:unread') },

  // #24 — the bulk bar's 24 px targets and Trash's clear space.
  {
    file: 'bulk-light-1280.png',
    act: async (page) => {
      await page.locator('[data-thread-key]').first().click()
      await page.keyboard.press('x')
      await page.keyboard.press('j')
      await page.keyboard.press('x')
      await page.waitForTimeout(200)
    },
  },

  // #25 — the sheet's own descriptions, in full.
  {
    file: 'shortcuts-light-1280.png',
    act: async (page) => {
      await page.keyboard.press('?')
      await page.waitForSelector('[role="dialog"]', { timeout: 10_000 })
      await page.waitForTimeout(200)
    },
  },

  // #26, #27 — the selected row's wash in dark; the reply tiles' keycaps.
  { file: 'thread-light-1280.png', act: openThird },
  { file: 'thread-dark-1280.png', theme: 'dark', act: openThird },

  // #27, #31 — the composer's field wells and its disabled Send.
  {
    file: 'compose-light-1280.png',
    act: async (page) => {
      await page.keyboard.press('c')
      await page.waitForSelector('section[aria-label="New message"]', { timeout: 10_000 })
      await page.waitForTimeout(400)
    },
  },
  { file: 'compose-dark-1280.png', theme: 'dark', sameAs: 'compose-light-1280.png' },

  // #27 — the palette's footer keycaps and its row hints.
  {
    file: 'palette-light-1280.png',
    act: async (page) => {
      await page.keyboard.press('Control+k')
      await page.waitForSelector('[cmdk-input]', { timeout: 10_000 })
      await page.waitForTimeout(300)
    },
  },
  { file: 'palette-dark-1280.png', theme: 'dark', sameAs: 'palette-light-1280.png' },

  // #28 — "Maru account", whole.
  {
    file: 'settings-light-1280.png',
    act: async (page) => {
      await page.locator('button[aria-label="Settings"]').click()
      await page.waitForSelector('nav[aria-label="Settings sections"]', { timeout: 10_000 })
      await page.waitForTimeout(300)
    },
  },

  // #29, #30, #34, #35 — the count, the empty pane's subtitle, the read row's
  // sender, the Compose icon. All four are in one frame.
  { file: 'inbox-light-1280.png' },
  { file: 'inbox-dark-1280.png', theme: 'dark' },

  // #32 — the hover cluster's lane.
  {
    file: 'hover-light-1280.png',
    keepPointer: true,
    act: async (page) => {
      await page.locator('[data-thread-key]').filter({ hasText: 'Ridgeline Cycles' }).first().hover()
      await page.waitForTimeout(300)
    },
  },

  // #33 — the two panes, agreeing.
  { file: 'emptysearch-light-1280.png', act: search('zzzznomatch') },

  // #36 — the Undo pill.
  {
    file: 'toast-archive-light-1280.png',
    act: async (page) => {
      await page.locator('[data-thread-key]').first().click()
      await page.waitForTimeout(400)
      await page.keyboard.press('e')
      await page.waitForSelector('[data-sonner-toast]', { timeout: 10_000 })
      await page.waitForTimeout(400)
    },
  },

  // #37 — the picker's reserved keycap column.
  {
    file: 'later-light-1280.png',
    act: async (page) => {
      await page.locator('[data-thread-key]').first().click()
      await page.waitForTimeout(400)
      await page.keyboard.press('h')
      await page.waitForSelector('[role="dialog"]', { timeout: 10_000 })
      await page.waitForTimeout(300)
    },
  },

  // #38 — the return date on a Later row.
  //
  // The only frame on the LIVE clock. The frozen capture clock sits in the
  // past, so every preset the picker offers is already due and the wake sweep
  // returns the thread to the inbox before the Later list can render it.
  {
    file: 'later-view-light-1280.png',
    live: true,
    act: async (page) => {
      await page.locator('[data-thread-key]').first().click()
      await page.waitForTimeout(400)
      await page.keyboard.press('h')
      await page.waitForSelector('[role="dialog"]', { timeout: 10_000 })
      // The last preset is always the furthest out, so it survives the sweep.
      const presets = await page.locator('[role="dialog"] li button').count()
      await page.keyboard.press(String(presets - 1))
      await page.waitForTimeout(900)
      await page.keyboard.press('Meta+5')
      await page.waitForTimeout(900)
    },
  },
]

const browser = await chromium.launch()
const child = await startServerIfNeeded(ROOT)
await mkdir(OUT, { recursive: true })

try {
  for (const shot of SHOTS) {
    const act = shot.act ?? SHOTS.find((s) => s.file === shot.sameAs)?.act
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    const flags = shot.live ? '' : '&screenshot=1'
    const theme = shot.theme ?? 'light'
    await page.goto(`${ORIGIN}/?demo=1${flags}&theme=${theme}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-thread-key]', { timeout: 20_000 })
    await page.waitForTimeout(400)
    if (act) await act(page)
    // Park the pointer off every row unless the frame IS a hover state: a
    // click leaves the cursor where it landed, and the row's hover cluster
    // would then cover the very text some of these frames exist to show.
    if (!shot.keepPointer) {
      await page.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1)
      await page.waitForTimeout(200)
    }
    const buffer = await page.screenshot({ type: 'png' })
    // Palette-encoded, no dithering — the review's own encoding, and what keeps
    // a flat interface capture under a tenth of a truecolour one.
    const encoded = await sharp(buffer).png({ palette: true, dither: 0 }).toBuffer()
    await writeFile(join(OUT, shot.file), encoded)
    console.log(`${shot.file}  ${(encoded.length / 1024).toFixed(0)} KB`)
    await page.close()
  }
} finally {
  await browser.close()
  if (child) child.kill('SIGTERM')
}
