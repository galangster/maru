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
 * Open the nth row and wait for the pane to have rendered it.
 *
 * The message card is the signal every shot that opens a thread needs — the
 * row click resolves a query, and a sleep long enough for that on this machine
 * is not long enough on another.
 */
export const openRow = (index) => async (page) => {
  await page.locator('[data-thread-key]').nth(index).click()
  await page.waitForSelector('section[aria-label="Reading"] [data-message-card]', {
    timeout: 10_000,
  })
}

/** Open the first row, then its Save for later menu. */
export const openLater = async (page) => {
  await openRow(0)(page)
  await page.keyboard.press('h')
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 })
}
