// The recorded demo of M4's triage morning — the human's half, deterministic.
//
//   node scripts/record-triage.mjs
//
// Drives the demo app at http://localhost:1420/?demo=1, whose fixtures *are*
// the morning after Scout's triage pass: a tidy inbox, two sends waiting, and
// a two-day audit trail. The recording walks the surfaces a person walks —
// inbox, `w` into the approval queue, read one message, approve it, then the
// audit log — and lands at docs/captures/triage-morning-demo.webm.
//
// The agent's half of the same story runs as a test, with the trail printed:
// `npx vitest run tests/triage-live.test.ts --reporter=verbose`. The full
// split-screen film with a live Claude is docs/TRIAGE-MORNING.md's runbook.

import { mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { ORIGIN, startServerIfNeeded } from './dev-server.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/captures')
const FILE = 'triage-morning-demo.webm'

const VIEWPORT = { width: 1440, height: 900 }

const beat = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  await mkdir(OUT, { recursive: true })
  const [server, browser] = await Promise.all([startServerIfNeeded(ROOT), chromium.launch()])

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      // Transitions stay on — a recording of a product with its motion
      // removed is a recording of a different product.
      recordVideo: { dir: OUT, size: VIEWPORT },
    })
    const page = await context.newPage()

    // 1. The tidy inbox, and the sidebar badge saying two sends wait.
    await page.goto(`${ORIGIN}/?demo=1`, { waitUntil: 'load' })
    await page.waitForSelector('[data-ready="true"]', { timeout: 20_000 })
    await beat(2500)

    // 2. `w` — "waiting on you" — into the approval queue.
    await page.keyboard.press('w')
    const rows = page.locator('li[data-approval-id]')
    await rows.first().waitFor({ timeout: 10_000 })
    await beat(2000)

    // 3. Read the first message before deciding. The human's step no agent
    //    can take for them.
    await rows.first().getByRole('button', { name: 'Read the message' }).click()
    await rows.first().locator('[data-approval-body]').waitFor({ timeout: 10_000 })
    await beat(3000)

    // 4. Approve it. The button confirms in place as Sent.
    await rows.first().getByRole('button', { name: /^Approve and send/ }).click()
    // The confirmation is the button itself — fill to green, glyph to a
    // check, label to "Sent" — and then the row leaves the queue, so the only
    // wait that cannot race the celebration is the queue getting shorter.
    await page.waitForFunction(
      () => document.querySelectorAll('li[data-approval-id]').length === 1,
      null,
      { timeout: 10_000 },
    )
    await beat(2500)

    // 5. The audit log: the whole morning, per agent, append-only.
    await page.getByRole('button', { name: 'Audit log' }).click()
    await page.locator('tbody tr').first().waitFor({ timeout: 10_000 })
    await beat(3500)

    await page.close()
    const video = await page.video().path()
    await context.close()
    await rename(video, join(OUT, FILE))
    console.log(`recorded docs/captures/${FILE}`)
  } finally {
    await browser.close()
    if (server) server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
