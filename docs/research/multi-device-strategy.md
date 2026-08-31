# Multi-device Maru: sync and iOS

Written 2026-08-31 (autonomous run 5), answering Nick's ask: "we should
have the syncing between devices, right? an iOS app as well? I want
something that I can truly use across all of my devices." Grounded in
what is already ratified; nothing here reopens a closed decision.

## What is already decided

- **Hosted sync IS the plan — and the business.** Grill 3 ratified the
  Obsidian-Sync shape: Maru stays free and AGPL, the subscription spine
  is hosted sync, and it is *map 4's* product. Map 3 ships zero servers
  on purpose — the first server Maru ever runs is the one people pay
  for. So "we should have syncing, right?" — yes, and it is literally
  the revenue model, not a feature bolted on.
- **G2's constraints stand whatever the mechanism**: OAuth tokens and
  agent credentials live in the OS keychain and never sync; mail itself
  never syncs (each device resyncs from Gmail — Gmail *is* the mail
  sync layer); agent grants cross devices only with an explicit
  per-device consent step.
- **Map 3 ends at the verification submission + strangers installing.**
  Multi-device is the next mountain, not this one.

## What actually needs to sync

Gmail already syncs the mail. The Maru-specific state worth carrying
across devices is small and well-shaped for a sync document:

| State | Sync? | Notes |
| --- | --- | --- |
| Accounts list (addresses only) | yes | Each device still OAuths itself |
| Settings, theme, keybindings | yes | Tiny JSON |
| Per-view prefs, list sort/filter | yes | Already store-shaped |
| Labels-as-hues, sender hues | derived | Hash of the address — free |
| Read/starred/archived | no | Gmail state; synced by Gmail |
| OAuth tokens | never | Keychain, per device |
| Agent grants + audit log | consent-gated | A grant is a per-machine trust decision; the AUDIT log is worth syncing read-only |

That table is the honest scope of "Maru sync v1": a settings document
measured in kilobytes, end-to-end encrypted, with the audit log as the
one growing append-only stream. No mail bytes ever touch Maru servers —
which keeps the Google verification story clean (the dossier's "all
Gmail data stays on this device" claim survives, because sync carries
Maru state, not Gmail data).

## iOS

An iOS Maru is the strongest argument FOR the hosted service, because a
serverless iOS mail client is structurally hobbled:

- iOS kills background processes: no polling loop, so **new-mail push
  needs a server** holding a Gmail watch (users.watch → Cloud Pub/Sub →
  APNs). That server is map 4's server.
- Tauri 2 builds iOS, but the app is a WebView shell; the honest iOS
  play is either Tauri-iOS reusing the whole React front end (cheapest,
  one codebase) or SwiftUI reusing nothing (best-feel, a separate
  product). Recommend **Tauri-iOS first** — the UI is already
  container-query responsive (this session made the panes' narrow ends
  real), the engine is TypeScript, and the delta is: touch pass,
  navigation-stack layout for one-pane width, keychain + SQLite plugins
  already have iOS support in the Tauri ecosystem.
- The Gmail OAuth client for iOS is a second client id in the same
  project (iOS type), same consent screen — the current verification
  submission covers the scopes, not the platforms, so iOS does not
  reopen the review from scratch.
- Rough sequencing cost: a usable read-and-triage iOS beta is a
  map-sized effort (think map 5), not a lane.

## Recommended sequence (for Nick to ratify)

1. **Map 3 finishes first** — verification submitted, strangers
   installing. Multi-device work before that dilutes the one thing that
   matters now.
2. **Map 4 = the sync service**: E2E-encrypted settings+audit document
   sync, paid, with the server also carrying the Gmail watch → push
   relay (built once, used by desktop for instant new-mail and by iOS
   later). Stack suggestion when it opens: the smallest possible
   surface — one Rust service, Postgres, client-held keys.
3. **Map 5 = iOS via Tauri**, riding map 4's push relay, one-pane
   responsive layout, second OAuth client id.
4. Meanwhile the P5 settings-export file (already shipped) is the
   zero-server stopgap: export on one machine, import on the other.

Queue items this creates for Nick: ratify the sequence (or reorder);
decide whether the map-4 grill happens before or after Google's review
verdict lands.
