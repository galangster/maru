// The proof frames for the wave-3 fixes: issues 53, 62 and 65.
//
// Driven as TOUCH, never as a mouse. Every gesture in issue 53 is invisible to
// a mouse — a mouse never hands a drag to WebKit's scroll view, so the bug the
// report describes cannot be reproduced or disproved with one. The paths go in
// through CDP `Input.dispatchTouchEvent`, the same way waves 1 to 3 drove
// theirs, at 393×852 with `hasTouch` and an iPhone user agent.
//
// The frames are the evidence a person reads. The numbers this prints beside
// them are the evidence a machine reads: the sheet's own transform mid-drag,
// after a partial drag, and after a commit.

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { chromium } from 'playwright'
import sharp from 'sharp'

import { ROOT, DETERMINISTIC_CONTEXT } from './lib/capture.mjs'
import { ORIGIN, startServerIfNeeded } from './dev-server.mjs'

const OUT = join(ROOT, 'wayfinder/captures/qa-mobile-fixes-3')
const VIEWPORT = { width: 393, height: 852 }
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const findings = []
const note = (line) => {
  findings.push(line)
  console.log(line)
}

async function shoot(page, file, { fast = false } = {}) {
  // A frame of a toast cannot wait for the network: the offer is on a timer,
  // and `networkidle` outlives it.
  if (!fast) await page.waitForLoadState('networkidle')
  const buffer = await page.screenshot({ type: 'png' })
  // Written at the viewport's own 393 px, not the 1179 px the ×3 screen
  // renders at — the same width waves 1 to 3 wrote, so the frames compare.
  const encoded = await sharp(buffer)
    .resize({ width: VIEWPORT.width })
    .png({ palette: true, dither: 0 })
    .toBuffer()
  await writeFile(join(OUT, file), encoded)
  console.log(`  → ${file}  ${(encoded.length / 1024).toFixed(0)} KB`)
}

/** One finger, from `from` to `to`, released at the end unless told otherwise. */
async function drag(cdp, from, to, { steps = 14, release = true, settle = 16 } = {}) {
  const point = (x, y) => [{ x, y, radiusX: 6, radiusY: 6, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) })
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t),
    })
    await new Promise((r) => setTimeout(r, settle))
  }
  if (release) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await new Promise((r) => setTimeout(r, 420))
  }
}

/** Tap the undo offer's button where it actually is on screen. */
async function tapUndo(page, cdp) {
  const rect = await page.evaluate(() => {
    const button = document.querySelector('[data-sonner-toast] button[data-button]')
    if (!button) return null
    const { x, y, width, height } = button.getBoundingClientRect()
    return { x: x + width / 2, y: y + height / 2 }
  })
  if (!rect) {
    const seen = await page.evaluate(() => ({
      toasts: document.querySelectorAll('[data-sonner-toast]').length,
      toaster: document.querySelectorAll('[data-sonner-toaster]').length,
      html: document.querySelector('[data-sonner-toaster]')?.innerHTML.slice(0, 2000) ?? '',
    }))
    throw new Error(`no undo offer on screen ${JSON.stringify(seen)}`)
  }
  const point = [{ x: rect.x, y: rect.y, radiusX: 6, radiusY: 6, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)
}

const SHEET = '.mobile-bottom-sheet'
const transformOf = (page) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector)
    return el ? getComputedStyle(el).transform : 'gone'
  }, SHEET)

const sheetOpen = (page) => page.locator(SHEET).count().then((n) => n > 0)

async function openMailboxes(page) {
  await page.locator('button[aria-haspopup="dialog"].mobile-mailbox-title').click()
  await page.locator(`${SHEET}[aria-label="Mailboxes"]`).waitFor({ timeout: 10_000 })
}

/** The phone's own "the list has rendered" signal: a row. */
const ready = (page) => page.locator('.mobile-thread-row').first().waitFor({ timeout: 20_000 })

/** A left swipe on the first row: the shortest sheet the phone draws. */
async function openLaterSheet(page, cdp) {
  const row = await page.locator('.mobile-thread-row').first().boundingBox()
  const y = Math.round(row.y + row.height / 2)
  await drag(cdp, { x: 330, y }, { x: 90, y }, { steps: 10, settle: 10 })
  await page.locator('section[aria-label="Save for later"]').waitFor({ timeout: 10_000 })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const server = await startServerIfNeeded(ROOT)
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
    ...DETERMINISTIC_CONTEXT,
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)

  try {
    // ─── issue 53, the tall sheet ────────────────────────────────────────────
    await page.goto(`${ORIGIN}/?mobile=1&demo=1&screenshot=1&theme=light`, { waitUntil: 'load' })
    await ready(page)

    await openMailboxes(page)
    const tall = await page.locator(SHEET).boundingBox()
    note(`53 · Mailboxes sheet is ${Math.round(tall.height)} px of the ${VIEWPORT.height} px screen`)

    // A drag that stops short of the threshold must spring back.
    await drag(cdp, { x: 6, y: 470 }, { x: 60, y: 470 })
    note(`53 · 54 px edge drag → sheet transform ${await transformOf(page)}, open ${await sheetOpen(page)}`)
    await shoot(page, '53-mailboxes-partial-springback.png')

    // A vertical drag on the sheet's own list scrolls it and dismisses nothing.
    const before = await page.locator(SHEET).evaluate((el) => el.scrollTop)
    await drag(cdp, { x: 200, y: 640 }, { x: 200, y: 380 })
    const after = await page.locator(SHEET).evaluate((el) => el.scrollTop)
    note(`53 · vertical drag → scrollTop ${before} → ${after}, sheet open ${await sheetOpen(page)}`)
    await shoot(page, '53-mailboxes-vertical-scrolls.png')

    // Mid-gesture, held: the sheet follows the finger sideways.
    await drag(cdp, { x: 6, y: 470 }, { x: 62, y: 470 }, { release: false })
    note(`53 · held mid-drag → sheet transform ${await transformOf(page)}`)
    await shoot(page, '53-mailboxes-edgeback-mid.png')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(420)
    note(`53 · released at 56 px, under the 72 px threshold → open ${await sheetOpen(page)}`)

    // Past the threshold: the sheet goes. Same sheet, same start, one gesture
    // that goes far enough.
    await drag(cdp, { x: 6, y: 470 }, { x: 150, y: 470 })
    await drag(cdp, { x: 6, y: 470 }, { x: 150, y: 470 })
    note(`53 · 144 px edge drag from the sheet body → sheet open ${await sheetOpen(page)}`)
    await shoot(page, '53-mailboxes-edgeback-closed.png')

    // ─── issue 53, a short sheet ─────────────────────────────────────────────
    await openLaterSheet(page, cdp)
    const short = await page.locator(SHEET).boundingBox()
    note(`53 · Save for later sheet is ${Math.round(short.height)} px tall, top at ${Math.round(short.y)}`)
    // Started ON the sheet, not on the scrim above it — the gesture wave 3
    // found had never actually run on the three short sheets.
    const onSheet = Math.round(short.y + short.height / 2)
    await drag(cdp, { x: 6, y: onSheet }, { x: 60, y: onSheet })
    note(`53 · short sheet, 54 px drag from its body → open ${await sheetOpen(page)}`)
    await shoot(page, '53-later-partial-springback.png')
    await drag(cdp, { x: 6, y: onSheet }, { x: 150, y: onSheet })
    note(`53 · short sheet, 144 px drag from its body → open ${await sheetOpen(page)}`)
    await shoot(page, '53-later-edgeback-closed.png')

    // ─── issue 62 ────────────────────────────────────────────────────────────
    const subject = 'Quarterly planning and the notes that came out of it. '.repeat(96).trim()
    note(`62 · composing a ${subject.length}-character subject`)
    await page.locator('button[aria-label="Compose"]').click()
    await page.locator('section[aria-label="Compose message"]').waitFor({ timeout: 10_000 })
    await page.locator('input[aria-label="To recipients"]').fill('nick@example.com')
    await page.keyboard.press('Enter')
    await page.locator('.mobile-compose-field input[type="text"]').fill(subject)
    await page.locator('.mobile-compose-body textarea').fill('The body is beside the point.')
    await page.locator('button.mobile-send-button').click()
    await page.locator('section[aria-label="Compose message"]').waitFor({ state: 'detached', timeout: 15_000 })

    await openMailboxes(page)
    await page.locator('button', { hasText: /^Sent$/ }).first().click()
    await page.waitForTimeout(600)
    await page.locator('.mobile-thread-row').first().click()
    await page.locator('.mobile-thread-heading h1').waitFor({ timeout: 10_000 })
    const clamped = await page.locator('.mobile-thread-heading h1').boundingBox()
    const name = await page
      .locator('section.mobile-thread-screen')
      .getAttribute('aria-label')
    note(`62 · clamped title is ${Math.round(clamped.height)} px tall`)
    note(`62 · the screen's accessible name is ${name.length} characters: ${JSON.stringify(name.slice(0, 60))}…`)
    await shoot(page, '62-thread-title-clamped.png')

    await page.locator('.mobile-thread-title-more').click()
    await page.waitForTimeout(200)
    const open = await page.locator('.mobile-thread-heading h1').boundingBox()
    note(`62 · expanded title is ${Math.round(open.height)} px tall`)
    await shoot(page, '62-thread-title-expanded.png')

    // ─── issue 65 ────────────────────────────────────────────────────────────
    await page.goto(`${ORIGIN}/?mobile=1&demo=1&theme=light`, { waitUntil: 'load' })
    await ready(page)
    // The list is virtualized, so its row COUNT is the window and not the
    // mailbox. What the top of the list is, is the honest reading.
    const topRow = () => page.locator('.mobile-thread-row').first().getAttribute('aria-label')
    const atRest = await topRow()
    for (let i = 0; i < 6; i += 1) {
      const row = await page.locator('.mobile-thread-row').first().boundingBox()
      const y = Math.round(row.y + row.height / 2)
      await drag(cdp, { x: 60, y }, { x: 300, y }, { steps: 10, settle: 10 })
      await page.waitForTimeout(120)
    }
    const toasts = await page.locator('[data-sonner-toast]').count()
    const title = await page.locator('[data-sonner-toast] [data-title]').first().innerText()
    note(`65 · top of the inbox was ${JSON.stringify(atRest.slice(0, 40))}, after six archives ${JSON.stringify((await topRow()).slice(0, 40))}`)
    note(`65 · six archives → ${toasts} toast(s) on screen, the front one reads ${JSON.stringify(title)}`)
    await shoot(page, '65-undo-six-coalesced.png', { fast: true })

    // Tapped, not clicked: the whole complaint in issue 65 is about what a
    // FINGER can reach, so the proof has to be a finger. Six presses on the
    // one control, and the count comes down each time.
    for (let i = 1; i <= 6; i += 1) {
      await tapUndo(page, cdp)
      const seen = await page.locator('[data-sonner-toast] [data-title]').allInnerTexts()
      note(`65 · undo ${i} → ${JSON.stringify(seen)}`)
      if (i === 2) await shoot(page, '65-undo-after-two.png', { fast: true })
    }
    note(`65 · after six Undos the top of the inbox is ${JSON.stringify((await topRow()).slice(0, 40))} — back to where it started: ${(await topRow()) === atRest}`)
    await shoot(page, '65-undo-all-six-recovered.png', { fast: true })
  } finally {
    await browser.close()
    if (server) server.kill()
  }

  console.log('\n--- findings ---')
  for (const line of findings) console.log(line)
}

await main()
