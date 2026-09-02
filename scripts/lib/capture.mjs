// The capture harness every screenshot script opens with.
//
// Two things, and both of them are correctness rather than convenience:
//
//   1. The context is PINNED. Relative dates, the 24-hour clock and every
//      transition must not depend on the machine the frames were taken on, or
//      two runs a week apart are not comparable and the whole point of a
//      deterministic capture is gone.
//   2. The page is waited ON, not slept past. `[data-ready="true"]` is set by
//      the thread list the moment its query settles, so it is the app saying it
//      has finished, rather than a number somebody guessed and that fails on a
//      slow machine by rendering a skeleton into the frame.
//
// Shot-specific waits stay with their shot. This is only the part that is the
// same in every script, because it is the same question in every script.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import sharp from 'sharp'

import { ORIGIN, startServerIfNeeded } from '../dev-server.mjs'

/** The repository root, from this file rather than from each wave script. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** en-US, Pacific, no motion. The clock is frozen separately by `?screenshot=1`. */
export const DETERMINISTIC_CONTEXT = {
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  reducedMotion: 'reduce',
}

/** One pinned context. One, because a context per shot re-pays the browser
 *  profile and lets two frames disagree about locale or motion. */
export function newCaptureContext(browser, { viewport, deviceScaleFactor = 1 }) {
  return browser.newContext({ viewport, deviceScaleFactor, ...DETERMINISTIC_CONTEXT })
}

/** Navigate, and wait for the app to say it has rendered its list. */
export async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('[data-ready="true"]', { timeout: 20_000 })
}

/** Nothing should sit under the cursor in a capture, and nothing should still
 *  be loading. The last two lines before every `page.screenshot`. */
export async function parkPointer(page, viewport) {
  await page.mouse.move(viewport.width - 4, viewport.height - 4)
  await page.waitForLoadState('networkidle')
}

/**
 * Take one frame per shot, into `out`.
 *
 * A shot is `{ file, act?, theme?, live?, keepPointer?, width?, query? }`. Everything
 * a wave script owns is in its own SHOTS array — which surfaces, under which
 * names, at which widths. Everything that would make two waves' frames
 * incomparable is here, once.
 *
 *   - `live` drops `?screenshot=1`, which is what freezes the clock and
 *     removes every transition. A frame needs the live clock only when the
 *     surface under test is about the future: under the frozen clock every
 *     Later preset is already due.
 *   - `keepPointer` says do not MOVE the pointer, because the frame IS a
 *     hover state. It does not say do not wait: the settle is awaited either
 *     way, or the shutter can catch a row mid-load.
 *   - `width` overrides the run's viewport width for the one shot that was
 *     bracketed at another size.
 *   - `query` appends demo flags the surface itself needs — `&images=block`
 *     is the only door onto the blocked-images notice, because the demo
 *     service ships `imagePolicy: 'allow'` and the notice is then never
 *     drawn. It is a shot's own setup, not the wave's, so it rides here
 *     rather than in a second copy of this loop.
 *
 * One context per WIDTH, reused across every shot at that width — a context
 * per shot would re-pay the browser profile and let two frames disagree about
 * locale or motion, and one context for everything cannot change viewport.
 */
export async function runShots(browser, shots, { out, viewport, fileWidth }) {
  await mkdir(out, { recursive: true })
  const lanes = new Map()

  const laneFor = async (width) => {
    let lane = lanes.get(width)
    if (!lane) {
      const size = { ...viewport, width }
      const context = await newCaptureContext(browser, { viewport: size })
      lane = { context, page: await context.newPage(), viewport: size }
      lanes.set(width, lane)
    }
    return lane
  }

  try {
    for (const shot of shots) {
      const { page, viewport: size } = await laneFor(shot.width ?? viewport.width)
      const flags = shot.live ? '' : '&screenshot=1'
      await gotoReady(
        page,
        `${ORIGIN}/?demo=1${flags}&theme=${shot.theme ?? 'light'}${shot.query ?? ''}`,
      )
      if (shot.act) await shot.act(page)
      await page.waitForLoadState('networkidle')
      // Off every row unless the frame is a hover state: a click leaves the
      // cursor where it landed, and the row's hover cluster would then cover
      // the very text some of these frames exist to show.
      if (!shot.keepPointer) await parkPointer(page, size)
      const buffer = await page.screenshot({ type: 'png' })
      // Palette-encoded, no dithering — what keeps a flat interface capture
      // under a tenth of a truecolour one. `fileWidth` is the wave's written
      // width, where it differs from the width it was driven at.
      const shrunk = fileWidth ? sharp(buffer).resize({ width: fileWidth }) : sharp(buffer)
      const encoded = await shrunk.png({ palette: true, dither: 0 }).toBuffer()
      await writeFile(join(out, shot.file), encoded)
      console.log(`${shot.file}  ${(encoded.length / 1024).toFixed(0)} KB`)
    }
  } finally {
    for (const { context } of lanes.values()) await context.close()
  }
}

/**
 * A whole wave: browser up, dev server up if it is not already, frames, down.
 *
 * `runShots` is the part a caller might want to drive itself; this is the part
 * no caller ever wants to write differently. Every wave script had its own copy
 * of the same six lines, and the copies are exactly where a `finally` goes
 * missing and a headless Chromium survives the run.
 *
 * A wave script is then its SHOTS array and one call, which is all it ever had
 * to say.
 */
export async function runWave(shots, { out, viewport, fileWidth }) {
  const browser = await chromium.launch()
  const child = await startServerIfNeeded(ROOT)
  try {
    await runShots(browser, shots, { out, viewport, fileWidth })
  } finally {
    await browser.close()
    if (child) child.kill('SIGTERM')
  }
}
