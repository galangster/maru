// App Store screenshot sets for "Maru Mail" (ticket I6).
//
//   node scripts/store-screenshots.mjs
//
// Apple requires a 6.5" set (1284×2778) and a 6.9" set (1320×2868). The iOS
// simulator captures in wayfinder/captures/ios are 393×852 — one CSS pixel per
// point — so they cannot fill either canvas, and upscaling a screenshot is the
// one thing a store asset must never be. This script therefore re-captures the
// same six mobile screens from the same demo build at deviceScaleFactor 3,
// which is 1179×2556 of real pixels, then composes each one onto the store
// canvas UNDER a caption. The device frame is only ever scaled DOWN.
//
// The composition runs in the browser rather than in sharp because the caption
// is set in Open Runde, and only a browser can be trusted with the woff2 the
// app itself ships.
//
// Output:
//   wayfinder/captures/store/device/*.png   1179×2556, the raw captures
//   wayfinder/captures/store/6.5/*.png      1284×2778, ready to upload
//   wayfinder/captures/store/6.9/*.png      1320×2868, ready to upload

import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'wayfinder/captures/store')
const DEVICE_OUT = join(OUT, 'device')

// Not 1420. Sibling worktrees run their own vite, and reusing whichever server
// answered first would silently capture another lane's build.
const PORT = 1436
const ORIGIN = `http://localhost:${PORT}`

// iPhone 16: 393×852 points at 3×. Every capture is 1179×2556 real pixels.
const VIEWPORT = { width: 393, height: 852 }
const SCALE = 3
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

/** DIRECTION §3, light: base, text-1, text-2. §4: the two families. */
const INK = '#191716'
const INK_2 = '#5D5A59'
const GROUND = '#F6F4F3'

// The six screens Apple's first three thumbnails have to sell, in order.
// Captions are one line, sentence case, Maru's voice — a statement of what the
// screen does, never a feature shout.
const SHOTS = [
  {
    file: '01-inbox.png',
    caption: 'Every Gmail account in one quiet inbox.',
    sub: 'Swipe to archive. Swipe the other way for Later.',
  },
  {
    file: '02-thread.png',
    caption: 'A conversation, not a pile of replies.',
    sub: 'Older messages stay collapsed until you want them.',
    act: async (page) => {
      await openThread(page)
    },
  },
  {
    file: '03-compose.png',
    caption: 'Write from the account you meant to write from.',
    sub: 'Reply, reply all, forward — with attachments.',
    act: async (page) => {
      await openThread(page)
      await page.getByRole('button', { name: 'Reply', exact: true }).tap()
      await page.locator('[aria-label="Compose message"]').waitFor({ timeout: 15_000 })
      // The reply is prefilled by the engine; the subject carries the marker.
      await page.locator('[aria-label="Compose message"] input[value^="Re:"]').waitFor({ timeout: 15_000 })
    },
  },
  {
    file: '04-later.png',
    caption: 'Not now. Bring it back when you asked.',
    sub: 'Later empties the inbox without losing the thread.',
    act: async (page) => {
      await openThread(page)
      await page.getByRole('button', { name: 'Later', exact: true }).tap()
      await page.locator('[aria-label="Bring it back on"]').waitFor({ timeout: 15_000 })
    },
  },
  {
    file: '05-account.png',
    caption: 'One password carries your setup to a new device.',
    sub: 'The service stores a vault it cannot read. Mail never reaches it.',
    act: async (page) => {
      await openSettingsTab(page)
      await page.getByRole('button', { name: /^Maru account\./ }).tap()
      await page.locator('[aria-label="Maru account"]').waitFor({ timeout: 15_000 })
    },
  },
  {
    file: '06-settings.png',
    caption: 'No telemetry. Mail goes only to Google.',
    sub: 'Images can be switched off in one tap.',
    act: openSettingsTab,
  },
]

// 1179×2556 sits inside both canvases at 1:1, so both scales below are < 1.
const CANVASES = [
  { name: '6.5', width: 1284, height: 2778, deviceWidth: 1040, top: 404 },
  { name: '6.9', width: 1320, height: 2868, deviceWidth: 1070, top: 423 },
]

/**
 * A synthetic click, not a tap. The row carries a 480 ms long-press that opens
 * the actions sheet, and an emulated touch tap is long enough to trip it — the
 * first run put that sheet over the thread in two frames.
 */
async function openThread(page) {
  await page.locator('.mobile-thread-row').first().dispatchEvent('click')
  await page.locator('[aria-label^="Thread:"]').waitFor({ timeout: 15_000 })
  await page.locator('.mobile-thread-toolbar').waitFor({ timeout: 15_000 })
}

async function openSettingsTab(page) {
  await page.locator('nav[aria-label="Primary navigation"]').getByText('Settings').tap()
  await page.locator('section[aria-label="Settings"]').waitFor({ timeout: 15_000 })
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: 'localhost' })
    socket.on('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function startServer() {
  if (await portOpen(PORT)) throw new Error(`port ${PORT} is busy; stop whatever holds it`)
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (await portOpen(PORT)) return child
    await new Promise((r) => setTimeout(r, 300))
  }
  child.kill('SIGTERM')
  throw new Error(`vite did not come up on ${PORT}`)
}

/** The store frame: caption, sub-caption, then the device shot on the ground. */
function frameHtml(canvas, shot, deviceFile) {
  const height = Math.round((canvas.deviceWidth * VIEWPORT.height) / VIEWPORT.width)
  const captionSize = Math.round(canvas.width * 0.050)
  const subSize = Math.round(canvas.width * 0.031)
  return `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family:'Open Runde'; src:url('fonts/OpenRunde-Semibold.woff2') format('woff2'); font-weight:600 }
  @font-face { font-family:'DM Sans'; src:url('fonts/DMSans-Regular.woff2') format('woff2'); font-weight:400 }
  * { margin:0; padding:0; box-sizing:border-box }
  body {
    width:${canvas.width}px; height:${canvas.height}px; overflow:hidden;
    background:${GROUND}; position:relative;
  }
  .copy {
    position:absolute; left:0; right:0; top:${Math.round(canvas.height * 0.043)}px;
    padding:0 ${Math.round(canvas.width * 0.085)}px; text-align:center;
  }
  h1 {
    font:600 ${captionSize}px/1.18 'Open Runde', system-ui, sans-serif;
    letter-spacing:-0.02em; color:${INK}; text-wrap:balance;
  }
  p {
    margin-top:${Math.round(captionSize * 0.42)}px;
    font:400 ${subSize}px/1.4 'DM Sans', system-ui, sans-serif;
    color:${INK_2}; text-wrap:balance;
  }
  img {
    position:absolute; top:${canvas.top}px; left:${Math.round((canvas.width - canvas.deviceWidth) / 2)}px;
    width:${canvas.deviceWidth}px; height:${height}px;
    border-radius:${Math.round(canvas.deviceWidth * 0.088)}px;
    box-shadow:0 ${Math.round(canvas.width * 0.028)}px ${Math.round(canvas.width * 0.062)}px
      ${-Math.round(canvas.width * 0.016)}px rgba(25,23,22,0.20);
  }
</style>
<div class="copy"><h1>${shot.caption}</h1><p>${shot.sub}</p></div>
<img src="device/${deviceFile}" alt="">
`
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(DEVICE_OUT, { recursive: true })
  await mkdir(join(OUT, 'fonts'), { recursive: true })
  const server = await startServer()
  const browser = await chromium.launch()

  try {
    const phone = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      userAgent: IPHONE_UA,
      isMobile: true,
      hasTouch: true,
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      reducedMotion: 'reduce',
    })
    const page = await phone.newPage()

    for (const shot of SHOTS) {
      await page.goto(`${ORIGIN}/?mobile=1&demo=1&screenshot=1&theme=light`, { waitUntil: 'load' })
      // The mobile shell has no readiness attribute; the first virtualized row
      // existing is the same signal — the thread query has resolved.
      await page.locator('.mobile-thread-row').first().waitFor({ timeout: 30_000 })
      if (shot.act) await shot.act(page)
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: join(DEVICE_OUT, shot.file) })
      console.log(`captured ${shot.file}`)
    }
    await phone.close()

    // The fonts have to sit beside the frame HTML: file:// pages cannot reach
    // out of their own directory in Chromium without a server.
    await copyFile(
      join(ROOT, 'src/assets/fonts/open-runde/OpenRunde-Semibold.woff2'),
      join(OUT, 'fonts/OpenRunde-Semibold.woff2'),
    )
    await copyFile(
      join(ROOT, 'src/assets/fonts/dm-sans/DMSans-Regular.woff2'),
      join(OUT, 'fonts/DMSans-Regular.woff2'),
    )

    for (const canvas of CANVASES) {
      const dir = join(OUT, canvas.name)
      await mkdir(dir, { recursive: true })
      const context = await browser.newContext({
        viewport: { width: canvas.width, height: canvas.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      })
      const framePage = await context.newPage()
      for (const shot of SHOTS) {
        const htmlPath = join(OUT, `frame-${canvas.name}-${shot.file}.html`)
        await writeFile(htmlPath, frameHtml(canvas, shot, shot.file))
        await framePage.goto(`file://${htmlPath}`, { waitUntil: 'load' })
        await framePage.evaluate(() => document.fonts.ready)
        await framePage.screenshot({ path: join(dir, shot.file) })
        await rm(htmlPath)
        console.log(`composed ${canvas.name}/${shot.file}`)
      }
      await context.close()
    }

    await rm(join(OUT, 'fonts'), { recursive: true, force: true })
  } finally {
    await browser.close()
    server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
