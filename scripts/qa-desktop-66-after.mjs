// The "after" frames for issue #66 — the name on outgoing mail.
//
//   node scripts/qa-desktop-66-after.mjs
//
// Written into `captures/qa-desktop-4/after/`, the desktop QA wave 4 folder,
// at the same 880 px and the same palette encoding as every other frame in it.
// `qa-desktop-4-after.mjs` owns the `a57-`, `a58-` and `a59-` files there; this
// script owns the `a66-` ones and touches nothing else, so re-running either
// one never rewrites the other's evidence.
//
// The finding was that Settings offered no place to enter the name a person
// sends mail under, so the From header and the Sent list fell back to the
// address forever. Two frames, because the field has two states worth seeing:
// filled, and empty with the address standing in as the placeholder — which is
// not a suggestion but literally what recipients see while it is blank.
//
// The runner and the shared acts are `scripts/lib/capture.mjs` and
// `scripts/lib/page-acts.mjs`.

import { join } from 'node:path'

import { openSettings } from './lib/page-acts.mjs'

// This lane's own port, set BEFORE the harness is loaded — see the note in
// `qa-desktop-4-after.mjs`. Several worktrees are driven at once and the
// harness reuses whatever already answers, so a run without this photographs
// another worktree's build.
process.env.WREN_DEV_PORT ??= '2299'
const { runWave, ROOT } = await import('./lib/capture.mjs')

const OUT = join(ROOT, 'wayfinder/captures/qa-desktop-4/after')

/** Wave 4's width, and the window the wave's other frames were taken in. */
const VIEWPORT = { width: 880, height: 780 }
const FILE_W = 880

const SENDER_FIELD = '#wren-sender-name-demo-personal'

/** Settings → Accounts, reached the way a person reaches it. */
const openAccounts = async (page) => {
  await openSettings('Accounts')(page)
  await page.locator(SENDER_FIELD).waitFor({ timeout: 10_000 })
}

/**
 * Empty the first account's field and commit it, so the frame shows the
 * fallback rather than a name.
 *
 * The commit is on BLUR, so the click away is the act and not tidying up: it
 * is what makes the service clear the name. Waited on by the value the input
 * ends up holding, because the round trip goes through the store and the
 * account query before the placeholder can appear.
 */
const clearTheName = async (page) => {
  await openAccounts(page)
  await page.locator(SENDER_FIELD).fill('')
  await page.locator('#wren-sender-name-demo-work').click()
  await page.locator(SENDER_FIELD).and(page.locator('input[value=""]')).waitFor({ timeout: 10_000 })
  // Off the second field again, so no frame is a focus state by accident. A
  // click on the section's own prose, NOT Escape — Escape closes the dialog,
  // and the frame would then be the mailbox.
  await page.getByText('Maru shows every account in one list').click()
}

const SHOTS = [
  // The field itself, per account, under the row it belongs to. The demo's
  // accounts ship named, so this is the state a signed-in person sees once
  // the Google profile name has been prefilled.
  { file: 'a66-sender-name-field.png', act: openAccounts },
  { file: 'a66-sender-name-field-dark.png', theme: 'dark', act: openAccounts },
  // Emptied and committed: the placeholder is the address, which is exactly
  // what the From header and the Sent list fall back to.
  { file: 'a66-sender-name-empty.png', act: clearTheName },
]

await runWave(SHOTS, { out: OUT, viewport: VIEWPORT, fileWidth: FILE_W })
