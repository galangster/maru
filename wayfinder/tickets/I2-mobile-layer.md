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
