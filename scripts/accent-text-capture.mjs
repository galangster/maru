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
// reader can put `-before` next to `-after` and see only the one change.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { runShots } from './lib/capture.mjs'
import { startServerIfNeeded } from './dev-server.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'wayfinder/captures/ui-review-desktop/after')

const VIEWPORT = { width: 1280, height: 800 }

const tag = process.argv[2]
if (tag !== 'before' && tag !== 'after') {
  console.error('usage: node scripts/accent-text-capture.mjs before|after')
  process.exit(2)
}

/** The one inbox thread that pulls a remote image, so the notice is drawn. */
const blockedImages = async (page) => {
  await page
    .locator('[data-thread-key]')
    .filter({ hasText: 'Offhours' })
    .first()
    .click()
  await page.waitForSelector('section[aria-label="Reading"] [data-message-card]', {
    timeout: 10_000,
  })
  await page.locator(':text-is("Show")').first().waitFor({ timeout: 10_000 })
}

/** Settings → Google API, where the disclosure is the accent's own word. */
const setupGuide = async (page) => {
  await page.locator('button[aria-label="Settings"]').click()
  await page.waitForSelector('nav[aria-label="Settings sections"]', { timeout: 10_000 })
  await page.locator('nav[aria-label="Settings sections"] button', { hasText: 'Google API' }).click()
  await page.locator('button', { hasText: 'Setup guide' }).first().waitFor({ timeout: 10_000 })
}

/** The composer's link popover, whose confirm is a coloured word. */
const addLink = async (page) => {
  await page.keyboard.press('c')
  await page.waitForSelector('section[aria-label="New message"]', { timeout: 10_000 })
  await page.waitForSelector('.wren-editor [contenteditable]', { timeout: 10_000 })
  await page.locator('button[aria-label="Link"]').click()
  await page.locator('input[aria-label="Link to"]').waitFor({ timeout: 10_000 })
}

const SHOTS = [
  { file: `accent-text-blocked-images-light-1280-${tag}.png`, query: '&images=block', act: blockedImages },
  { file: `accent-text-setup-guide-light-1280-${tag}.png`, act: setupGuide },
  { file: `accent-text-add-link-light-1280-${tag}.png`, act: addLink },
]

const browser = await chromium.launch()
const child = await startServerIfNeeded(ROOT)

try {
  await runShots(browser, SHOTS, { out: OUT, viewport: VIEWPORT })
} finally {
  await browser.close()
  if (child) child.kill('SIGTERM')
}
