// Before/after frames for the accent-as-text ruling (owner, 2026-09-02).
//
//   node scripts/accent-text-capture.mjs before
//   node scripts/accent-text-capture.mjs after
//
// Three surfaces, and they are the only three places the desktop draws the
// accent as a WORD rather than as a fill, an icon, a ring or a border: the
// blocked-images notice's "Show", the Google API section's "Setup guide", and
// the composer's "Add link". The plain light accent measured 4.31 on the
// canvas; these frames are the visible half of the fix, beside the ratios the
// audit prints.
//
// 1280 px light, same harness and same encoding as every other wave, so a
// reader can put `-before` next to `-after` and see only the one change. The
// runner and the shared acts are `scripts/lib/capture.mjs` and
// `scripts/lib/page-acts.mjs`.

import { join } from 'node:path'

import { ROOT, runWave } from './lib/capture.mjs'
import { openComposer, openRowMatching, openSettings } from './lib/page-acts.mjs'

const OUT = join(ROOT, 'wayfinder/captures/ui-review-desktop/after')

const VIEWPORT = { width: 1280, height: 800 }

const tag = process.argv[2]
if (tag !== 'before' && tag !== 'after') {
  console.error('usage: node scripts/accent-text-capture.mjs before|after')
  process.exit(2)
}

/** The one inbox thread that pulls a remote image, so the notice is drawn. */
const blockedImages = async (page) => {
  await openRowMatching('Offhours')(page)
  await page.locator(':text-is("Show")').first().waitFor({ timeout: 10_000 })
}

/** Settings → Google API, where the disclosure is the accent's own word. */
const setupGuide = async (page) => {
  await openSettings('Google API')(page)
  await page.locator('button', { hasText: 'Setup guide' }).first().waitFor({ timeout: 10_000 })
}

/** The composer's link popover, whose confirm is a coloured word. */
const addLink = async (page) => {
  await openComposer(page)
  await page.locator('button[aria-label="Link"]').click()
  await page.locator('input[aria-label="Link to"]').waitFor({ timeout: 10_000 })
}

const SHOTS = [
  { file: `accent-text-blocked-images-light-1280-${tag}.png`, query: '&images=block', act: blockedImages },
  { file: `accent-text-setup-guide-light-1280-${tag}.png`, act: setupGuide },
  { file: `accent-text-add-link-light-1280-${tag}.png`, act: addLink },
]

await runWave(SHOTS, { out: OUT, viewport: VIEWPORT })
