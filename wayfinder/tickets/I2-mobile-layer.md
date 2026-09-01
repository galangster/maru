# I2 — The mobile layer  `wayfinder:task`

status: **in flight (lane C, 2026-09-01)** · map 5

`src/mobile/`: inbox (unified, lens, pull to refresh, swipe archive / Later,
long-press menu, multi-select, search with operators), thread (cards,
collapse, toolbar, edge-swipe back), compose sheet, Later sheet, settings
groups, empty state with the character, tab bar, a real navigation stack.
Safe areas, 44 pt targets, 16 px inputs, reduced motion, dark mode.
Acceptance: captures of six screens in both themes in
`wayfinder/captures/ios/`; one touch-driven path recorded; the map-5 feel
gates judged by the orchestrator from the captures and a hands-on run.
Post-lane: VoiceOver labels and Dynamic Type pass.

## Feel-gate verdict, 2026-09-01 (orchestrator, from the twelve captures)

**Pass. Tauri-iOS continues; no switch to React Native.** The inbox, thread,
compose and empty state read as an iPhone app in Apple's structure with
Maru's hue and character; the empty state's disc glow is the strongest
screen. FlowDeck drove open → reply → send → archive → refresh by touch on an
iPhone 16 simulator. One visible defect for the cleanup lane: the compose
To field clips the address under the Cc/Bcc control. Scroll physics,
edge-swipe and the keyboard still need a hands-on judgement on a physical
iPhone (queue, Q24).
