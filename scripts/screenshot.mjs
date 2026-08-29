// Deterministic captures of the shell (T3) and the feature surfaces (T4).
//
//   node scripts/screenshot.mjs
//
// Drives the demo app at http://localhost:1420/?demo=1&screenshot=1, which
// freezes the clock and removes every transition, so two runs a week apart
// produce byte-comparable frames. Starts its own vite server if 1420 is not
// already serving, and kills only the server it started.

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { ORIGIN, startServerIfNeeded } from './dev-server.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/captures')

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

  // --- M1, the trust substrate ---------------------------------------------
  {
    // The approval queue with Scout's two pending sends, the first one
    // expanded so the body preview is in the frame.
    file: 'm1-11-approvals-light.png',
    query: '',
    open: null,
    act: async (page) => {
      await page.locator('[data-wren-approvals]').click()
      const rows = page.locator('li[data-approval-id]')
      await rows.first().waitFor({ timeout: 10_000 })
      await page.waitForFunction(
        () => document.querySelectorAll('li[data-approval-id]').length === 2,
        null,
        { timeout: 10_000 },
      )
      await rows.first().getByRole('button', { name: 'Read the message' }).click()
      await page.locator('li[data-approval-id]').first().locator('[data-approval-body]').waitFor({
        timeout: 10_000,
      })
    },
  },
  {
    // Settings → Agents: the agent, its capability chips and the send scope.
    file: 'm1-12-agents-settings-light.png',
    query: '',
    open: null,
    act: async (page) => {
      await page.locator('button[aria-label="Settings"]').click()
      const nav = page.locator('nav[aria-label="Settings sections"]')
      await nav.waitFor({ timeout: 10_000 })
      await nav.getByRole('button', { name: 'Agents' }).click()
      await page.getByRole('group', { name: 'Capabilities' }).waitFor({ timeout: 10_000 })
      // `group`, not `radiogroup`: the send-scope toggle dropped a keyboard
      // contract it never implemented (UI-REVIEW-2026-08-29 B2).
      await page.getByRole('group', { name: 'Send scope' }).waitFor({ timeout: 10_000 })
    },
  },
  {
    // The audit timeline, reached from the queue, in dark.
    file: 'm1-13-audit-dark.png',
    query: '&theme=dark',
    open: null,
    act: async (page) => {
      await page.locator('[data-wren-approvals]').click()
      await page.locator('li[data-approval-id]').first().waitFor({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Audit log' }).click()
      await page.getByRole('group', { name: 'Filter by agent' }).waitFor({ timeout: 10_000 })
      await page.locator('tbody tr').first().waitFor({ timeout: 10_000 })
    },
  },
]

async function main() {
  await mkdir(OUT, { recursive: true })
  const [server, browser] = await Promise.all([startServerIfNeeded(ROOT), chromium.launch()])

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
