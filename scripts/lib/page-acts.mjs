// The acts the capture scripts share.
//
// Two wave scripts had grown their own copy of each of these, and the copies
// drifted: the same `search` waited on a DOM signal in one file and slept a
// flat 1200 ms in the other. A capture that sleeps is a capture that renders a
// skeleton on a slow machine, so where a signal exists the signal is the act.
//
// Shot-specific waits stay with their shot. This is only what more than one
// script asks the page to do.

/**
 * Open the search field, type, and wait for the list to answer.
 *
 * Both endings count: a query with hits answers with the results listbox, and
 * a query with none answers with its own "No matches" pane. Waiting for either
 * covers the debounce as well, so no number has to be guessed.
 */
export const search = (query) => async (page) => {
  await page.keyboard.press('/')
  await page.waitForSelector('input[type="search"], input[aria-label="Search mail"]', {
    timeout: 10_000,
  })
  await page.keyboard.type(query)
  await page
    .locator('ul[aria-label="Search results"], :text-is("No matches")')
    .first()
    .waitFor({ timeout: 10_000 })
}

/**
 * The signal a thread has actually opened.
 *
 * The row click resolves a query, and a sleep long enough for that on this
 * machine is not long enough on another — so every act that opens a thread
 * waits on the rendered message card, and waits on it in one place.
 */
const readingReady = (page) =>
  page.waitForSelector('section[aria-label="Reading"] [data-message-card]', { timeout: 10_000 })

/** Open the nth row and wait for the pane to have rendered it. */
export const openRow = (index) => async (page) => {
  await page.locator('[data-thread-key]').nth(index).click()
  await readingReady(page)
}

/**
 * Open the row containing `text`, and wait the same way.
 *
 * By index is right when the shot only needs *a* thread with several messages.
 * By text is right when the shot needs a PARTICULAR one — the thread that
 * pulls a remote image, say — because an index silently captures the wrong
 * surface the day the demo data is reordered.
 */
export const openRowMatching = (text) => async (page) => {
  await page.locator('[data-thread-key]').filter({ hasText: text }).first().click()
  await readingReady(page)
}

/** Open the first row, then its Save for later menu. */
export const openLater = async (page) => {
  await openRow(0)(page)
  await page.keyboard.press('h')
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 })
}

/**
 * Open the composer, and wait for the body editor as well as the surface.
 *
 * Two waits, because the section mounts before Tiptap does and a frame taken
 * between the two shows an empty well where the body belongs.
 */
export const openComposer = async (page) => {
  await page.keyboard.press('c')
  await page.waitForSelector('section[aria-label="New message"]', { timeout: 10_000 })
  await page.waitForSelector('.wren-editor [contenteditable]', { timeout: 10_000 })
}

/**
 * Open Settings, and optionally walk to one section by its nav label.
 *
 * Without a section this is the dialog on whatever it opens to, which is the
 * frame the review filed against. With one it is that section, reached the way
 * a person reaches it rather than by a deep link the app does not have.
 */
export const openSettings = (section) => async (page) => {
  await page.locator('button[aria-label="Settings"]').click()
  await page.waitForSelector('nav[aria-label="Settings sections"]', { timeout: 10_000 })
  if (section) {
    await page.locator('nav[aria-label="Settings sections"] button', { hasText: section }).click()
  }
}
