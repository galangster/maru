# Phone QA — wave 2

Lane: `lane/mobile-qa-2`, sitting on `main` at `a3b8103` — the merge of
`lane/mobile-fixes-b`, which carries the fixes for wave 1's issues 8–21 and the
mailbox picker. Build: Maru 0.1.8, demo mode, Vite dev server on port 1899,
headless Chromium through Playwright. One viewport: 393×852 at
`deviceScaleFactor: 3`, `isMobile`, `hasTouch`, iPhone user agent; landscape
checked at 852×393. Gestures were injected as touch — `Input.dispatchTouchEvent`
sequences for swipes, long presses and the edge back — never as a mouse.
Evidence: `wayfinder/captures/qa-mobile-2/` (106 PNG, 393 px wide,
palette-encoded).

Same seam as wave 1: `?mobile=1&demo=1` with an iPhone user agent, so the
platform also resolves to iOS. There is no Tauri bridge in a browser, so the
native Liquid Glass tab bar, the push plugin and the haptics are still absent,
and every surface gated on push being available is still unreachable. The two
Tauri bridge probes that cannot resolve in a browser still throw on load and are
still set aside.

## Part A — regression on issues 8 to 21

All fourteen had already been closed by the fix lanes with no comment. Each was
re-driven from its own reproduction steps. All fourteen hold. A verification
comment naming the commit and the capture is on each issue.

| # | Priority | Title | Verdict | Capture |
|---|---|---|---|---|
| 8 | P1 | Undoing a bulk archive brings back only one conversation | **Fixed** — toast reads "3 conversations archived"; Undo returns all three in their original order | `02-bulk-archive-toast.png`, `03-bulk-undo-restored.png` |
| 9 | P1 | Mail stops arriving and the phone never says so | **Fixed** — all six failure kinds draw their own named message, and the message opens Settings | `14-sync-signedout.png`, `15-sync-partial.png` |
| 10 | P2 | Coming back from a conversation loses your place | **Fixed** — exact offset restored at 1,200 px and 2,358 px | `16-scroll-restore-2400.png` |
| 11 | P2 | The forward screen is titled "Reply" | **Fixed** — Reply / Reply all / Forward each name themselves | `09-compose-Forward.png` |
| 12 | P2 | Blocked images are never mentioned | **Fixed** — "Remote images blocked · they can tell the sender you opened this", with a Show control | `11-blocked-images-notice.png`, `12-blocked-images-shown.png` |
| 13 | P2 | There is no way to see what you saved for later | **Fixed** — Later is a mailbox, and each row shows "Back Mon, 9:00" | `24-later-view-populated.png` |
| 14 | P2 | At the largest text size the compose screen cannot be read | **Fixed** — title, From, recipient chip, subject and the discard control all on screen at XXXL; nothing overflows | `18-xxxl-compose.png` |
| 15 | P3 | Search results cannot be archived, saved for later, or starred | **Fixed** — results swipe, star, long-press and show the unread dot | `13-search-swipe-archive.png` |
| 16 | P3 | Saving for later gives no confirmation and no undo | **Fixed** — "1 conversation saved for tomorrow, 9:00" with a working Undo | `04-later-toast.png` |
| 17 | P3 | A screen reader cannot tell which mail is unread | **Fixed** — rows announce unread, starred and the message count | `00-recon-inbox.png` |
| 18 | P3 | The phone stays in selection mode over an empty inbox | **Fixed** — Select All → Archive ends selection mode | `06-empty-after-select-all.png` |
| 19 | P3 | Sending gives no confirmation on screen | **Fixed** — a "Sent" confirmation naming the subject | `08-send-toast.png` |
| 20 | P3 | At the largest text size the sender is cut to three characters | **Fixed** — the sender takes the full row width | `17-xxxl-inbox.png` |
| 21 | P3 | There is no way to see sent mail on the phone | **Fixed** — Starred, Sent and Trash are mailboxes in the picker, with the per-account labels below them | `01-mailboxes-picker.png`, `07-mailbox-sent.png` |

## Part B — the new surfaces under hostile use

### What was driven

- **The mailbox picker.** Every entry — All inboxes, Personal, Work, Starred,
  Sent, Trash, Later, and all five label mailboxes. Fifteen switches in a row
  with no wait between them. A switch made in the middle of a selection.
  The picker in dark mode and in landscape.
- **The new mailboxes as places to act.** Swipe right, swipe left into Later,
  long press, Move, and every bulk action, inside Starred, Sent, Trash and
  Later — checked for effect, not only for confirmation.
- **The label picker.** Toggle on, toggle off, rapid double tap, the chip that
  appears on the conversation, and the sheet re-read across toggles.
- **Later.** Populated from a swipe, from the conversation's top bar and from
  the bottom toolbar; the view after an undo; acting on a row inside it.
- **Bulk.** Three rows and Select All; Archive, Later, Trash, Read and Unread;
  the counted toast; undo of the batch; three taps on Archive in the same frame.
- **Undo chains.** Four single archives in a row, then Undo repeatedly.
- **Search.** Query, open a result, act from inside the result, back; act on a
  result without leaving; a tab round-trip; the query and the results afterwards.
- **The conversation.** Expand all and collapse all; `+ Label`; the top bar, the
  bottom toolbar and the More menu compared against each other; where each
  action leaves you.
- **Sheets.** The back gesture from all six, over the inbox and over an open
  conversation; the grab handle; the scrim; the Close button; Escape.
- **The compose sheet with a keyboard**, emulated as a 300 px viewport shrink.
- **A 5,000-character subject** in compose, in the confirmation, in the inbox
  row, in the Sent list, on the conversation screen and in the action sheet.
- **Rapid double actions.** Three sends in the same frame; two archives in the
  same frame from a conversation; three bulk archives in the same frame.
- **Dark mode** on the picker, Sent, the empty Later view, the label sheet, the
  toast, the sync message and the blocked-image notice.
- **The largest accessibility text size** on the inbox, the compose sheet and all
  three sync messages. **Landscape** at 852×393 on the inbox and the picker.
- **Accessible names** on every control of every new surface.

### What held up

- **No console errors and no unhandled exceptions** on any new path, once the
  two Tauri bridge probes are set aside.
- **Rapid mailbox switching is clean.** Fifteen switches with no settle time
  leaves one title, one list, and no sheet stranded open.
- **Switching mailbox mid-selection is handled.** The selection clears, the bulk
  bar greys out, Edit mode stays, and selecting in the new mailbox re-arms it.
- **Every rapid double action holds.** Three sends produce one message; two
  archives produce one archive and one undo; three bulk archives produce one
  batch of three and one undo that returns all three.
- **The label picker is correct under a double tap.** The second tap is refused
  while the first is in flight, so the toggle lands where the finger meant it.
- **Later survives an undo.** Deferring, undoing, and then opening Later shows
  only the conversation that was actually deferred.
- **Bulk works in every new mailbox.** Edit, select, and the five actions arm
  correctly in Starred, Sent, Trash and Later.
- **A 5,000-character subject breaks nothing but the confirmation.** The inbox
  row stays 80 px, the Sent list, the conversation screen and the action sheet
  all shorten it, and nothing scrolls sideways anywhere.
- **The compose sheet with the keyboard up is clean.** At a 552 px viewport
  Cancel, Send, the recipient row, the subject and the body are all on screen
  and nothing is cut.
- **Dark mode is right on every new surface**, including the sheet, the empty
  Later state and the blocked-image notice.
- **Nothing overflows sideways** at the largest accessibility text size or in
  landscape, and the picker scrolls in landscape rather than clipping.
- **Every new control has an accessible name.** The picker marks the current
  mailbox with `aria-current`, the label rows carry `aria-pressed`, and a
  selected row announces its selection.
- **The sync message is a control that works.** Tapping it moves to Settings.
- **Starred is the model the other new mailboxes are not.** Archiving there
  really removes the conversation from the inbox and correctly leaves it starred.

## Issues filed

| # | Priority | Title | URL |
|---|---|---|---|
| 47 | P1 | A long subject makes the sent confirmation cover the whole screen | https://github.com/galangster/maru/issues/47 |
| 48 | P2 | Archiving and saving for later in Sent and Trash say they worked and do nothing | https://github.com/galangster/maru/issues/48 |
| 49 | P2 | Coming back from a search result empties the search | https://github.com/galangster/maru/issues/49 |
| 50 | P2 | Putting a conversation away from inside it leaves you still reading it | https://github.com/galangster/maru/issues/50 |
| 51 | P2 | At the largest text size the mail-stopped message cuts off the account it names | https://github.com/galangster/maru/issues/51 |
| 52 | P3 | The phone says mail has stopped arriving on this Mac | https://github.com/galangster/maru/issues/52 |
| 53 | P3 | Sheets cannot be dragged closed and the back gesture only works on some of them | https://github.com/galangster/maru/issues/53 |

One P1, four P2, two P3. Every one of them is in a surface that did not exist
before the fix lane: the mailboxes, the sent confirmation, the sync message, the
search return trip, and the sheets those mailboxes are reached through.

## Parity against the desktop wave

Rows that moved since wave 1 are marked **new**.

| Desktop feature | On the phone | Issue |
|---|---|---|
| Unified inbox | Yes | — |
| Per-account mailboxes | Yes, in the Mailboxes picker | — |
| Starred view | **new** — Yes, and actions there behave | — |
| Sent view | **new** — Yes, but Archive and Later there do nothing | 48 |
| Trash view | **new** — Yes, but Archive and Later there do nothing | 48 |
| Later view | **new** — Yes, with the wake time on each row | — |
| Per-account label views | **new** — Yes, all five | — |
| Open a thread, expand messages | Yes, per message | — |
| Expand all / collapse all | **new** — Yes | — |
| Star, read/unread from the thread | Yes, through the More menu | — |
| Participant header | Yes | — |
| `+ Label` on a thread | **new** — Yes, with a working picker | — |
| Attachment chips, photo thread, PDF receipt, long HTML mail | Yes | — |
| Compose, reply, reply-all, forward | **new** — Yes, each correctly titled | — |
| Empty send | Better than the desktop: it explains | — |
| Undo window on send | **new** — a confirmation, but still no undo | — |
| Discard confirmation on an unsaved draft | Yes | — |
| Search operators, pairs, bare operators, no-match | Yes, all of them | — |
| Act on a search result | **new** — Yes, and the result list keeps its place | — |
| Return to a search after opening a result | No — the query and the results are cleared | 49 |
| Multi-select | Yes, through Edit | — |
| Bulk Archive · Later | Yes | — |
| Bulk Trash · Read · Unread | **new** — Yes | — |
| Bulk undo restores the batch | **new** — Yes, in order | — |
| Bulk toast names the count | **new** — Yes | — |
| Later presets, custom date, 30-day clamp | Yes, all three | — |
| Later disclosure copy | Yes, on the sheet | — |
| Later confirmation and undo | **new** — Yes, naming the wake time | — |
| Closing a conversation after acting on it | Only Archive from the top bar and the toolbar | 50 |
| Settings: Accounts, Appearance, About, Messages, Maru account | Yes | — |
| Settings: Agents, Google API, Sync | No | — |
| Command palette, shortcut sheet, approvals queue, sidebar toggle | No — desktop-shaped surfaces, not filed | — |
| Light and dark | Yes, on every new surface | — |
| Every `?sync=` failure kind | **new** — drawn, named, and it opens Settings | 51, 52 |
| Blocked-image notice and a per-message override | **new** — Yes | — |
| Empty search, inbox zero, empty Later | Yes, and the copy is good | — |
| Rapid double actions | Yes, and they hold | — |
| Unread state in the accessible name | **new** — Yes | — |
| Dynamic Type reflow | **new** — Yes everywhere except the sync message | 51 |

Every parity gap wave 1 filed is closed. The three that remain are new, and two
of them are behaviour inside surfaces that had no behaviour at all a day ago.

## What was not driven, and why

- **The native Liquid Glass tab bar, the badge, the scroll-minimize, and every
  haptic.** No Tauri bridge in a browser. Unchanged from wave 1.
- **Settings → Notifications, the push diagnostics row, the test-push control,
  and the one-per-install push-account sheet.** All gated on the push runtime
  reporting itself available. Still owed a simulator or device pass.
- **The Maru account sign-in, sign-up, recovery, device list and deletion.**
  Going further means creating an account and entering a password, which this
  lane does not do.
- **Gmail sign-in.** Demo mode makes it inert and says so on the row.
- **The label picker with no labels.** Both demo accounts have labels, so the
  sheet's own empty copy — "This account has no labels yet. Labels made in Gmail
  show up here." — cannot be reached from the fixtures. Read, not driven.
- **Real Dynamic Type.** Emulated by setting the document's root text size, which
  is where the phone reads the system body size from. Same method as wave 1.
- **Physical-device scroll physics, the real keyboard, and VoiceOver.** The
  keyboard was emulated as a 300 px viewport shrink and the accessible names were
  read through the browser's accessibility layer. Both still want a device.

## Not filed, deliberately

- **The four items the I2 device-QA lane left for an owner** — the duplicated
  action set in the thread's nav and toolbar, mail bodies not scaling with
  Dynamic Type, the virtualizer's estimate-versus-measurement drift, and the undo
  toast under the expanded glass bar. All seen again; none re-filed. Issue 50 is
  adjacent to the first of these but is about *behaviour*, not duplication: the
  same action does two different things depending on which of the three places
  you tap it.
- **Switching mailbox mid-selection discards the selection without saying so.**
  Defensible — the selected conversations are not in the new mailbox — and the
  bulk bar greys out honestly rather than offering an action it cannot perform.
- **A chain of four single archives leaves one Undo.** Each confirmation replaces
  the last, and the surviving Undo reverses the last action, which is what a
  confirmation-scoped undo means. Not a defect.
- **Move → Trash on a conversation already in Trash** says "Moved to trash".
  Covered by issue 48.
- **The unknown `?sync=` value** falls back to the "can't reach Google" message.
  A sensible default.

## Surprising

- **The fix lane closed every one of fourteen issues and opened a new surface
  under each.** Nothing regressed. Every new issue in this wave is in something
  that did not exist yesterday — which is the expected shape, and worth saying
  plainly: the phone's problem is no longer absence, it is that the new places
  do not all mean what they say.
- **The most dangerous new bug is a confirmation.** A message the app sent
  successfully produces a white card that covers the whole phone and swallows
  every tap for ten seconds. The action worked perfectly; only the sentence
  about it is catastrophic. It is the mirror of wave 1's issue 9, where the app
  had six carefully written sentences and drew none of them.
- **Sent and Trash are honest about everything except what they can do.** They
  list the right mail, they are named correctly, they scroll and select and dark
  mode correctly — and then Archive reports "Archived" and nothing moves.
  Starred, sitting between them in the same picker, gets it exactly right, which
  is what makes the other two readable as a defect rather than a decision.
- **Search is still the surface that carries the most and is trusted the least.**
  It now acts on results — the fix landed and it is good — but the one movement
  a person makes after finding something, opening it and coming back, throws the
  search away. Wave 1 filed the inbox version of that and it was fixed; the
  search version was never in scope and is now the most-felt bug in the app.
- **Nothing broke under speed.** Fifteen mailbox switches with no settle, three
  sends in a frame, three bulk archives in a frame, a double tap on a label — all
  of it holds. The faults in this wave are all faults of meaning, not of timing.
