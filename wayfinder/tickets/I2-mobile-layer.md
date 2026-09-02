# I2 — The mobile layer  `wayfinder:task`

status: **complete (I2 polish, 2026-09-01)** · map 5

`src/mobile/`: inbox (unified, lens, pull to refresh, swipe archive / Later,
long-press menu, multi-select, search with operators), thread (cards,
collapse, toolbar, edge-swipe back), compose sheet, Later sheet, settings
groups, empty state with the character, tab bar, a real navigation stack.
Safe areas, 44 pt targets, 16 px inputs, reduced motion, dark mode.
Acceptance: captures of six screens in both themes in
`wayfinder/captures/ios/`; one touch-driven path recorded; the map-5 feel
gates judged by the orchestrator from the captures and a hands-on run.
Post-lane: VoiceOver labels and Dynamic Type pass.

## I2 polish complete, 2026-09-01

Recipient chips now parse names and addresses, support removal, paste, keyboard commit, validation, and correspondent suggestions.
Cc and Bcc remain collapsed until used.
Phone controls now expose accessible names and state.
Modal sheets trap focus and restore it after close.
Sent, Archived, and sync state use live regions.
Mobile type derives from the iOS body size.
The inbox virtualizer measures grown rows.
XXXL captures prove the inbox, thread, compose sheet, tab bar, and toolbar without clipping.

## Feel-gate verdict, 2026-09-01 (orchestrator, from the twelve captures)

**Pass. Tauri-iOS continues; no switch to React Native.** The inbox, thread,
compose and empty state read as an iPhone app in Apple's structure with
Maru's hue and character; the empty state's disc glow is the strongest
screen. FlowDeck drove open → reply → send → archive → refresh by touch on an
iPhone 16 simulator. One visible defect for the cleanup lane: the compose
To field clips the address under the Cc/Bcc control. Scroll physics,
edge-swipe and the keyboard still need a hands-on judgement on a physical
iPhone (queue, Q24).

## Merged to main 2026-09-01 (`50b1887`)

Split into screens, sheets, components and two gesture hooks; the reducer is
the navigation's source of truth; virtualized inbox; tokens instead of
re-declared values; desktop helpers reused (message frame, compose actions,
Later disclosure, operators, conversation expansion, motion mode, undo).
Phone entry chunk 583 KB → 191 KB. FlowDeck re-proved the touch path; the
twelve captures are current. 644 tests. Polish left for I2's next pass:
recipient chips in compose (the To value truncates without an ellipsis),
VoiceOver labels, Dynamic Type.

## Device QA 2026-09-02

Nick installed 0.1.8 from TestFlight on a physical iPhone: "incredibly buggy.
Swiping doesn't work to archive or save for later (like Spark). Visually it's
all weird and I see random focus boxes, some elements are inconsistent with
others. I could barely archive anything." He had also never signed in to the
Maru account on that phone, so push never registered.

Four parts, on branch `lane/device-qa`. Everything below was reproduced and
then re-proved on an iPhone 16 simulator, iOS 26.5, driven by injected touch
paths rather than a mouse — a mouse never reproduces any of part 1.

### Part 1 — swipe actions (`78cc1b1`)

The report was accurate and the cause was one line of specificity. A thread row
is a `<button>`, so `.mobile-app button { touch-action: manipulation }` (0,1,1)
outranked `.mobile-thread-row { touch-action: pan-y }` (0,1,0). The row's
`pan-y` never applied on the phone at all. `manipulation` permits the browser
to pan in both axes, so WKWebView handed every horizontal drag to its own
scroll view and cancelled the pointer mid-swipe.

This was invisible in the `?mobile=1` preview, where nothing competes for a
horizontal drag, and it only became reachable when the document became the
scroller in I8 lane 2.

Three further faults, all of them per-caller decisions that now live in
`usePointerDrag`:

- The axis was re-decided on every `pointermove`. It is now locked once, at
  `AXIS_LOCK_THRESHOLD` (10pt, UIKit's own pan threshold), and never revisited.
  `resolveDragAxis` is the pure rule, unit-tested in `tests/mobile-state.test.ts`.
- `pointercancel` was an alias for `pointerup`, so a gesture WebKit took away
  could still commit an archive. It springs back now.
- The edge back tested no axis, so a scroll starting near the left edge dragged
  the whole screen sideways.

The pointer is captured at the lock rather than at `pointerdown`. Added the
haptic tap at the swipe threshold, on the way out only.

Measured on the simulator: swipe right archives, swipe left opens Later, a
vertical drag scrolls and fires nothing, a 45pt drag springs back. The
simulator log shows `impact light` at the threshold crossing and `impact
medium` on the commit. Captures: `swipe-archive-mid-light.png` and
`swipe-archive-result-light.png`, mid and settled frames of one gesture.

### Part 2 — focus boxes (`5c66f04`)

"Random" was the tell. The shell's rings were already scoped to
`:focus-visible`, so the gesture was not deciding them — the element type was.
WKWebView resolves `:focus-visible` from the element as well as the
interaction, so a tapped `<select>` or text field matches it, and focus handed
back to an opener when a sheet closes inherits the match from whatever held it
before.

`use-input-modality.ts` now writes `data-input-modality` on the root from the
last real input, and every ring in the shell hangs off
`[data-input-modality='keyboard']`. Keyboard access is unchanged: a key press
lands before the focus it moves. Also added `-webkit-touch-callout: none`, so
the iOS copy callout stops fighting the 480ms long press.

Captures: `focus-after-tap-row-light.png` (the Sounds toggle, whose ring rule
outranked every suppressor) and `focus-after-tap-button-light.png`.

### Part 3 — consistency (`465c4b5`)

Six screens at the default and the accessibility XXL text sizes. "Visually
it's all weird" was a small number of faults repeated everywhere:

- **The button reset outranked every component rule.** `.mobile-app button` is
  (0,1,1) and every single-class component rule is (0,1,0), so the shell
  ignored what its own components asked for. The account screen's primary
  action drew as near-black body text on the coral fill — wrong colour and a
  contrast failure — while its two-class `.is-destructive` sibling looked
  right. `.mobile-nav-text` lost its accent colour, its 600 weight and its
  size, so Edit, Cancel, Send and every back control were wrong throughout.
  Now `:where(.mobile-app) :where(button)`.
- **`box-shadow` cannot draw one edge.** `inset 54px 1px 0` under settings rows
  and `inset 16px -1px 0` under composer fields flood that many pixels of the
  box with the colour. That was a grey slab down the icon column of every
  settings row but the first, and a grey band down the whole left of the
  composer. Both are background-image hairlines now.
- **Dynamic Type.** At accessibility XXL the composer header overflowed rather
  than squeezed — "New Message" printed across Cancel and pushed Send off the
  screen. The label column was a fixed 54px so "From" printed over its value.
  The account lens capped at a fixed 170px, hard-clipping "All inboxes" to
  "All inb" with no ellipsis, its chevron pinned at 18px.
- Edit mode's toolbar is a second bar; the list now gives back a second bar's
  worth of room. Later's "Pick a date" gets the chevron and press feedback the
  three presets have.

Judged fine: 44pt targets throughout, the radius and elevation system, the tab
bar and safe-area insets after document scrolling, empty and loading states,
sheet transitions, and the thread list's deliberate lack of row separators.

### Part 4 — push needs a Maru account (`this commit`)

A phone with mail and no Maru account can never receive a notification, because
the relay that wakes the device is reached through that account. Nothing on the
phone said so.

- One sheet, once per install: "Want new-mail alerts on this iPhone? Sign in to
  your Maru account", with a button to the account screen and "Not now".
  `usePushAccountNudge` derives the moment from state — push available, mail
  present, no Maru account, not yet asked — rather than firing off the sign-in
  call, so it also catches a phone that arrives there by a route nobody has
  written yet. It waits for the inbox at rest.
- Settings → Notifications states the requirement as the row's own detail text,
  "Sign in to your Maru account to turn this on", with the toggle disabled
  until then. The footnote under the group is gone.
- The account screen's back control was hardcoded to "Settings" and now names
  the screen underneath, because the offer reaches it from the inbox.

Captures: `push-account-offer-light.png`, `settings-light.png`,
`account-signed-out-light.png`.

### Gates

`npm run typecheck && npm test && npm run build` pass — 767 tests, five new
over the axis lock. No Rust or Swift changed.

### Owed

- `/simplify` did not run as its own pass. A lane delegate may not spawn the
  two review agents it needs, so the orchestrating session owns it over this
  lane's diff.
- Two findings left for an owner rather than changed unilaterally. The thread
  screen offers archive, Later and more in *both* the top nav and the bottom
  toolbar — a duplicated action set, which is a product decision. And a mail
  body does not scale with Dynamic Type, because it is author HTML; Apple Mail
  makes the same choice, so this may be correct as it stands.
- The virtualizer's estimate-versus-measurement drift, already carried forward
  from I8 lane 4, is much more visible under Dynamic Type: changing the text
  size leaves rows briefly overlapping until the next scroll re-measures them.
  Closing it still means anchoring the restore on an item index rather than a
  pixel offset.
- The undo toast clears the *minimized* Liquid Glass tab bar but not the
  expanded one. `--mobile-toast-offset` is derived from
  `--maru-native-tab-inset`, the plugin's published measurement of the glass,
  and that measurement does not appear to be re-published when UIKit expands
  the bar again — so an archive performed just after a tab change draws the bar
  over "Archived" and half of "Undo". Left alone deliberately: the fix belongs
  to the plugin's measurement (I8), and guessing a larger constant on the web
  side would lift the toast off the bar in the minimized state, which is the
  state it is usually in.
- Nothing here has been re-proved on Nick's physical iPhone. The simulator
  reproduces the touch handling faithfully, but the scroll physics and the
  keyboard still want a hands-on pass.
