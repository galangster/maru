// The capture harness every screenshot script opens with.
//
// Two things, and both of them are correctness rather than convenience:
//
//   1. The context is PINNED. Relative dates, the 24-hour clock and every
//      transition must not depend on the machine the frames were taken on, or
//      two runs a week apart are not comparable and the whole point of a
//      deterministic capture is gone.
//   2. The page is waited ON, not slept past. `[data-ready="true"]` is set by
//      the thread list the moment its query settles, so it is the app saying it
//      has finished, rather than a number somebody guessed and that fails on a
//      slow machine by rendering a skeleton into the frame.
//
// Shot-specific waits stay with their shot. This is only the part that is the
// same in every script, because it is the same question in every script.

/** en-US, Pacific, no motion. The clock is frozen separately by `?screenshot=1`. */
export const DETERMINISTIC_CONTEXT = {
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  reducedMotion: 'reduce',
}

/** One pinned context. One, because a context per shot re-pays the browser
 *  profile and lets two frames disagree about locale or motion. */
export function newCaptureContext(browser, { viewport, deviceScaleFactor = 1 }) {
  return browser.newContext({ viewport, deviceScaleFactor, ...DETERMINISTIC_CONTEXT })
}

/** Navigate, and wait for the app to say it has rendered its list. */
export async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('[data-ready="true"]', { timeout: 20_000 })
}

/** Nothing should sit under the cursor in a capture, and nothing should still
 *  be loading. The last two lines before every `page.screenshot`. */
export async function parkPointer(page, viewport) {
  await page.mouse.move(viewport.width - 4, viewport.height - 4)
  await page.waitForLoadState('networkidle')
}
