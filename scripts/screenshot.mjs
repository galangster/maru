// Deterministic captures of the shell (T3) and the feature surfaces (T4).
//
//   node scripts/screenshot.mjs
//
// Drives the demo app at http://localhost:1420/?demo=1&screenshot=1, which
// freezes the clock and removes every transition, so two runs a week apart
// produce byte-comparable frames. Starts its own vite server if 1420 is not
// already serving, and kills only the server it started.

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/captures')
const PORT = 1420
const ORIGIN = `http://localhost:${PORT}`

const VIEWPORT = { width: 1440, height: 900 }
const SCALE = 2

// The thread opened in capture 02: a newsletter, so the sandboxed body iframe
// has real HTML to render. Addressed by key, never by row index.
const RICH_THREAD = 'demo-personal/p-marginal'
// An account label with no threads in the fixture set — the empty state with
// no dependence on what trash happens to hold.
const EMPTY_VIEW = 'account:demo-personal:Label_family'

// The palette query. Two fixture threads mention Ridgeline, in two accounts —
// enough to show the results section without filling the list.
const PALETTE_QUERY = 'ridgeline'

const SHOTS = [
  { file: 't3-01-inbox-light.png', query: '', open: null },
  { file: 't3-02-thread-light.png', query: '', open: RICH_THREAD },
  { file: 't3-03-inbox-dark.png', query: '&theme=dark', open: null },
  { file: 't3-04-empty-trash-dark.png', query: `&theme=dark&view=${EMPTY_VIEW}`, open: null },

  {
    // A reply on the third thread in the inbox, prefilled and untouched:
    // recipients, subject and the quoted original all come from the engine.
    file: 't4-05-composer-light.png',
    query: '',
    open: null,
    act: async (page) => {
      await page.locator('[data-thread-key]').nth(2).click()
      await page.waitForSelector('section[aria-label="Reading"] iframe', { timeout: 10_000 })
      await page.keyboard.press('r')
      await page.waitForSelector('section[aria-label="Reply"]', { timeout: 10_000 })
      // Tiptap sets the quoted body on its first tick after mount.
      await page.waitForSelector('section[aria-label="Reply"] blockquote', { timeout: 10_000 })
    },
  },
  {
    file: 't4-06-palette-dark.png',
    query: '&theme=dark',
    open: null,
    act: async (page) => {
      await page.keyboard.press('Control+k')
      const input = page.locator('[cmdk-input]')
      await input.waitFor({ timeout: 10_000 })
      await input.fill(PALETTE_QUERY)
      // The results section only exists once the debounced search resolves.
      await page.locator('[cmdk-group-heading]', { hasText: 'Threads' }).waitFor({
        timeout: 10_000,
      })
    },
  },
  {
    file: 't4-07-settings-light.png',
    query: '',
    open: null,
    act: async (page) => {
      await page.locator('button[aria-label="Settings"]').click()
      await page.locator('nav[aria-label="Settings sections"]').waitFor({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Add account' }).waitFor({ timeout: 10_000 })
    },
  },
  {
    // Onboarding cannot be reached in demo mode by definition, so the preview
    // flag forces it. Captured on step two, where the two choices live.
    file: 't4-08-onboarding-light.png',
    query: '&onboarding=1',
    open: null,
    act: async (page) => {
      await page.getByRole('button', { name: 'Get started' }).click()
      await page.getByRole('button', { name: /Explore the demo/ }).waitFor({ timeout: 10_000 })
    },
  },
  {
    // The poll-interval select open in settings: trigger chevron, item check —
    // the shadcn select primitive rendering through the Icon seam.
    file: 't9-09-settings-select-light.png',
    query: '',
    open: null,
    act: async (page) => {
      await page.locator('button[aria-label="Settings"]').click()
      const nav = page.locator('nav[aria-label="Settings sections"]')
      await nav.waitFor({ timeout: 10_000 })
      await nav.getByRole('button', { name: 'Sync' }).click()
      await page.locator('#wren-poll').click()
      await page.locator('[data-slot="select-content"]').waitFor({ timeout: 10_000 })
    },
  },
  {
    // Adding the demo account fires a success toast — sonner's status icons
    // rendering through the Icon seam.
    file: 't9-10-toast-success-light.png',
    query: '',
    open: null,
    act: async (page) => {
      await page.locator('button[aria-label="Settings"]').click()
      await page.getByRole('button', { name: 'Add account' }).click()
      await page.locator('[data-sonner-toast]').waitFor({ timeout: 10_000 })
    },
  },
]

function portOpen(port) {
  return new Promise((resolve) => {
    // vite binds localhost, which resolves to ::1 first on macOS — probing
    // 127.0.0.1 alone reports the port closed while the server is up.
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

async function waitForPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

async function startServerIfNeeded() {
  if (await portOpen(PORT)) {
    console.log(`vite already serving on ${PORT}; reusing it`)
    return null
  }
  console.log('starting vite…')
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', detached: false })
  if (!(await waitForPort(PORT))) {
    child.kill('SIGTERM')
    throw new Error(`vite did not come up on ${PORT}`)
  }
  return child
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const server = await startServerIfNeeded()
  const browser = await chromium.launch()

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      // Relative dates and the 24-hour clock must not depend on the machine.
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()

    for (const shot of SHOTS) {
      await page.goto(`${ORIGIN}/?demo=1&screenshot=1${shot.query}`, { waitUntil: 'load' })
      await page.waitForSelector('[data-ready="true"]', { timeout: 20_000 })

      if (shot.open) {
        const row = page.locator(`[data-thread-key="${shot.open}"]`)
        await row.waitFor({ timeout: 10_000 })
        await row.click()
        // The body renders in an iframe that is measured after it parses.
        await page.waitForSelector('section[aria-label="Reading"] iframe', { timeout: 10_000 })
      }

      if (shot.act) await shot.act(page)

      // Nothing should sit under the cursor in a capture.
      await page.mouse.move(VIEWPORT.width - 4, VIEWPORT.height - 4)
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: join(OUT, shot.file) })
      console.log(`captured ${shot.file}`)
    }

    await context.close()
  } finally {
    await browser.close()
    if (server) server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
