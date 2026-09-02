# Phone QA — wave 3

Lane: `lane/mobile-qa-3`, sitting on `main` at `afd81a5` — which carries the
fixes for wave 2's issues 47–53 and the desktop undo-depth stack the phone
shares. Build: Maru 0.1.9, demo mode, Vite dev server on port 2099, headless
Chromium through Playwright. One viewport: 393×852 at `deviceScaleFactor: 3`,
`isMobile`, `hasTouch`, iPhone user agent. Gestures were injected as touch —
`Input.dispatchTouchEvent` sequences for swipes, long presses, sheet drags and
the edge back — never as a mouse. Evidence:
`wayfinder/captures/qa-mobile-3/` (66 PNG, 393 px wide, palette-encoded).

Same seam as waves 1 and 2: `?mobile=1&demo=1` with an iPhone user agent, so
the platform also resolves to iOS. There is no Tauri bridge in a browser, so
the native Liquid Glass tab bar, the push plugin and the haptics are still
absent, and every surface gated on push being available is still unreachable.
The two Tauri bridge probes that cannot resolve in a browser still throw on
load and are still set aside.

## Part A — regression on issues 47 to 53

Six of the seven hold. One is half fixed and has been reopened for the half
that is not. A verification comment naming the capture is on each issue.

| # | Priority | Title | Verdict | Capture |
|---|---|---|---|---|
| 47 | P1 | A long subject makes the sent confirmation cover the whole screen | **Fixed** — a 5,000-character subject sends a 92 px confirmation at the bottom of the screen that shortens the subject, and the compose control behind it is still tappable | `a47-long-subject-toast.png` |
| 48 | P2 | Archiving and saving for later in Sent and Trash say they worked and do nothing | **Fixed** — Sent offers Star, Mark unread and Move and nothing else, on the swipe, in the long-press sheet and in the bulk bar; Trash's right swipe really restores to the inbox | `a48-sent-swipe-right.png`, `a48-trash-swipe-right.png` |
| 49 | P2 | Coming back from a search result empties the search | **Fixed** — the query and the results survive a conversation round trip and a tab change | `a49-search-after-back.png` |
| 50 | P2 | Putting a conversation away from inside it leaves you still reading it | **Fixed** — all five routes close the conversation: Save for later in the top bar, Later in the toolbar, and Archive, Later and Move to Trash in the More menu | `a50-after-later.png` |
| 51 | P2 | At the largest text size the mail-stopped message cuts off the account it names | **Fixed** — both addresses wrap inside the screen, nothing scrolls sideways, and the message keeps to 341 px | `a51-sync-signedout-xxxl.png` |
| 52 | P3 | The phone says mail has stopped arriving on this Mac | **Fixed** — all six messages say "on this phone" or name no device | `a52-sync-noclient.png` |
| 53 | P3 | Sheets cannot be dragged closed and the back gesture only works on some of them | **Half fixed — reopened.** The grab handle now closes all five bottom sheets, and a drag short of the threshold springs back. The back gesture still does nothing on Mailboxes and on Save for later | `a53-mailboxes-after-drag.png`, `n53-edgeback-mailboxes-mid-drag.png` |

### Why 53 is only half closed

The drag is right. On Mailboxes, Save for later, the long-press actions, Labels
and Move, a downward drag from the handle follows the finger and closes the
sheet past 96 px; a 40 px or 90 px drag springs back to rest; and a drag that
starts inside the list scrolls instead of dismissing.

The back gesture is not. On the Mailboxes sheet the sheet never moves: the
gesture receives one movement and is then cancelled by the browser's own
scroller, because nothing on the sheet layer claims the horizontal axis. It
looks as though it works on Labels, Move and the actions sheet, but those three
are short — a finger at the left edge lands on the dimmed area above them and
it is the tap that closes them, not the gesture. Started at the same height on
the sheet itself, the gesture does nothing on those three either.

## Part A2 — the wave-2 list, 8 to 21, re-run at speed

Nothing the wave-2 fixes touched has broken.

| # | Title | Verdict | Capture |
|---|---|---|---|
| 8 | Undoing a bulk archive brings back only one conversation | **Holds** — "3 conversations archived", Undo returns all three in order | `c08-bulk-undo.png` |
| 9 | Mail stops arriving and the phone never says so | **Holds** — all six failure kinds draw their own message, and it opens Settings | `c09-sync-opens-settings.png` |
| 10 | Coming back from a conversation loses your place | **Holds** — 1,200 px restored exactly | — |
| 11 | The forward screen is titled "Reply" | **Holds** — Reply / Reply all / Forward each name themselves | `c11-forward-title.png` |
| 12 | Blocked images are never mentioned | **Holds** — the notice and a working Show control | `c12-blocked-images.png` |
| 13 | There is no way to see what you saved for later | **Holds** — Later is a mailbox and each row reads "Back tomorrow, 9:00" | `c13-later-populated.png` |
| 14 | At the largest text size the compose screen cannot be read | **Holds** — Cancel, Send and the recipient row all on screen, nothing sideways | `c14-xxxl-compose.png` |
| 15 | Search results cannot be archived, saved for later, or starred | **Holds** — the swipe archives for real, the star is there, the long press opens the actions sheet | `c15-search-actions.png` |
| 16 | Saving for later gives no confirmation and no undo | **Holds** — "1 conversation saved for tomorrow, 9:00" with Undo | `c16-later-toast.png` |
| 17 | A screen reader cannot tell which mail is unread | **Holds** — rows announce unread, starred and the message count | — |
| 18 | The phone stays in selection mode over an empty inbox | **Holds** — Select All → Archive ends selection mode over "All caught up" | `c18-empty-after-select-all.png` |
| 19 | Sending gives no confirmation on screen | **Holds** — a "Sent" confirmation naming the subject | `a47-long-subject-toast.png` |
| 20 | At the largest text size the sender is cut to three characters | **Holds** — the sender takes 318 px of the 393 px row and ellipsises | `c20-xxxl-inbox.png` |
| 21 | There is no way to see sent mail on the phone | **Holds** — Starred, Sent, Trash, Later and five label mailboxes | `c13-later-view.png` |

## Part B — the new surfaces under hostile use

### What was driven

- **Undo depth.** Three archives in a row, then three undos. Six archives in a
  row, then every Undo that could be reached. Undo tapped on an entry that is
  not the newest. Bulk archive of three, then undo of the batch.
- **Every sheet's drag and edge back, with partial drags.** 40 px and 90 px
  downward drags under the 96 px threshold; a 54 px edge drag under the 72 px
  threshold; a drag started inside the sheet's own list; mid-drag transform
  read on the element rather than inferred from the frame.
- **Mailboxes → Trash → restore → undo**, checked for effect in both
  directions and for the restored row's position.
- **The label picker**, added and removed, with the sheet re-read across both.
- **Search → act → back → act again**, and the same result acted on twice.
- **Rapid taps.** Three on Send in the same second, three on Archive from
  inside a conversation, twelve on the tab bar with no settle.
- **A 5,000-character subject** in compose, in the confirmation, in the Sent
  row and on the conversation screen.
- **The largest accessibility text size** on the sync message, the mailbox
  sheet, the label sheet, the Later sheet, Sent and Later.
- **Dark mode** on the same six surfaces.
- **Accessible names** on every control of the same six surfaces, read through
  the browser's accessibility tree rather than off the markup.
- **The keyboard**, emulated as a 300 px viewport shrink, in compose and in
  search.
- **Console errors** on every path above.

### What held up

- **No console errors and no unhandled exceptions on any path**, once the two
  Tauri bridge probes are set aside.
- **Three archives, three undos.** All three offers can be tapped and all
  three conversations come back, each to its own place.
- **Partial drags are right.** 40 px and 90 px both spring back to
  `translate3d(0px, 0px, 0px)`, and a drag that starts on the sheet's list
  scrolls it instead of dismissing.
- **Trash restores and un-restores cleanly.** A right swipe takes the
  conversation out of Trash, and Undo puts it back in its original position.
- **The label picker is correct.** A label toggles on, the sheet re-reads it,
  and it toggles off again.
- **Search survives being used.** Act, open a result, come back, act again —
  the query and the results are all still there, and both conversations really
  leave the inbox.
- **Every rapid double action holds.** Three taps on Send produce one message,
  three on Archive produce one archive and no stale conversation, twelve on
  the tab bar leave exactly one screen.
- **A 5,000-character subject breaks only the conversation title.** Compose
  does not scroll sideways, the Sent row stays 80 px, and the confirmation is
  one line.
- **Dynamic Type is clean on every new surface.** At the largest accessibility
  size the sync message, the mailbox sheet, the label sheet, the Later sheet,
  Sent and Later all fit, with nothing cut and no sideways scroll.
- **Dark mode is right on all six**, sheets and mailboxes alike.
- **Every control on all six surfaces has an accessible name** — 94 controls,
  none unnamed.
- **The keyboard is handled.** At a 552 px viewport compose keeps Cancel, Send
  and the recipient row on screen, and search keeps its 16 px field and its
  results.

## Issues filed

| # | Priority | Title | URL |
|---|---|---|---|
| 62 | P2 | A conversation with a very long subject buries its messages seven screens down | https://github.com/galangster/maru/issues/62 |
| 63 | P3 | In Sent, a screen reader is told to swipe to archive and save for later, and neither does anything | https://github.com/galangster/maru/issues/63 |
| 64 | P3 | An archived search result stays in the results and can be archived again | https://github.com/galangster/maru/issues/64 |
| 65 | P3 | After a run of archives, only the newest Undo can be reached and one conversation is lost | https://github.com/galangster/maru/issues/65 |

Plus issue 53, reopened for the back gesture.

One P2, three P3, one reopen. No P1.

## Parity against the desktop wave

Rows that moved since wave 2 are marked **new**.

| Desktop feature | On the phone | Issue |
|---|---|---|
| Unified inbox | Yes | — |
| Per-account mailboxes | Yes, in the Mailboxes picker | — |
| Starred view | Yes, with the full action set | — |
| Sent view | **new** — Yes, and it now offers only what it can do | — |
| Trash view | **new** — Yes, and restore really restores | — |
| Later view | Yes, with the wake time on each row | — |
| Per-account label views | Yes, all five | — |
| Open a thread, expand messages | Yes, per message | — |
| Expand all / collapse all | Yes | — |
| Star, read/unread from the thread | Yes, through the More menu | — |
| Participant header | Yes | — |
| `+ Label` on a thread | Yes, and the toggle is correct both ways | — |
| Attachment chips, photo thread, PDF receipt, long HTML mail | Yes | — |
| Compose, reply, reply-all, forward | Yes, each correctly titled | — |
| A very long subject on the conversation screen | **new** — No — the whole subject prints as the title | 62 |
| Empty send | Better than the desktop: it explains | — |
| Undo window on send | A confirmation, but still no undo | — |
| Discard confirmation on an unsaved draft | Yes | — |
| Search operators, pairs, bare operators, no-match | Yes, all of them | — |
| Act on a search result | Yes, and it really acts | — |
| Return to a search after opening a result | **new** — Yes, query and results both kept | — |
| A search result that has been acted on | **new** — No — it stays in the list unmarked and can be acted on again | 64 |
| Multi-select | Yes, through Edit | — |
| Bulk Archive · Later · Trash · Read · Unread | Yes, and correctly greyed out per mailbox | — |
| Bulk undo restores the batch | Yes, in order | — |
| Bulk toast names the count | Yes | — |
| Ten-deep undo stack | **new** — the stack is shared, but only the newest offer can be tapped | 65 |
| Later presets, custom date, 30-day clamp | Yes, all three | — |
| Later confirmation and undo | Yes, naming the wake time | — |
| Closing a conversation after acting on it | **new** — Yes, on all five routes | — |
| Settings: Accounts, Appearance, About, Messages, Maru account | Yes | — |
| Settings: Agents, Google API, Sync | No | — |
| Command palette, shortcut sheet, approvals queue, sidebar toggle | No — desktop-shaped surfaces, not filed | — |
| Light and dark | Yes, on every new surface | — |
| Every `?sync=` failure kind | Yes, drawn, correctly named for a phone, and it opens Settings | — |
| Blocked-image notice and a per-message override | Yes | — |
| Empty search, inbox zero, empty Later | Yes, and the copy is good | — |
| Rapid double actions | Yes, and they hold | — |
| Unread state in the accessible name | Yes | — |
| Gesture help announced to a screen reader | **new** — No — Sent and Later announce swipes they do not have | 63 |
| Dynamic Type reflow | **new** — Yes, on every new surface including the sync message | — |
| Drag a sheet closed | **new** — Yes, on all five | — |
| Back gesture out of a sheet | No — nothing on Mailboxes or Save for later | 53 |

Every parity gap wave 2 filed is closed except the sheet back gesture. The four
that remain are new, and three of the four are about what a surface *says*
rather than what it does.

## What was not driven, and why

- **The native Liquid Glass tab bar, the badge, the scroll-minimize, and every
  haptic.** No Tauri bridge in a browser. Unchanged from waves 1 and 2.
- **Settings → Notifications, the push diagnostics row, the test-push control,
  and the one-per-install push-account sheet.** All gated on the push runtime
  reporting itself available. Still owed a simulator or device pass.
- **The Maru account sign-in, sign-up, recovery, device list and deletion.**
  Going further means creating an account and entering a password, which this
  lane does not do.
- **Gmail sign-in.** Demo mode makes it inert and says so on the row.
- **A global undo on the phone.** There is none, so the brief's "a fourth says
  Nothing to undo" cannot be reached: the confirmations are the only door onto
  the stack. That is issue 65.
- **Real Dynamic Type.** Emulated by setting the document's root text size to
  53 px, which is where the phone reads the system body size from. Same method
  as waves 1 and 2.
- **Physical-device scroll physics, the real keyboard, and VoiceOver.** The
  keyboard was emulated as a 300 px viewport shrink and the accessible names
  were read through the browser's accessibility tree. Both still want a device.

## Not filed, deliberately

- **The four items the I2 device-QA lane left for an owner** — the duplicated
  action set in the thread's nav and toolbar, mail bodies not scaling with
  Dynamic Type, the virtualizer's estimate-versus-measurement drift, and the
  undo toast under the expanded glass bar. All seen again; none re-filed.
- **Adding or removing a label gives no confirmation and no undo.** The sheet
  is still open, the toggle shows its own state, and tapping again reverses it
  exactly. There is nothing an undo would add.
- **The bulk bar greys out Archive and Later in Sent rather than hiding them.**
  Honest, and consistent with the greyed Later and Trash in the Trash mailbox.
- **A conversation archived from a search result is announced as archived even
  though the row stays.** Covered by issue 64.

## Surprising

- **The fix lane closed six of seven and left the seventh's better half
  undone.** The drag-to-dismiss in issue 53 is the harder gesture and it is
  right — it locks an axis, springs back under the threshold, and refuses to
  fight the sheet's own scroll. The back gesture, which is the same hook with
  a different axis, never runs at all, because nothing tells the browser to
  stop panning. It is the same root cause as the swipe-to-archive bug the
  device-QA lane fixed in June: a `touch-action` that was never claimed.
- **The three sheets that seemed to answer the back gesture never did.** They
  are short, so the finger lands on the dimmed area and the tap closes them.
  Wave 2 read that as "the gesture works on some sheets"; it works on none.
  The fix made the tall sheets no worse and the short ones no better.
- **Every fault in this wave is a fault of meaning again, and now three of
  four are things the app says.** Sent tells a screen reader to use two
  gestures it has just correctly removed. A search result says it was archived
  and then offers to archive it again. A conversation says its own name for
  six thousand pixels. Nothing miscounts, nothing loses mail, nothing breaks
  under speed.
- **The undo stack got deeper and no more reachable.** The phone now shares a
  ten-entry stack with the desktop and has exactly one door onto it — the front
  confirmation — so a six-archive burst loses one conversation to the ten-second
  window while its offer is still behind the others. The depth is real; the
  reach is not.
- **Dynamic Type, dark mode and accessible names came back completely clean.**
  Six surfaces, 94 named controls, nothing cut at the largest accessibility
  size, nothing pale in dark mode. That part of the phone is finished work.
