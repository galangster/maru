# Desktop QA — wave 2

Lane: `lane/desktop-qa-2`. Build: Maru 0.1.8 at `52bed27`, demo mode, Vite dev server on
port 1799, headless Chromium through Playwright 1.62.1. Viewports: 1600×1000, 1024×700,
940×700, 900×700, 860×700, 820×700, 800×600 and 2560×1440.
Evidence: `wayfinder/captures/qa-desktop-2/` (92 PNG, 880 px wide, palette-encoded).

Wave 1 drove the surfaces. This wave drove the *edges*: no mouse at all, the accessibility
tree of every surface, two window extremes, content far past what the fixtures hold, undo
chains, mid-compose account switching, every sync failure and its recovery, and measured
contrast on rendered pixels rather than on tokens.

## Part A — regression on issues 1 to 7

All seven were already closed on `main` by the fix lane. Each was reproduced from its own
steps on this build and verified independently. A verification comment is on each issue;
`gh issue close` was a no-op because they were already closed.

| # | Issue | Verdict | Evidence |
|---|---|---|---|
| 1 | Forwarding leaves attachments behind | **Fixed** | The forward sheet carries `invoice-40812.pdf` as a removable chip. `a1-forward-attachment.png` |
| 2 | Send toast keeps offering Undo after the mail has gone | **Fixed** | Undo present while "Sending…", zero Undo buttons once the toast reads "Sent". `a2-toast-sending.png`, `a2-toast-after-commit.png` |
| 3 | Sidebar footer icons overlap at 940 px | **Fixed** | Measured at 900/940/960/990/1010 px with sync healthy and with all six failure kinds: zero overlap everywhere, and the sync chip drops out below about 1000 px rather than colliding. `a3-footer-940.png`, `a3-footer-960-sync-transient.png` |
| 4 | Demo mode shows six labels and no labelled mail | **Fixed** | Travel 2, Receipts 3, Family 2, Hiring 2, Reviews 2. `a4-label-travel.png` |
| 5 | Restoring from Trash gives no confirmation | **Fixed** | "Moved to Inbox" with Undo, mirroring "Moved to trash". `a5-restore-toast.png` |
| 6 | Row hover buttons have no name | **Fixed, by decision** | All five carry the name of what they do. The cluster stays out of the assistive tree deliberately, with the printed keyboard equivalents as the accessible path. `a6-row-hover-actions.png` |
| 7 | Disabled Send says nothing | **Fixed** | "Add a recipient to send" on hover, on press and after the send shortcut, which also puts the caret in To. `a7-send-tooltip-hover.png`, `a7-send-reason-after-press.png` |

Seven of seven. Nothing regressed, and nothing was fixed in a way that broke something else.

The one qualification is issue 4. `label:Clients` still returns nothing, because Clients
belongs to a third demo account that does not exist until you add one in Settings. That is
correct, not a leftover.

## What was driven

- **Keyboard only, end to end.** Triage (`j`/`k`/`e`/`#`), open, archive, undo, compose,
  fill all three fields by Tab, send with `⌘↵`, verify in Sent, search with `/`, clear with
  Escape, the palette, Settings and all seven of its tabs, the shortcut sheet, and the
  approvals queue — no mouse events at all. It works. Nothing on the primary path needs a
  pointer.
- **The accessibility tree of every surface**, read with Playwright's ARIA snapshot: inbox,
  reading pane, palette, shortcut sheet, Settings, approvals, composer, Later picker and
  the search bar. Names, roles, the tab order from a cold load, and focus restoration after
  every dismissable surface.
- **Window extremes**: 800×600 and 2560×1440, plus 820, 860, 900, 940, 990, 1010, 1024 and
  1100 px to bracket what the extremes turned up. Overflow, pane widths, dialog height, the
  composer, and reading-pane measure at each.
- **Content past the fixtures**: a 5,000-character subject through the composer, the toast,
  the thread row, the Sent list and the reading heading; a Unicode address with diacritics
  and Han characters; an empty body send.
- **Undo chains**: archive → archive → undo → undo; archive → switch mailbox → undo;
  archive → start a search → undo; undo on a cold load.
- **Multi-account mid-compose**: switching the From account with a half-written draft, then
  switching mailboxes twice, then sending.
- **Every `?sync=` failure kind** — `signedout`, `partial`, `transient`, `client`,
  `noclient`, `nocreds` — each followed by recovery: navigate to another mailbox and back,
  open and close Settings, and reload without the flag.
- **Rapid mailbox switching while a thread loads**: seven switches inside 300 ms during a
  thread open, then twenty in a row.
- **Search cycles**: five search-then-clear rounds, cleared three different ways (Escape,
  emptying the field, the close button), ending with a repeat of the first query.
- **Later custom date at the boundaries**: today, tomorrow, a past date, day 29, day 30,
  day 31, 2030, and an empty field — on the real clock, not the frozen capture clock.
- **Label operator edge cases**: case variants, quoted, truncated, empty, spaced, negated,
  comma-joined, a system label, a name that does not exist, two labels together, and
  `label:` paired with `is:`, `from:` and `has:`.
- **Dark and light contrast, measured**: every distinct text role on seven surfaces in each
  theme, resolved to real pixels through a canvas rather than parsed from tokens, composited
  down the ancestor chain, against the WCAG 2 floor for its size and weight.
- **Reduced motion**, compared against the same run without it.
- **Console output** across a sweep of thirty-three surfaces and actions.

## What held up

- **The keyboard path is complete.** Every surface opens, is operated and closes from the
  keyboard, and the tab order inside the composer is the order you would write in: To,
  Cc / Bcc, Subject, body, formatting, attach, Send.
- **Focus restoration is right nearly everywhere.** The palette, the shortcut sheet,
  Settings, the approvals queue and the Later picker all put focus back on the thread list
  when they close. Two surfaces do not (issue #44).
- **The accessibility tree is in good shape.** Every dialog is a named dialog with a
  heading. The thread list is one listbox with named options that carry the account, the
  sender, the time, the subject, the snippet, and the unread, starred and attachment states.
  Every icon-only control is named. There is one polite live region and it is used.
- **Dark mode has zero contrast failures.** Across the inbox, reading pane, composer,
  Settings, palette, Later picker and approvals queue, every text role clears its floor; the
  tightest is 4.61:1. This was the thing I most expected to find something in.
- **Every sync failure recovers cleanly.** All six kinds survive in-app navigation and a
  Settings round trip unchanged, and every one clears on a reload without the flag. The copy
  is still the best writing in the build.
- **Multi-account mid-compose is solid.** Switching the From account with a half-written
  draft keeps the recipient chip, the subject and the body; two mailbox switches keep them
  too; and the mail sends from the account you switched to and lands in that account's Sent.
- **Rapid switching does not tear.** Seven mailbox switches inside 300 ms during a thread
  load, and twenty in a row, leave the correct mailbox with the correct rows and no console
  output.
- **Search is clean over cycles.** Five search-and-clear rounds return to exactly twenty
  rows every time, by all three clearing gestures, and the repeated query gives the same
  count as the first time.
- **Label operators compose properly.** `label:` is case-insensitive, accepts quotes, and
  combines correctly with `is:`, `from:` and `has:` in either order.
- **Reduced motion is honoured.** Transforms drop to none, transition durations to zero, the
  toast slide is removed and the idle breathing animation stops; a 120 ms colour change is
  all that survives.
- **Nothing overflows.** No horizontal scroll at any width from 800 to 2560. The Settings
  dialog fits inside 600 px of height and scrolls internally. The composer sits fully inside
  an 800×600 window.
- **One console warning in the whole sweep**, and it is filed (#42).

## Issues filed

| # | Priority | Title | URL |
|---|---|---|---|
| 39 | P1 | In a small window, clicking a thread archives it instead of opening it | https://github.com/galangster/maru/issues/39 |
| 40 | P2 | Undo only ever goes back one step, and the second press says nothing | https://github.com/galangster/maru/issues/40 |
| 41 | P2 | A long subject makes the send confirmation taller than the window | https://github.com/galangster/maru/issues/41 |
| 42 | P3 | The Later mailbox never looks selected the way the other mailboxes do | https://github.com/galangster/maru/issues/42 |
| 43 | P3 | Saving for later with a past date confirms a time that never comes | https://github.com/galangster/maru/issues/43 |
| 44 | P3 | Closing the composer with Escape loses the keyboard user's place | https://github.com/galangster/maru/issues/44 |
| 45 | P3 | The pane dividers are keyboard stops with no name | https://github.com/galangster/maru/issues/45 |
| 46 | P3 | Three pieces of secondary text fall under the readable minimum in the light theme | https://github.com/galangster/maru/issues/46 |

One P1, two P2, five P3.

## The three worst

1. **#39** — at 800 px the hover action strip covers the centre of a thread row, so a click
   aimed at the subject fires Archive. It is undoable, and the toast says what happened, but
   it is the only place in the app where the ordinary click does the opposite of what it
   looks like it will do.
2. **#40** — undo is one slot deep and the second press is silent. Two quick archives and
   only the second is recoverable; the first thread's Undo was already withdrawn when the
   second toast replaced it.
3. **#41** — a pasted subject turns the send confirmation into a 3,700 px column down the
   left of the window for four seconds.

## Not filed, deliberately

- **The message body frame has no name.** The sandboxed frame that renders sender HTML is
  unnamed in the accessibility tree. Real, but thin, and it sits inside a named article with
  a named sender header, so it is not lost.
- **`-label:Travel` returns "No matches".** Negation is not an operator this app has;
  treating an unsupported prefix as a failed search rather than as text is defensible.
  Recorded, not filed.
- **At 2560 px the thread toolbar and the Reply / Reply all / Forward buttons sit about
  600 px to the left of the message they act on.** The message column is correctly centred
  and correctly measured; the controls stay pinned left. It reads as a deliberate rail
  rather than a defect, and it is a design call rather than mine.
- **The motion library prints a reduced-motion notice to the console** when the preference is
  on. Third-party, development-build only.
- **White message bodies in dark mode** and the **12 px shell card radius** — both recorded
  as decided before wave 1, and both still decided.

## Surprising

- **The thing wave 1 called most careful is the thing wave 2 broke.** Wave 1 chased undo
  expecting a badge drift bug and found it exact. It is exact — for one action. Ask it for
  two and it has already thrown the first away, silently, with no message when you ask.
- **Dark mode is flawless and light mode is not.** I measured dark expecting to find the
  failures there, because dark themes are where secondary text usually goes thin. Dark has
  zero. All three near-misses are in the light theme, all in the same secondary tier, and
  all only where that tier sits on a tinted or frosted panel instead of the plain page.
- **The narrow window does not break the layout, it breaks the meaning.** At 800 px nothing
  overflows, nothing collides, nothing scrolls sideways — the app looks fine. What has gone
  wrong is that the row got short enough for the hover buttons to reach its middle, so a
  click that looks like "open" is "archive". Every measurement I had was green.
- **The app has one console message in the entire build**, and it is a note to a developer
  about an icon — which is also, exactly, a visible bug: Later is the one mailbox that never
  looks selected. The warning and the defect are the same fact, printed twice.
- **Escape is inconsistent in one direction only.** Five surfaces restore focus perfectly.
  The two that do not are the two you are most likely to open by accident and close
  immediately.

## Coverage gaps

- **No long thread exists to drive.** The brief asked for a 200-message thread. The largest
  thread in the demo fixtures holds five messages, expanded and captured in
  `b11-longest-thread-expanded.png`. Thread virtualisation and the expand-all path at real
  length are untested, and cannot be tested from demo mode as it stands.
- **The third demo account was not added**, so the Clients label and three-account sidebar
  behaviour were checked only by inference from the two-account state.
- **The Maru account tab is still not driven**, for the same reason wave 1 gave: it requires
  creating an account and entering a password.
- **Glass surfaces are measured approximately.** Contrast on a frosted panel composites the
  panel's own declared background over its ancestors; it does not sample what the blur pulls
  through from behind. The three light-theme near-misses are on such panels, so their true
  ratios move a little with whatever is behind them.
- **Playwright 1.62 has no `page.accessibility.snapshot()`.** The trees were read with the
  ARIA snapshot API instead, which reports the same roles and computed names.
