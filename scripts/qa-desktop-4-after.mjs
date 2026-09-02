// The "after" frames for the desktop QA wave 4 fixes — issues 57, 58, 59.
//
//   node scripts/qa-desktop-4-after.mjs
//
// Written to `captures/qa-desktop-4/after/`, beside the frames wave 4 filed,
// so the one change is visible side by side. Every file is 880 px wide and
// palette-encoded, which is wave 4's own encoding.
//
// The width is not only the file's. Two of the three findings ARE about a
// narrow window, and 880 px sits below the ~926 px floor at which the panel
// group can still seat a wide sidebar — so the shots are driven at the width
// they are written at, and the frame is the window the issue describes.
//
// The runner and the shared acts are `scripts/lib/capture.mjs` and
// `scripts/lib/page-acts.mjs`.

import { join } from 'node:path'

import { openComposer, openLater, openRowMatching } from './lib/page-acts.mjs'

// This lane's own port, set BEFORE the harness is loaded — `dev-server.mjs`
// reads it once, at import. Several worktrees of this repository are driven at
// once and the harness reuses whatever is already answering on the port it
// knows, so a run without this photographs another worktree's build. Hence the
// dynamic import: a static one would be evaluated before this line.
process.env.WREN_DEV_PORT ??= '2299'
const { runWave, ROOT } = await import('./lib/capture.mjs')

const OUT = join(ROOT, 'wayfinder/captures/qa-desktop-4/after')

/** Below the floor at which a wide sidebar, the list and the reading pane fit. */
const VIEWPORT = { width: 880, height: 700 }
const FILE_W = 880

/** Apple's Show/Hide Sidebar chord, which is what issue #57 is about. */
const toggleSidebar = async (page) => {
  await page.keyboard.press('Meta+Alt+s')
  await page.waitForTimeout(400)
}

/**
 * Say where the keyboard ended up.
 *
 * A still frame shows a focus RING, which is the visible half of issue #58.
 * The other half is which element the browser thinks is focused, and that is
 * printed rather than drawn — a caret in a text field does not survive a
 * screenshot, and the issue's composer case is exactly that.
 */
const reportFocus = (label) => async (page) => {
  const where = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body — nothing focused'
    const inDialog = el.closest('[role="dialog"]') !== null
    const name =
      el.getAttribute('aria-label') ??
      el.getAttribute('placeholder') ??
      (el.textContent ?? '').trim().slice(0, 40)
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name}" · inside a dialog: ${inDialog}`
  })
  console.log(`    focus after ${label}: ${where}`)
}

/** Open the palette over whatever is already up, then close it with Escape. */
const paletteOverAndBack = async (page) => {
  await page.keyboard.press('Meta+k')
  await page.waitForSelector('[data-wren-surface="palette"]', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-wren-surface="palette"]', {
    state: 'detached',
    timeout: 10_000,
  })
  await page.waitForTimeout(300)
}

/** The issue's own reproduction: an Arabic subject and an Arabic body, sent. */
const ARABIC_SUBJECT = 'مرحبا بالعالم.'
const ARABIC_BODY = 'هذه رسالة تجريبية باللغة العربية. والسطر الثاني من الرسالة هنا.'

const sendArabicAndOpenIt = async (page) => {
  await openComposer(page)
  await page.locator('input[aria-label="To"]').fill('maya@fernwood.dev')
  await page.keyboard.press('Enter')
  await page.locator('#wren-subject').fill(ARABIC_SUBJECT)
  await page.locator('.wren-editor [contenteditable]').click()
  await page.keyboard.type(ARABIC_BODY)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.waitForSelector('section[aria-label="New message"]', {
    state: 'detached',
    timeout: 10_000,
  })
  // Sent is the third unified folder, so ⌘3 — the way a person gets there.
  await page.keyboard.press('Meta+3')
  await page.waitForSelector('[data-ready="true"]', { timeout: 10_000 })
  // The send is HELD for its undo window, so the thread is not in Sent the
  // instant the composer closes. Waiting on the row itself rather than on a
  // number: the window is the app's to change, and this frame is about the
  // message, not about the wait.
  await page
    .locator('[data-thread-key]')
    .filter({ hasText: ARABIC_SUBJECT })
    .first()
    .waitFor({ timeout: 30_000 })
  await openRowMatching(ARABIC_SUBJECT)(page)
  // Let the send toast retire, so the frame is the mail and not the toast.
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 20_000 })
  await page.waitForTimeout(400)
}

const SHOTS = [
  // ---- #57 -------------------------------------------------------------
  // The window the issue opens in. The sidebar has collapsed on its own, and
  // the rail is readable: a centred Compose glyph, four mailbox glyphs.
  { file: 'a57-narrow-rest.png', act: async (page) => page.waitForTimeout(200) },
  // One press of the shortcut. Before: the WIDE layout inside this rail —
  // "Compo", an icon cut off by the window edge, mailboxes reduced to "S",
  // "S", "T", "L". After: the rail is unchanged and a hint says why.
  { file: 'a57-narrow-after-toggle.png', act: toggleSidebar },
  // Dark, because the hint is a surface of its own and has to hold in both.
  { file: 'a57-narrow-after-toggle-dark.png', theme: 'dark', act: toggleSidebar },
  // Above the floor the shortcut still does exactly what it always did: the
  // wide sidebar collapses to the rail, Compose centred. Driven at 1000.
  { file: 'a57-wide-after-toggle.png', width: 1000, act: toggleSidebar },

  // ---- #58 -------------------------------------------------------------
  // The Save for later menu, with the palette opened over it and closed
  // again. The menu is still on screen and the keyboard is back on its own
  // row — before, focus was on the thread list behind a live dialog and one
  // Tab moved to a pane divider underneath it.
  {
    file: 'a58-focus-behind-palette-later.png',
    act: async (page) => {
      await openLater(page)
      await paletteOverAndBack(page)
      await reportFocus('Escape, over the Later menu')(page)
    },
  },
  // Tab once more, to show the walk stays inside the menu.
  {
    file: 'a58-later-tab-stays-in-the-menu.png',
    act: async (page) => {
      await openLater(page)
      await paletteOverAndBack(page)
      await page.keyboard.press('Tab')
      await page.waitForTimeout(200)
      await reportFocus('Tab, over the Later menu')(page)
    },
  },
  // The composer underneath. The caret is back in the field it left, which a
  // frame cannot show — the line printed beside this shot is the evidence.
  {
    file: 'a58-focus-behind-palette-composer.png',
    act: async (page) => {
      await openComposer(page)
      await page.locator('#wren-subject').click()
      await paletteOverAndBack(page)
      await reportFocus('Escape, over the composer')(page)
    },
  },

  // ---- #59 -------------------------------------------------------------
  // The issue's own reproduction, end to end: compose "مرحبا بالعالم." with
  // an Arabic body, send it, open it in Sent. One frame carries the whole
  // finding — the row's subject and snippet, the reading pane heading, and
  // the body — because at this width the list and the pane are side by side.
  // The full stop sits at the LEFT end of every line and the paragraphs are
  // aligned to the right edge of the sheet.
  { file: 'a59-rtl-subject-and-body.png', live: true, act: sendArabicAndOpenIt },
  { file: 'a59-rtl-subject-and-body-dark.png', theme: 'dark', live: true, act: sendArabicAndOpenIt },
]

await runWave(SHOTS, { out: OUT, viewport: VIEWPORT, fileWidth: FILE_W })
