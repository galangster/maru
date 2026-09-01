# Wayfinder map 5 — Maru for iPhone  `wayfinder:map`

Charted 2026-09-01 from grill 4 ([GRILL-4-AGENDA.md](GRILL-4-AGENDA.md)).
Tickets prefixed `I`. Runs in parallel with map 4; depends on it for sign-in
and push.

## Destination

**A Maru on the iPhone that people keep: read, triage, reply, compose, and a
buzz when mail lands. It feels like an iPhone app and looks like Maru.**
iPhone only, iOS 17+, Tauri with a purpose-built mobile layer, bundle id
`app.getmaru.ios`.

## Tickets

- [I1 iOS target](tickets/I1-ios-target.md) — rustup, targets, `tauri ios
  init`, per-platform config, capability. **Lane C, in flight.**
- [I2 mobile layer](tickets/I2-mobile-layer.md) — inbox, thread, compose,
  Later, settings, empty state, tab bar, navigation stack, swipe, safe
  areas, VoiceOver and Dynamic Type. **Lane C, in flight** (demo mode).
- [I3 Gmail sign-in on iOS](tickets/I3-ios-oauth.md) — the iOS OAuth client,
  ASWebAuthenticationSession via a Tauri plugin, the `ios` credential
  family, directed consent from the vault's address list.
- [I4 push](tickets/I4-push.md) — APNs registration, `users.watch` renewal,
  keychain accessibility, silent-push fetch.
- [I5 Maru account on the phone](tickets/I5-account-on-phone.md) — sign in,
  restore, "Manage on getmaru.app".
- [I6 TestFlight and App Store](tickets/I6-store.md) — review account,
  privacy labels, export compliance, screenshots, the listing.
- [I7 approvals on the phone](tickets/I7-approvals.md) — the first
  post-launch feature: approve an agent's drafts from the phone.

## Feel gates — switch to React Native if any fails in I2's spike

Scroll physics on a 3,000-row list; interactive edge-swipe back; the
keyboard and the compose sheet; text selection in a message; the tap-to-open
latency on a thread. Captures in `wayfinder/captures/ios/`.

## Out of scope

iPad, Android, the agent gateway on the phone, widgets, Share extension.
