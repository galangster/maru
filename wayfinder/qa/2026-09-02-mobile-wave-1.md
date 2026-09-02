# Phone QA — wave 1

Lane: `lane/mobile-qa`, fast-forwarded to `main` at `52bed27` (the desktop wave's own
fixes for issues 1–7) before anything was filed. Build: Maru 0.1.8, demo mode, Vite dev
server on port 1599, headless Chromium through Playwright 1.62. One viewport: 393×852 at
`deviceScaleFactor: 3`, `isMobile`, `hasTouch`, iPhone user agent; landscape checked at
852×393. Gestures were injected as touch — `Input.dispatchTouchEvent` sequences for
swipes, pulls, long presses and the edge back — never as a mouse.
Evidence: `wayfinder/captures/qa-mobile/` (29 PNG, 393 px wide, palette-encoded).

**How the phone shell was reached.** The mobile layer mounts when the platform is iOS or
when `?mobile=1` is present; `docs/IOS.md` names that flag as the browser-development
seam and the only way to reach Search and Settings outside the simulator. Every run used
`?mobile=1&demo=1` with an iPhone user agent, so the platform also resolves to iOS. Two
consequences are stated up front, because they bound the coverage: there is no Tauri
bridge in a browser, so **the native Liquid Glass tab bar, the push plugin and the
haptics are all absent** — the web tab bar renders in the native bar's place, and every
surface gated on push being available never appears.

## What was driven

- **Inbox** — the unified list and both per-account lenses; scrolling the full list to
  the last row; swipe right to archive; swipe left to Later; a 45 px partial swipe;
  a vertical drag over a row; pull to refresh across the threshold and short of it;
  the long-press menu; Edit mode, three-row selection, Select All, and the bulk bar.
- **Thread** — open from the list and from search; per-message expand and collapse; the
  participant header; attachment chips; a photo thread; an order receipt with a PDF; a
  long HTML newsletter; the top nav and the bottom toolbar; images shown and images
  blocked; the edge-swipe back, complete and abandoned half way.
- **Compose, reply, reply-all, forward** — recipient prefill for all three, empty send,
  a filled send, three sends in a row, the discard button, Cancel with a dirty draft and
  with a clean one, Add attachment, and the compose sheet's focus trap.
- **Search** — sixteen queries: `from:`, `to:`, `is:unread`, `is:read`, `is:starred`,
  `has:attachment`, `label:` in both cases, operator pairs, bare operators, a nonsense
  operator, a no-match query, and searches for archived and deferred mail.
- **Later** — all three presets, the custom date picker, a date past the 30-day limit,
  and the disclosure copy.
- **Settings** — every group, both toggles, the appearance picker, the accounts list,
  and the Maru account screen up to the sign-in form. No account was created and nothing
  was signed in to.
- **States** — light and dark; portrait and landscape; every `?sync=` failure kind
  (`signedout`, `partial`, `transient`, `client`, `noclient`, `nocreds`, and an unknown
  one); inbox zero; empty search; the largest accessibility text size and the size below
  it; `prefers-reduced-motion`.
- **Rapid double actions** — three swipes on one row in a row, six star toggles, two
  compose taps in the same frame, three sends.
- **Accessibility** — the full accessibility tree, taken through the browser's own
  accessibility layer, on the inbox, the thread, compose, search, settings and the
  account screen.

## What held up

- **No console errors and no unhandled exceptions** on any surface, once the two Tauri
  bridge probes that cannot resolve in a browser are set aside (see "Not driven").
- **Swipes work, and they work the way part 1 of the device-QA lane says they should.**
  Right archives, left opens Later, a 45 px swipe springs back with the row exactly where
  it started, a vertical drag scrolls and fires nothing, and a swipe that starts at the
  left edge of a pushed screen still scrolls rather than dragging the screen sideways.
  The axis lock holds.
- **Pull to refresh is correct.** The indicator tracks the finger, changes to "Release to
  refresh" at the threshold, runs, and settles. A pull that stops short of the threshold
  does nothing.
- **Search is the strongest surface on the phone.** Every operator the strip advertises
  works, operators combine, a bare operator degrades to a text match, and search reaches
  archived and deferred mail as well as the inbox.
- **The empty-send guard is right and the desktop's is not.** Tapping Send with no
  recipient puts "Add at least one recipient." on the sheet and keeps the draft. Desktop
  issue 7 was filed because the desktop disables Send and explains nothing; the phone
  explains.
- **No double-send and no double-compose.** Two compose taps in the same frame open one
  sheet; three sends in a row produce one message.
- **The single-thread undo is exact.** Archive by swipe, then Undo: the conversation
  returns to its position with its unread state intact.
- **Reduced motion is honoured, and honoured quietly.** The push and the sheet keep their
  shape but drop from 320 ms to 120 ms. That is a defensible reading of the setting and it
  is not filed.
- **The largest non-accessibility text size is clean** on the inbox, the thread, compose
  and settings — no clipping, no overflow, nothing off-grid. Only the accessibility sizes
  break, and only in two places.
- **Landscape does not overflow.** Nothing scrolls horizontally at 852×393.
- **Focus, sheets and modality.** Every bottom sheet is a real modal dialog with a name,
  takes focus and traps it; the tab bar goes inert behind one. The composer's discard
  confirmation asks before it throws work away.

## Issues filed

| # | Priority | Title | URL |
|---|---|---|---|
| 8 | P1 | Undoing a bulk archive brings back only one conversation | https://github.com/galangster/maru/issues/8 |
| 9 | P1 | Mail stops arriving and the phone never says so | https://github.com/galangster/maru/issues/9 |
| 10 | P2 | Coming back from a conversation loses your place in the inbox | https://github.com/galangster/maru/issues/10 |
| 11 | P2 | The forward screen is titled "Reply" | https://github.com/galangster/maru/issues/11 |
| 12 | P2 | Blocked images are never mentioned, and there is no way to show them | https://github.com/galangster/maru/issues/12 |
| 13 | P2 | There is no way to see what you saved for later | https://github.com/galangster/maru/issues/13 |
| 14 | P2 | At the largest text size the compose screen cannot be read | https://github.com/galangster/maru/issues/14 |
| 15 | P3 | Search results cannot be archived, saved for later, or starred | https://github.com/galangster/maru/issues/15 |
| 16 | P3 | Saving for later gives no confirmation and no way to undo | https://github.com/galangster/maru/issues/16 |
| 17 | P3 | A screen reader cannot tell which mail is unread | https://github.com/galangster/maru/issues/17 |
| 18 | P3 | The phone stays in selection mode over an empty inbox | https://github.com/galangster/maru/issues/18 |
| 19 | P3 | Sending gives no confirmation on screen | https://github.com/galangster/maru/issues/19 |
| 20 | P3 | At the largest text size the sender's name is cut to three characters | https://github.com/galangster/maru/issues/20 |
| 21 | P3 | There is no way to see sent mail on the phone | https://github.com/galangster/maru/issues/21 |

Two P1, five P2, seven P3. Seven of the fourteen are parity gaps rather than faults in
what the phone does have.

## Parity against the desktop wave

Each row is a line from the desktop report's "What was driven".

| Desktop feature | On the phone | Issue |
|---|---|---|
| Unified inbox | Yes | — |
| Per-account mailboxes | Yes, through the account picker | — |
| Starred view | No — reachable only as a search operator | 21 |
| Sent view | No | 21 |
| Trash view | No — trash is an action, not a place | 21 |
| Later view | No | 13 |
| Per-account label views | No, and the label picker is absent too | — |
| Open a thread, expand messages | Yes, per message; no expand-all | — |
| Star, read/unread from the thread | Yes, through the More menu | — |
| Participant header | Yes | — |
| `+ Label` on a thread | No | — |
| Attachment chips, photo thread, PDF receipt, long HTML mail | Yes | — |
| Compose, reply, reply-all, forward | Yes; forward is mistitled | 11 |
| Empty send | Better than the desktop: it explains | — |
| Undo window on send | No confirmation at all, so no window | 19 |
| Discard confirmation on an unsaved draft | Yes | — |
| Forward carries its attachment | Yes, since the desktop wave's fix landed | — |
| Search operators, pairs, bare operators, no-match | Yes, all of them | — |
| Act on a search result | No | 15 |
| Multi-select | Yes, through Edit | — |
| Bulk Archive · Later | Yes | — |
| Bulk Trash · Read · Unread | No | — |
| Bulk undo restores the batch | No — restores one | 8 |
| Bulk toast names the count | No | 8 |
| Later presets, custom date, 30-day clamp | Yes, all three | — |
| Later disclosure copy | Yes, on the sheet | — |
| Settings: Accounts, Appearance, About | Yes | — |
| Settings: Agents, Google API, Sync | No | — |
| Settings: Maru account | Yes | — |
| Command palette, shortcut sheet, approvals queue, sidebar toggle | No — desktop-shaped surfaces, not filed | — |
| Light and dark | Yes | — |
| Every `?sync=` failure kind | Reaches the phone, but is never drawn | 9 |
| Empty search, inbox zero | Yes, and the copy is good | — |
| Rapid double actions | Yes, and they hold | — |

## What was not driven, and why

- **The native Liquid Glass tab bar, the badge, the scroll-minimize, and every haptic.**
  They live in the iOS plugin and there is no Tauri bridge in a browser. The web tab bar
  stands in for the native one, and any defect in it is a defect in a development preview
  rather than in the shipped phone — so nothing about the web bar is filed, including the
  three labels running together at the largest text size.
- **Settings → Notifications, the push diagnostics row, and the test-push control.** The
  whole group is drawn only when the push runtime reports itself available, which needs
  the native plugin. Not reachable here.
- **The one-per-install "notifications need a Maru account" sheet.** It is derived from
  push being available, so it cannot fire in the browser preview either. Owed a simulator
  or device pass.
- **The Maru account sign-in, sign-up, recovery, device list and deletion.** Driven up to
  the form and captured; going further means creating an account and entering a password,
  which this lane does not do. Same coverage gap the desktop wave recorded.
- **Gmail sign-in.** Demo mode deliberately makes "Add Gmail account" inert and says why
  on the row. Nothing was signed in to.
- **Real Dynamic Type.** Emulated by setting the document's root text size, which is where
  the phone reads the system body size from. The two accessibility-size findings were
  re-taken after a first pass emulated it at the wrong level and produced three findings
  that were not real; those were discarded before anything was filed.
- **Physical-device scroll physics, the keyboard, and VoiceOver.** Still owed, and still
  on the queue from the I2 device-QA lane.

## Not filed, deliberately

- **The four items the I2 device-QA lane left for an owner** — the duplicated action set
  in the thread's nav and toolbar, mail bodies not scaling with Dynamic Type, the
  virtualizer's estimate-versus-measurement drift, and the undo toast under the expanded
  glass bar. All were seen; none is re-filed.
- **Bulk selection shows no count, and Select All never becomes Deselect All.** Small, and
  it sits inside issue 8's territory.
- **The forward and reply composer never shows the message it is quoting.** The quoted
  original does travel with the message; the compact composer is written to keep it out of
  the way. That reads as a deliberate phone composer rather than a defect, but it means the
  quote cannot be trimmed on the phone.
- **The discard confirmation is a system alert rather than the app's own dialog.** The
  desktop has a designed sheet with an honest subtitle. The phone's wording is honest too.
  Cosmetic, and it needs a device to judge.
- **`?sync=<unknown>` falls back to the same silence as the rest.** Covered by issue 9.
- **Demo labels are empty on the phone as on the desktop.** That is desktop issue 4.

## Surprising

- **The phone is at its best where the desktop was at its worst, and silent where the
  desktop is eloquent.** The empty-send guard the desktop got wrong, the phone gets right.
  The sync failure copy that the desktop wave called the best thing in the build reaches
  the phone and is never drawn — the same six carefully written sentences, all of them
  addressed to a screen nobody rendered.
- **The dangerous undo is the batch one.** A single archive undoes perfectly, including
  the unread flag. The bulk archive registers one undo per conversation into a store that
  holds one, so the last write wins and Undo quietly returns a single row out of forty.
  The toast that offers it says "Archived" with no count, so nothing on screen even hints
  at the arithmetic.
- **Losing your place is the most-felt bug and the least dramatic one.** Open a message,
  come back, and the inbox has moved a thousand pixels. It happens every single time, on
  the most repeated gesture in the app, and it never self-corrects.
- **Later is a one-way door.** The phone will happily take a conversation out of the inbox
  for a week, and then offers no list of what it took, no wake time, no undo and no
  confirmation. Everything the desktop built around Later — the view, the disclosure, the
  clamp — is on the phone except the part that lets you look at it.
- **Two of the three Dynamic Type findings I thought I had were my own emulation.** Setting
  the phone shell's font size scales the icons and not the type, because the type scale is
  written against the document root. Emulating it in the wrong place manufactured a clipped
  star, a clipped chevron and a Dark button off the edge of Settings — none of which
  happens on a phone. It is worth writing down: at large text sizes this shell degrades
  much better than a careless test makes it look, and only the compose screen genuinely
  falls over.
