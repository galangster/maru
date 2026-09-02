# Desktop QA — wave 1

Lane: `lane/desktop-qa`. Build: Maru 0.1.8, demo mode, Vite dev server on port 1499,
headless Chromium through Playwright 1.62. Two viewports: 1600×1000 and 940×600.
Evidence: `wayfinder/captures/qa-desktop/` (48 PNG, 880 px wide, palette-encoded).

## What was driven

- **Inbox and lenses** — unified inbox, Starred, Sent, Trash, Later, per-account
  mailboxes and per-account labels. `⌘1`–`⌘5`; `⌘6` correctly does nothing.
- **Thread** — open, expand all (`o`), star, read/unread, the participant header,
  the `+ Label` affordance, attachment chips, a long HTML newsletter, a photo thread,
  an order receipt with a PDF.
- **Compose, reply, reply-all, forward** — empty send, filled send, the 4 s undo
  window, Escape with an unsaved draft, forward of a message carrying an attachment,
  triple `⌘↵` to probe double-send.
- **Search** — `from:`, `to:`, `is:unread`, `is:read`, `is:starred`, `has:attachment`,
  `label:<name>` in both cases, operator pairs, bare operators, and a no-match query.
- **Bulk** — `x` multi-select, the bulk bar (Archive · Later · Trash · Read · Unread),
  batch archive of three, and undo by `⌘Z`, by the bare `z` alias, and by the toast button.
- **Later** — all three presets, the digit accelerators, the custom date picker and its
  30-day clamp, and the Later view after a save.
- **Settings** — all seven tabs (Maru account, Accounts, Agents, Appearance, Google API,
  Sync, About), read and captured.
- **Command palette** (`⌘K`), the shortcut sheet (`?`), the approvals queue (`w`), and
  the sidebar toggle (`⌥⌘S`, collapses to the 68 px rail and back).
- **States** — light and dark, 940×600 and 1600×1000, every `?sync=` failure kind
  (`signedout`, `partial`, `transient`, `client`, `noclient`, `nocreds`), empty label
  views, empty search, and the empty reading pane.
- **Rapid double actions** — three archives in a row, six star toggles in a row, three
  sends in a row.
- **Design review** against `ui-review` and `design-foundations`: icon sizes, radii,
  padding and gap values against the 4 px grid, focus-ring behaviour on mouse click.

## What held up

A great deal, and it is worth saying plainly.

- **No console errors and no unhandled exceptions** in any run, across every surface.
- **Undo is correct.** Archive → `⌘Z` restores the thread *and* its unread state; the
  unread badge tracks it exactly. The `z` alias and the toast button behave identically.
  I chased this hard, expecting a badge drift bug, and there is none.
- **No double-send.** Three `⌘↵` presses in quick succession produce one message in Sent.
- **Focus rings are `:focus-visible`-correct.** Clicking a sidebar item with the mouse
  draws no ring; tabbing does.
- **The 4 px grid holds.** A sweep of every padding, gap and row-gap on the inbox surface
  found zero off-grid values. Radii resolve to the documented tokens; the 12 px shell card
  is the owner ruling recorded in DIRECTION §6, not a drift.
- **Draft protection.** Escape on a half-written message opens "Discard this draft?" with
  the honest subtitle "Maru does not keep drafts yet."
- **The failure copy is the best thing in the build.** Every `?sync=` kind produces a
  specific, non-technical sentence that names the account, says whether Google or Maru is
  at fault, and says what to do. `partial` names *which* account is signed out.
- **The Later disclosure** rides the picker, the Later view header and Settings → Sync,
  exactly as the ruling requires, and the custom date is clamped to 30 days with a stated
  reason.
- Small windows do not overflow: at 940×600 nothing scrolls horizontally, the row snippet
  drops out by container query, and the reply tiles shed their keycaps cleanly.

## Issues filed

| # | Priority | Title | URL |
|---|---|---|---|
| 1 | P1 | Forwarding a message leaves its attachments behind | https://github.com/galangster/maru/issues/1 |
| 2 | P2 | The send toast keeps offering Undo after the mail has already gone | https://github.com/galangster/maru/issues/2 |
| 3 | P2 | Sidebar footer icons overlap at a 940 px window width | https://github.com/galangster/maru/issues/3 |
| 4 | P2 | Demo mode shows six labels and no labelled mail | https://github.com/galangster/maru/issues/4 |
| 5 | P3 | Restoring a thread from Trash gives no confirmation and no undo | https://github.com/galangster/maru/issues/5 |
| 6 | P3 | Row hover buttons have no name for a screen reader | https://github.com/galangster/maru/issues/6 |
| 7 | P3 | Send is disabled with no reason given, and the send shortcut is silent | https://github.com/galangster/maru/issues/7 |

One P1, three P2, three P3. Nothing here blocks the app from being used; issue 1 is the
only one that can cost a person something they cannot see going.

## Not filed, deliberately

- **White message bodies in dark mode.** Every message read in the dark theme puts sender
  HTML on a white slab inside a dark card, which looks wrong. It is recorded as deliberate
  in `UI-REVIEW-2026-08-28` — HTML mail is authored for paper. That review flags plain-text
  bodies as the open half of the question, and I agree, but it is a product decision and
  not mine to file.
- **12 px shell cards against the 14 px `radius-lg` token.** DIRECTION §6 states this is an
  owner ruling of 2026-08-31 and an open decision. Left alone.
- **`?sync=<unknown>` falls back to the transient message.** A development flag; no user
  reaches it.
- **Three icon sizes on one screen** (16, 18, 20 px). Consistent by role, so this reads as
  a scale rather than a drift.

## Surprising

- **The undo I expected to be broken was the one thing built most carefully.** Archiving an
  unread thread and undoing it restores the unread flag, the badge and the row position.
  Meanwhile the undo that *is* broken is the send toast, where the button stays on screen
  after the point of no return and silently does nothing. The reversal that is hard to get
  right is right; the one that is easy is wrong.
- **The demo is the shipped evaluation path, and its labels are empty.** Six labels are
  declared and none is attached to a single thread, so the entire label feature — the hue
  family DIRECTION §3 spends a page on, the picker, the `label:` operator — cannot be seen
  by anyone who has not connected a real Gmail account. The one surface the design document
  invests most in is the one surface the demo cannot show.
- **The forward that promises an attachment it does not carry.** The quoted body reads
  "Your invoice is attached as a PDF" directly above a composer with no attachment. The
  app writes the sentence that disproves itself.
- **The narrow-window collision has a very narrow band.** Between roughly 940 px and 990 px
  the sync icon overruns its own 1 px flex box and lands on the collapse button. Below
  900 px the sidebar collapses to the rail and the problem disappears, which is probably
  why it survived — the responsive review checked 960 and 940 for the rail, and the rail is
  fine at both.
- **The writing is a level above the build.** The sync failures, the Later disclosure, the
  discard-draft subtitle and the agent capability copy all say the true, slightly awkward
  thing rather than the reassuring one. Issue 7 exists only because one control — a disabled
  Send button — is the single place in the app that explains nothing.

## Coverage gap

The Maru account tab was inspected and captured but **not driven**. Its sign-up, ceremony,
device and delete flow requires creating an account and entering a password, which I do not
do. Nick or another human should drive that path; everything up to the form is captured in
`25-settings-*.png`.
