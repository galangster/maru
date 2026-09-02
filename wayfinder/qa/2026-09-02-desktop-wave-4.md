# Desktop QA — wave 4

Lane: `lane/desktop-qa-4`. Build: the 0.1.10 candidate at `c433404`, demo mode, Vite dev
server on port 2199, headless Chromium through Playwright 1.62.1. Viewports 1600×1000 and
800×600 throughout, plus 1024×640, 940×700, 860×700 and 2560×1440 where a question needed
bracketing. Light and dark.
Evidence: `wayfinder/captures/qa-desktop-4/` (64 PNG, 880 px wide, palette-encoded).

This is the release-candidate check for 0.1.10. Part A asks whether the five things wave 3
left open landed, and re-measures the accent-as-text rule that shipped after it. Part B is
new ground: waves 1 to 3 walked the surfaces, so this wave walks the clock, the data edges,
the input edges, the window, and what happens when two things are open at once.

Every contrast number is taken from the **rendered pixels of a live frame**, by wave 3's
method: the ink is resolved by painting the computed colour into a canvas, so any colour
syntax lands as the sRGB bytes the compositor produces, and the ground is the modal pixel
inside the text's own box, with the lowest-contrast ground covering at least 2% of that box
reported beside it.

## Part A — verification since 0.1.9

All five reproduce as fixed. None is reopened.

| # | Issue | Verdict | Measured |
|---|---|---|---|
| 23 | Search subjects misaligned and cut off | **Fixed** | Alignment holds: all nine subjects start at one x, spread 0. The box went from a fixed 140 px to **216 px** and truncation from **7 of 9 to 2 of 9**. Same at 1024, 1600 and 2560 px. Longest subject still needs 244 px. |
| 32 | Hover hides the subject end and the preview | **Fixed** | The row no longer reflows. Subject box **122.5 px** and preview box **161.5 px**, identical at rest and on hover, at 1024, 1600 and 2560 px. The five action buttons sit at y 100 — the empty lane on line one — while the subject and preview sit at y 128. |
| 54 | Typed Later date fires a preset | **Fixed** | `1`, `2`, `3` and `4` typed into the field each leave the menu open with no toast. `09/12/2026` saves for **Sep 12, 9:00**; `12/24/2026` clamps to the 30-day limit and the toast names the day it clamped to. |
| 55 | Dark highlighted Later row too faint | **Fixed** | **4.62:1** on the highlighted row, was 3.94. The three rows below hold 4.61. Light is 5.17 highlighted, 5.15 unhighlighted. |
| 56 | Sidebar arrow keys do not return | **Fixed** | 260 → **276** on one right arrow → **260** on one left. Step is 16 px. Home 80, End 332. The thread-list divider is unchanged: 348 → 364 → 348. |

### The accent as a word, at rest and on hover

DIRECTION §3's ruling of 2026-09-02 gives a coloured word its own certified step. Four
sites draw one. All eight rest-state measurements and all eight hover measurements clear
the 4.5 floor, on the ground each word actually sits on.

| Site | Theme | Rest | Hover | Ground it sits on |
|---|---|---|---|---|
| Blocked-images **Show** | light | **4.80** | **5.96** | the notice's sunken fill |
| Blocked-images **Show** | dark | **8.56** | **11.14** | the notice's sunken fill |
| Settings **Setup guide** | light | **5.59** | **6.94** | surface |
| Settings **Setup guide** | dark | **6.03** | **7.85** | raised |
| Composer **Add link** | light | **5.59** | **6.94** | surface |
| Composer **Add link** | dark | **6.03** | **7.85** | raised |
| Body link in a composed message | light | **4.80** | 4.80 | the field's sunken fill |
| Body link in a composed message | dark | **8.56** | 8.56 | the field's sunken fill |

Modal and worst-case ground agree to two decimals at every one of these sites: none of the
four sits on a gradient, a halo or a frosted panel.

Two notes rather than findings. The composed-body link has no hover step — it takes
`accent-text` and stays there, which is right for a link inside a text field and not a
control. And a link in **received** mail is deliberately not on this tier: the message
sheet keeps a conventional blue, which is the ruling in DIRECTION §3, not a miss.

### The three behaviours the brief named

| Check | Result |
|---|---|
| Ten-deep undo | Holds. Ten archives take ten undos, each answering "Undone · Archived"; the eleventh says "Nothing to undo". |
| Keyboard resize step | Holds, and is now reversible on both dividers — see 56 above. |
| Later date field typing | Holds — see 54 above. In-range dates land on the day typed, out-of-range clamp and say so. |

## Part B — new ground

### 1. Time

Driven on Playwright's clock, installed before navigation so the app's own once-a-minute
tick runs against it.

| Question | Result |
|---|---|
| A Later wake | **Correct.** A thread saved for "this evening, 18:00" is out of the Inbox at once, and is back in the Inbox on its own after the clock passes 18:00 — no reload, no click. |
| The 10 s undo window | **Correct.** ⌘Z at 9 s undoes; at 11 s it says "Nothing to undo". The toast's own Undo button is withdrawn with the toast at about 4 s, well inside the window, so a stale button is never left standing. |
| The send undo window | **Correct.** "Sending… · Undo" at 0 s and at 3 s; "Sent", with no Undo, at 6 s. ⌘Z after that says "Nothing to undo" rather than unsending. |
| A watch that should show "stalled" | **Correct and live.** The sidebar reads "Maru can't reach Google. It keeps trying; nothing is lost. Last synced 1h ago", and the elapsed figure advances on its own — 1h, then 2h three minutes later, then 4h two hours on. No colour, no alarm, which is what §3 of the failure model asks for. |

### 2. Data edges

| Edge | Result |
|---|---|
| A thread with no subject | **Correct.** The row reads "(no subject)" and so does the reading pane heading. |
| A sender with no name | **Correct.** A bare address is shown as the address, with a two-letter monogram from it. |
| An empty mailbox, every lens | **Correct, all five.** Later: "Nothing waiting". Starred: "Nothing starred — Star a thread and it keeps its place here for you." Sent: "Nothing sent yet". Trash: "Trash is empty — Deleted threads rest here before Gmail clears them." Inbox was drained to seven rows in thirty archives and was not emptied; its empty state is not driven. |
| 0 and 1 unread | **Correct.** At zero the Inbox badge disappears entirely rather than showing "0"; one press of U brings it back as "1". |
| A label with one thread | **Not reachable.** The five labels in the demo data hold 2, 3, 2, 2 and 2 threads; the sixth is declared for an account that is not present. Recorded as a coverage gap. |

One defect came out of this pass: a message you have just sent names you by the account's
nickname rather than by your name (#61).

### 3. Input edges

| Edge | Result |
|---|---|
| Paste 20 addresses into To | **Correct.** All twenty become chips. The composer grows to 568 px in a 1000 px window and Send stays inside the window — and still does at 1024×640 and at 800×600, where the composer is 556 px and 516 px. |
| A 2 MB attachment | **Correct.** The chip reads "two-megabytes.bin 2.0 MB", the 25 MB ceiling is not touched, and the message sends. |
| Emoji and RTL in subject and body | **Glyphs correct, direction wrong.** Emoji, a four-person family sequence, and mixed Latin / Arabic / Hebrew all render with no clipping and no overflow in either theme. The base direction is left-to-right throughout — #59. |
| IME composition in search | **Wrong.** Search answers every intermediate composition state — #60. |

### 4. Window

No horizontal scroll at any size tested: `scrollWidth` equals the window width at
1024×640, 2560×1440 and 800×600, in the base state, with the sidebar collapsed, with the
reading pane at its minimum, with a thread open, with a twenty-chip composer open, with the
palette open and with the shortcut sheet open.

| Size | Sidebar collapsed | Reading pane at minimum | Composer + 20 chips |
|---|---|---|---|
| 1024×640 | 260 → 80 px, icon centred | list 528 / reading 414 | 556 px tall, Send ends at y 616 of 640 |
| 2560×1440 | 260 → 80 px, icon centred | list 528 / reading 1698 | 568 px tall, Send ends at y 1416 of 1440 |
| 800×600 | already 80 px — see #57 | list 358 / reading 360 | 516 px tall, Send ends at y 576 of 600 |

The one failure is #57: below about 860 px the sidebar has already collapsed on its own,
and the show/hide shortcut then puts its wide layout inside the narrow rail.

### 5. Resilience

| Case | Result |
|---|---|
| Reload mid-compose | **Correct, and better than expected.** A dirty draft mirrors to local storage on every edit. After a reload the composer does not reopen by itself, but the next Compose restores the draft whole — account, recipient, subject and body. |
| Navigate with a toast open | **Correct.** The archive toast survives a move from Inbox to Trash, and its Undo still reverses the archive it was raised for from the other mailbox. |
| The palette over an open dialog | **Two defects, one behaviour.** Over Settings the palette replaces it, which is deliberate and documented. Over the composer and over the Save for later menu it stacks — and closing it drops the keyboard behind the surface underneath, #58. |
| Escape stacking | **Correct as a stack, wrong on focus.** Palette over composer: one Escape closes the palette, a second closes the composer. Palette over the Later menu: one Escape closes the palette, a second closes the menu. Neither returns focus — #58. |

Two things behaved correctly and were nearly filed. Pressing `c` or `?` while the search
field has focus types the character rather than firing the shortcut, which is the typing
guard doing its job. And Escape from search returns focus to the thread list, which is
issue 44's fix still holding.

### 6. Console

**Silent.** Twenty page loads — ten paths in each theme, covering the inbox, `?images=block`,
`?onboarding=1`, all six `?sync=` kinds and `?view=later` — and fourteen driven actions —
open, expand all, star, unread, reply, forward, Later, palette, shortcut sheet, approvals,
Settings, search, archive-and-undo, trash-and-undo — wrote nothing to the console.

Two things were seen and are not product defects. Opening a newsletter with a hero image
logs `ERR_NAME_NOT_RESOLVED`, because the demo fixtures point their images at `.example`
hosts that cannot resolve; it is the fixture, not the app. And Playwright's clock injects a
script into every frame, which the message body's sandboxed sheet refuses — that error
appears only on the clock-driven runs and only when a body sheet is on screen.

## Issues filed

| # | Priority | Title |
|---|---|---|
| 57 | P2 | In a narrow window, hiding the sidebar wrecks it instead of hiding it |
| 58 | P2 | Closing the command palette drops you behind the window it opened over |
| 59 | P3 | Arabic and Hebrew mail is laid out left to right |
| 60 | P3 | Search answers half-typed Japanese while the input method is still composing |
| 61 | P3 | A message you just sent shows your account's nickname where your name should be |

## Issues reopened

None.

## The three that matter most

1. **#58** — a modal stays on screen while the keyboard goes behind it. Close the palette
   over the Save for later menu and the menu is still covering the window, but Tab moves to
   a pane divider underneath it. Nothing on screen says where the keyboard went, and the
   only way back into the menu is the mouse. It is also the third time focus restoration has
   been the finding: issue 44 fixed the composer and search, and the palette was not in that
   sweep.
2. **#57** — the sidebar shortcut is printed in the shortcut sheet, and in a small window it
   does the one thing a shortcut must never do: it leaves the interface in a worse state than
   it found it, with the Compose button's icon cut off by the edge of the window and every
   mailbox reduced to its first letter. It is recoverable by pressing it again, which nothing
   tells you.
3. **#59** — right-to-left mail reads correctly word by word and is laid out as if it were
   English. It is the only finding in this wave that a whole class of people would meet on
   their first message rather than at an edge.

## What held up

- **All five of wave 3's open findings landed**, and two of them landed further than the
  issue asked: search truncation went from seven rows to two, and the hover row now reserves
  a lane rather than reflowing.
- **The accent-as-text ruling is true on the pixels.** Eight sites, sixteen measurements
  counting hover, every one clear of the floor, on the ground each word actually sits on.
- **Time is honest.** The Later wake fires by itself, both undo windows expire when they say
  they will, and the stalled sentence keeps counting without a reload.
- **The window is sound.** No horizontal scroll at any of the seven widths driven, in any of
  seven states, and a twenty-chip composer keeps its Send button on screen at 800×600.
- **Drafts survive a reload**, in full, which was the one resilience answer this wave
  expected to be a defect and was not.
- **The build is silent** across thirty-four loads and actions.

## Surprising

- **The two half-fixes wave 3 named both went the rest of the way.** Wave 3's closing
  observation was that issue 23 and issue 32 each had a geometric clause that was fixed and a
  reading clause that was not. Both reading clauses are now fixed too, and by different
  mechanisms — a wider column in one, a reserved lane in the other.
- **Every defect this wave found is about a second thing being open, or about a language.**
  Nothing in the single-surface, single-language path failed. Three waves of surface sweeps
  appear to have exhausted that seam.
- **The most fragile thing in the build is focus, not colour.** Contrast has now been clean
  for two waves running. Focus has produced a finding in every wave it was examined in.
- **The narrow-window sidebar breaks only where it has already helped itself.** At 940 px and
  above the same shortcut is correct. The failure is exactly at the width where the app has
  already made the decision the shortcut is for.

## Not filed, deliberately

- **The Starred lens keeps the last thread open in the reading pane after the list empties.**
  Unstarring the thread you are reading takes it out of the lens without closing it, which is
  defensible: you are still reading it.
- **A link in a composed body has no hover step.** It is a link inside a text field, not a
  control, and DIRECTION's hover tier is for the control.
- **"Last synced 1h ago" at an elapsed 1h 59m.** Elapsed time floors, which is conventional
  and is what every other relative time in the build does.
- **A decorative glyph reaching 4 px past the left edge at 800×600** in the collapsed rail's
  empty reading pane. It is clipped by its own container and nothing scrolls.

## Coverage gaps

- **The Maru account section is still not driven**, for the fourth wave running: it needs an
  account and a password.
- **No label holds exactly one thread** in the demo data, so the one-thread label state was
  not reached. Two threads and three threads were.
- **The Inbox empty state was not reached.** Thirty archives left seven rows.
- **The native date calendar still cannot be opened** from the browser's control surface.
- **The IME evidence is synthetic.** The composition events were dispatched rather than typed
  through a real input method, because a headless browser has none. The field's own value at
  each stage, and the pane's answer to it, are what was measured.
- **No long thread exists to drive**, so thread virtualisation at real length is still
  untested. The largest demo thread is five messages.

## One note outside the test plan

`package.json` and `tauri.conf.json` both still read **0.1.9**. Nothing in this wave depends
on it, and it is a release-process detail rather than a defect, but the candidate names
itself as the version it is replacing.
