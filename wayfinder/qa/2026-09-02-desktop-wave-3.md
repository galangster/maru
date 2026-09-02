# Desktop QA — wave 3

Lane: `lane/desktop-qa-3`. Build: Maru 0.1.9 at `51a7b26`, demo mode, Vite dev server on
port 1999, headless Chromium through Playwright 1.62.1. Viewports: 1600×1000 and 800×600
for the driven paths, plus 860, 900, 940, 1024 and 2560 px where a finding needed
bracketing. Light and dark throughout.
Evidence: `wayfinder/captures/qa-desktop-3/` (74 PNG, 880 px wide, palette-encoded).

This is the release-candidate check for 0.1.9. Waves 1 and 2 found the defects; the fix
lanes closed them. This wave asks two questions and nothing else. Did each fix land, and
did any of them break something that used to work.

Every contrast number below was taken from the **rendered pixels of a live frame**, not
from tokens and not from declared backgrounds. The text colour is resolved by painting it
into a canvas, so any colour syntax lands as the same sRGB bytes the compositor produces;
the ground is the modal pixel inside the text's own box, with the worst-case ground —
the lowest-contrast colour covering at least 2% of the box — reported separately wherever
the text sits on a gradient, a halo or a frosted panel. That is what issue 46 asked for,
and it is what the glass-surface coverage gap in wave 2 was about.

## Part A — verification of issues 22 to 46

Twenty-three of the twenty-five reproduce as fixed. Two still reproduce and are reopened.

| # | Issue | Verdict | Measured |
|---|---|---|---|
| 22 | Focus ring too faint | **Fixed** | Ring **3.69:1** against the seam behind it and **4.76:1** against the card fill in light; **6.59:1** and **7.07:1** in dark. Floor 3. Was 2.07 / 2.77. |
| 23 | Search subjects misaligned and cut off | **Reopened** | Alignment fixed — the subject starts at one x on all nine rows. Truncation unchanged: a fixed 140 px box, **7 of 9 truncate**, longest needs 244.4 px. Same at 1024, 1600 and 2560 px. |
| 24 | Bulk buttons 16 px, Trash crowded | **Fixed** | Buttons **24 px tall**, 28.8–43.2 px wide. Trash sits **8 px** from Later and from Read; the reversible pairs sit 4 px apart. |
| 25 | Shortcut sheet truncates itself | **Fixed** | Card 640 px, description column 200 px, **0 of 25** rows truncate. |
| 26 | Dark selected row date and preview | **Fixed** | Both **4.74:1** against the row's own fill. Floor 4.5. Was 4.28. |
| 27 | Keycaps and composer labels on the recessed fill | **Fixed** | Reply keycaps, composer From / To / Subject, and palette keycaps all **4.84:1**. Was 4.42. |
| 28 | "Maru accou…" | **Fixed** | Menu column now 176 px; the label needs 91.1 px in a 91.1 px box and draws no ellipsis. |
| 29 | Unread count on the tinted row | **Fixed** | **5.04:1** modal, **5.00:1** worst-case. Was 4.26. |
| 30 | Empty-pane subtitle over the halo | **Fixed** | **4.88:1** modal, **4.76:1** over the darkest band of the halo. Was 4.46. |
| 31 | Disabled Send almost invisible | **Fixed** | Recessed fill with readable ink: **4.84:1** light, **7.24:1** dark. Was 1.78 / 2.71. |
| 32 | Hover hides the subject end and the preview | **Reopened** | The actions no longer cover the text — the row reflows instead. On hover the subject's box drops 186.7 → **124 px** and the preview's box drops 97.3 → **0 px**. Same at 1024, 1600 and 2560 px. |
| 33 | No-match state offers an impossible action | **Fixed** | The pane now reads "Nothing on the left to open — try a different search." |
| 34 | Read row's sender greyer than its subject | **Fixed** | Sender and subject are the same ink on a read row; the row recedes as a whole. |
| 35 | Compose icon 16 px beside 20 px | **Fixed** | Compose icon **20 px**, matching all five navigation icons. |
| 36 | Sharp 4 px Undo chip | **Fixed** | 50.4 × 24 px pill at the app's own small size, inside the 14 px toast. |
| 37 | "up to 30 days" breaks the column | **Fixed** | Row five ends at the same x as the four times above it; the keycap column is left empty. |
| 38 | Later row shows the wrong date | **Fixed** | The row now reads "Back 18:00" under the "Today" heading — the return time, labelled. |
| 39 | Narrow-window click archives instead of opening | **Fixed** | At 800 px and 940 px the row centre is the row's own text column and the click opens the thread. |
| 40 | Undo one step deep and silent | **Fixed** | Three archives take three undos and the fourth says "Nothing to undo". **Ten archives take ten undos**; the eleventh says "Nothing to undo", as does a press on a cold start. |
| 41 | Long subject makes a 3,700 px toast | **Fixed** | With a 5,000-character subject the toast is **336 × 90 px** at 1600×1000 and at 800×600, subject clamped. |
| 42 | Later mailbox never looks selected | **Fixed** | The Later icon fills with the accent when selected, like the other four. No console output on that path. |
| 43 | Past date confirms a time that never comes | **Fixed** | A past date clamps to tomorrow 9:00; a far date clamps to the 30-day limit; the toast names the day it clamped to. The field carries the range. |
| 44 | Escape from the composer loses your place | **Fixed** | Escape from the composer and from search both restore focus to the control it was on, and the next Tab continues from there. |
| 45 | Unnamed pane dividers | **Fixed** | Named "Resize the sidebar" and "Resize the thread list", with a current value and a range. |
| 46 | Three light-theme secondary texts under the floor | **Fixed, closed** | On composited pixels: empty-pane subtitle **4.88:1** (worst case **4.76:1**), composer From **4.84:1**, Cc / Bcc **4.84:1**. Was 4.46 / 4.42 / 4.42. |

### The contrast pairs, side by side

Every pair issues 22, 26, 27, 29, 30, 31 and 46 cited, re-measured by this wave's method.

| Pair | Then | Now | Floor |
|---|---|---|---|
| Focus ring vs the seam, light | 2.07 | **3.69** | 3 |
| Focus ring vs the card fill, light | — | **4.76** | 3 |
| Focus ring vs the seam, dark | 2.77 | **6.59** | 3 |
| Focus ring vs the panel fill, dark | — | **7.07** | 3 |
| Selected row date, dark | 4.28 | **4.74** | 4.5 |
| Selected row preview, dark | 4.28 | **4.74** | 4.5 |
| Reply tile keycaps R / A / F, light | 4.42 | **4.84** | 4.5 |
| Composer From / To / Subject, light | 4.42 | **4.84** | 4.5 |
| Command palette keycaps, light | 4.42 | **4.84** | 4.5 |
| Unread count on the tinted row | 4.26 | **5.04** (worst 5.00) | 4.5 |
| Empty-pane subtitle over the halo | 4.46 | **4.88** (worst 4.76) | 4.5 |
| Disabled Send, light | 1.78 | **4.84** | 4.5 |
| Disabled Send, dark | 2.71 | **7.24** | 4.5 |
| Composer Cc / Bcc, light | 4.42 | **4.84** | 4.5 |

Fourteen pairs, fourteen clear. The tinted-fill trap the interface review named is closed
on every surface it named it on.

## Part B — regression sweep

Everything waves 1 and 2 drove, re-driven at speed, looking for what the fixes broke.

| Path | Result |
|---|---|
| Forward carries attachments | Holds. The forward sheet carries the message's file as a removable chip. |
| Send toast | Holds. Undo is present while "Sending…", and there are zero Undo buttons once it reads "Sent". |
| Undo chain, ten deep | Holds. Three archives, three undos, a fourth that says "Nothing to undo"; and ten archives, ten undos, an eleventh that says the same. |
| Toast Undo on an older entry | Holds. Three toasts stack, expand on hover, and the Undo on the **oldest** restores that thread to the top of the list. |
| Bulk actions and their undo | Holds. Archive, Later, Trash, Read and Unread each name their count — "3 threads archived", "2 threads saved for tomorrow, 9:00" — and each undoes. |
| Later with past and far dates | Holds when the date reaches the field. **Typing** the date does not — see issue 54. |
| Search results layout and actions | Column alignment fixed, truncation not (issue 23). Opening, archiving and undoing from a result all work. |
| Narrow window, 800 and 940 px | Holds. Clicking the row centre opens the thread. No horizontal overflow, no footer overlap, composer and shortcut sheet inside the window at 800, 860, 900, 940 and 1024 px. |
| Focus restore from the composer and search | Holds. Both restore. |
| Pane dividers by keyboard | Named, focusable, arrow-movable, Home and End correct. One asymmetry on the sidebar divider — see issue 56. |
| Settings tabs | Holds. All seven sections at 1600×1000 and 800×600, light and dark: every one fits inside the window, none overflows sideways. |
| Every `?sync=` kind | Holds. All six render their own sentence, survive a mailbox round trip and a Settings round trip unchanged, and clear on a reload without the flag. |
| Keyboard only, end to end | Holds. Triage, open, expand, star, unread, archive, trash, Later, undo after each, the palette, the sheet, Settings, approvals, search, all five mailboxes, the sidebar toggle, and compose-and-send — no mouse events. The message lands in Sent. |
| Console errors | **Zero.** Across 34 surfaces and actions, including `?images=block`, `?onboarding=1` and all six sync kinds, nothing was written to the console. Wave 2's single warning is gone with issue 42. |

### Contrast sweep across the build

Twelve surfaces in each theme — inbox, thread, composer, Settings, palette, shortcut
sheet, approvals, Later picker, search, bulk selection, the Later list and Trash — with
every visible text leaf measured against the pixels behind it, occluded and scrim-covered
text excluded.

**Twenty-three of the twenty-four surface-and-theme pairs are clean.** The tightest
passing value is 4.60:1 (the palette's section headings in light) and 4.61:1 (Settings and
the shortcut sheet in dark).

The one failure is new and is filed: in dark, the time on the **highlighted** row of the
Save for later menu measures **3.94:1**, against 4.61:1 on the three rows below it.

## Issues filed

| # | Priority | Title |
|---|---|---|
| 54 | P2 | Typing a date in the Save for later menu sends the mail back at the wrong time |
| 55 | P3 | In the dark theme the time on the highlighted Save for later row is too faint |
| 56 | P3 | Resizing the sidebar with the arrow keys does not put it back |

## Issues reopened

| # | Priority | What still happens |
|---|---|---|
| 23 | P2 | Every subject now starts at the same place, but the box is a fixed 140 px and seven of nine still truncate. |
| 32 | P3 | The actions no longer cover the row's text; the row reflows instead, and the end of the subject and the whole preview still disappear on hover. |

## The three that matter most

1. **#54** — the "Pick a date…" field looks focused, takes a caret, and then hands your
   digits to the menu behind it. Typing `09/10/2026` saves the thread for this evening.
   Nothing on screen says the date was ignored; the toast just names a time you did not
   choose. It is the only defect in this build where an ordinary action silently does
   something else.
2. **#23** — search is where a person is hunting hardest, and seven of nine results still
   stop mid-subject. The fix made the list scannable down its left edge and left the
   reason people scan it half-solved.
3. **#32** — hovering a row is how you reach its actions, and it is still the gesture that
   takes the row's own second line away. The mechanism changed from covering to
   reflowing; what a person sees did not.

## What held up

- **Every contrast decision landed.** Fourteen measured pairs, all clear, and the tightest
  text role anywhere in the build is now 4.60:1 rather than 1.78:1.
- **Undo is a real stack.** Ten deep, in order, each restoring the right thread to the
  right place, with a plain sentence at the bottom of it. This was wave 2's worst finding
  and it is the most thoroughly fixed.
- **The narrow window is honest again.** At 800 px the click that looks like "open" is
  "open".
- **The toast is bounded.** A 5,000-character subject produces the same 336 px toast as a
  short one.
- **The keyboard path is still complete**, and now ends where it started: Escape from the
  composer and from search restores focus, which was the last hole in it.
- **The build is silent.** Thirty-four paths, no console output of any kind.
- **Nothing that was working broke.** Every wave 1 and wave 2 regression path passes.

## Surprising

- **The two half-fixes are both the same shape.** Issues 23 and 32 each had two clauses in
  their title. In both, the geometric clause was fixed exactly and the "and it cuts the
  text off" clause was left. A fixed 140 px column truncates seven subjects instead of
  nine ragged ones; a reflowing row hides the preview instead of covering it. The
  measurement improved and the reading experience did not.
- **The date field is a new failure in a fixed area.** Issue 43 asked for a past date to be
  refused or clamped. It is clamped, correctly, at both ends. But the fix put a bare field
  where a list of numbered rows used to be, and the numbers kept their shortcuts. The old
  bug is gone and a worse one moved into the same three keystrokes.
- **Dark mode's one remaining miss is on the row you are about to choose.** Every other
  hover and selected fill in both themes clears the floor — the inbox hover, the palette's
  selected row, the thread list's selected row. The Later picker's highlighted row is the
  only one, and it misses by 0.56.
- **The focus ring went from the worst number in the build to a comfortable one.** 2.07:1
  to 3.69:1 against the hardest neighbour it has, and 4.76:1 against the ordinary one.

## Not filed, deliberately

- **Search result rows carry no hover actions**, where inbox rows carry five. The actions
  are reachable from the keyboard and from the reading pane, and a 52 px result row is not
  the same object as a 64 px inbox row. Recorded, not filed.
- **The capture clock and the Later presets.** Under the frozen capture clock the evening
  preset can read "this evening, 9:00". On the real clock it reads "this evening, 18:00".
  That is the frozen clock, not the product.
- **Focus after a dismissed surface lands on the sidebar mailbox** rather than the thread
  list, where wave 2 recorded the thread list. Both are the place the person came from;
  nothing is lost.
- **The 12 px shell card radius** and **white message bodies in dark mode** — decided
  before wave 1, still decided.

## Coverage gaps

- **The Maru account section is still not driven**, for the third wave running: it needs an
  account and a password.
- **The native date calendar could not be opened.** The field's typed path and its
  programmatic path were both driven, and the clamping was verified at both ends, but the
  operating system's own calendar popup is outside the browser's control surface.
- **No long thread exists to drive.** The largest demo thread is five messages, so thread
  virtualisation at real length is still untested.
- **The third demo account was not added**, so three-account sidebar behaviour is still
  inferred from the two-account state.
