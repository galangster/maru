# Desktop interface review — 2026-09-02

Lane: `lane/desktop-ui-review`. Build: Maru 0.1.8 at `9eed13c`, demo mode, Vite on port 1699,
headless Chromium through Playwright 1.62. Viewports 1600×1000 and 1280×800, light and dark.
Evidence: `wayfinder/captures/ui-review-desktop/` — 50 PNG, 1280 px wide, palette-encoded,
no dithering.

Every number below was measured in the page — `getBoundingClientRect`, `getComputedStyle`, and
a canvas that composites the real background stack before computing a WCAG ratio. Nothing was
read off a screenshot.

This is an execution review against `docs/design/DIRECTION.md`. The visual direction itself —
palette, radius, type scale, the coral accent, the one licensed gradient — is settled and is
not under review.

## What was reviewed

- **Inbox** — unread and read rows, day grouping, hover, selection, the sender column, the
  scroll region, the empty reading pane.
- **Thread** — the participant header, the label affordance, the message card, the sandboxed
  body, the three reply tiles, the reading measure at 1600 px.
- **Compose and reply** — the field wells, the eyebrow labels, the quoted body, the format
  toolbar, the disabled and enabled Send.
- **Search** — the query bar, the result count line, result row geometry, the no-match state.
- **Later** — the picker with its five rows and digit accelerators, the Later list and its
  disclosure paragraph.
- **Bulk** — multi-select, the action bar that replaces the list header, the toast and Undo.
- **Settings** — the section menu and all seven sections, at both widths and both themes.
- **Command palette**, the **shortcut sheet**, the **approvals queue**.
- **States** — light and dark at both widths, the two sync-failure previews, blocked images,
  empty search, the empty reading pane, the archive toast, the Later toast.
- **Behaviour** — the full Tab cycle, focus-ring rendering and its measured contrast,
  `prefers-reduced-motion` token collapse, console errors on every surface.

## What holds

Recorded so the next reviewer does not re-derive it.

- **No console errors and no unhandled exceptions** on any surface, in either theme, at either
  width.
- **Tab order is clean.** Nineteen stops from Compose to the list, then the wrap. The thread
  list is a single stop. The per-row hover cluster contributes none. Both prior blocking
  findings on phantom tab stops hold fixed.
- **Reduced motion is still solved once.** Under `prefers-reduced-motion` the three duration
  tokens collapse to 120 ms and every lift, pop and scale token zeroes, so keyframes written in
  terms of them degrade rather than being suppressed one by one.
- **The 4 px grid holds** on every surface swept, with one exception: a 6 px gap in the bulk bar
  and in the approvals card. Nothing else off-grid was found.
- **Row geometry is exact.** List rows measure 64 px with a 4 px gap, so the pitch is the
  documented 68 px. Search results are 52 px with the same gap. Later picker rows are 36 px on
  a 40 px pitch. The sidebar sender column and the inbox subject column line up on every row.
- **The reading measure is capped and centred.** At 1600 px the reading column stays 651 px
  inside a 930 px pane, with equal margins. Widening the window does not widen the text.
- **The toast is the Superhuman shape it set out to be** — 336×56, bottom-left, 14 px radius,
  inline Undo, dismiss ×. Archive and Later produce the same toast, not two.
- **Avatar hues are stable.** The same sender carries the same hue in the inbox and in the Later
  list; reading a thread does not change it.
- **The command palette obeys its own rules** — one soft fill plus an accent-tinted icon on the
  selected row, no left bar, eyebrow section headings, a permanent keycap footer.
- **Copy is still the strongest thing in the build.** The sync-failure sentences name the
  account and the party at fault, the Later disclosure says what Gmail can and cannot see, and
  the no-match state names the window it searched.

## Issues filed

All carry the `ui-desktop` label.

| # | Priority | Title |
|---|---|---|
| 22 | P2 | The keyboard focus ring is too faint to see against the surface behind it |
| 23 | P2 | Search results start every subject in a different place, and cut most of them off |
| 24 | P2 | The bulk action buttons are 16 px tall, and Trash sits 6 px from its neighbours |
| 25 | P2 | The keyboard shortcut sheet cuts off two of its own descriptions |
| 26 | P2 | In dark mode the selected row's date and preview fall below the contrast floor |
| 27 | P2 | Keycaps and composer field labels fall below the contrast floor in light mode |
| 28 | P2 | The first item in Settings reads "Maru accou…" |
| 29 | P3 | The unread count beside Inbox falls below the contrast floor |
| 30 | P3 | The empty reading pane's subtitle falls below the contrast floor over the illustration |
| 31 | P3 | The disabled Send button's label is almost invisible |
| 32 | P3 | Hovering a row hides the end of its subject and all of its preview |
| 33 | P3 | A search with no matches still says to pick a thread on the left |
| 34 | P3 | On a read row the sender is greyer than the subject beneath it |
| 35 | P3 | The Compose button's icon is 16 px beside 20 px navigation icons |
| 36 | P3 | The Undo control in a toast is a sharp 4 px chip where the app uses pills |
| 37 | P3 | "up to 30 days" breaks the right-hand column in the Save for later menu |
| 38 | P3 | The Later list groups by return date but each row shows the date it arrived |

Seven P2, ten P3, no P1. Nothing here loses mail or blocks a task.

### The three that matter most

**22 — the focus ring.** It is 2.07:1 in light and 2.77:1 in dark against the surface it is
drawn on, under the 3:1 an indicator needs. It is the same ring on every control, so one change
fixes the whole app, and until it is made the keyboard path is technically complete and
practically hard to follow.

**23 — search results.** The subject starts anywhere across a 76 px band and seven of nine
results truncate. DIRECTION §1 says columns line up across every row of a list, always, and §2
credits the fixed sender column as the single decision that makes a list scannable. The inbox
obeys it; search does not, and search is where a person is hunting hardest.

**27 and 26 together — the tinted-fill contrast trap.** DIRECTION §3 certifies its text tiers
against `base`, `surface` and `raised`. Every measured failure in this review is the same tier
placed on a fill the table does not cover: `sunken` (4.42), the selected row's accent wash in
dark (4.28), the accent wash under the unread count (4.26), the character's halo (4.46). The
document already names this shape as a latent trap for accent-on-ground. It is now a live
defect on four surfaces, and the fix is one row added to the audit script rather than four
separate colour decisions.

## Decided, not filed

- **The 12 px shell card against the 14 px `radius-lg` token.** DIRECTION §6 records this as an
  open owner ruling of 2026-08-31, with the message cards deliberately left more rounded than
  the card they float on. Left alone, as the last two reviews did.
- **White message bodies in dark mode.** Recorded as deliberate in `UI-REVIEW-2026-08-28`; HTML
  mail is authored for paper. The plain-text half remains a product decision, not mine.
- **Icon stroke weight of 1.5 at every size.** DIRECTION §8 asks for 1.75 at 16 and 18 and 1.5
  at 20; the build ships 1.5 throughout. That is uniform rather than ragged, and reads as a
  retune the document has not caught up with. Worth a line in DIRECTION, not an issue.
- **Seven settings tiles against the "six fixed positions" DIRECTION §3 licenses.** A count in
  the document, not something a person sees as wrong.
- **The 6 px gaps in the bulk bar and the approvals card.** Off the 4 px grid, but they are
  inside issue 24's fix and inside a card that reads correctly otherwise.
- **The palette lists no shortcut beside Settings** although the sheet prints `⌘,` for it. Only
  visible if the two surfaces are compared side by side.
- **`?sync=` failure copy and the Later disclosure.** Reviewed and left alone; the desktop QA
  wave already recorded both as the best writing in the build, and I agree.
- **Composer chip and attachment remove controls at 16 px and 20 px.** Recorded as should-fix in
  `UI-REVIEW-2026-08-28` and still present. Not re-filed separately — issue 24 carries the same
  fix pattern, and the two reviews already hold the record.

## Coverage gap

The **Maru account** section was opened and captured but not driven, because its sign-up,
ceremony and delete paths need an account and a password. That path stays with a human. The
**inbox-zero celebration** was not reached — the demo mailbox does not empty inside a session
without archiving every thread, and the frequency guard makes a single observation
uninformative. **Onboarding** is out of demo mode by definition and was not forced.
