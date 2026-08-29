# G2 — Cross-device settings sync  `wayfinder:grilling`

status: closed (grill 3) · claimed: — · blocked by: —

## The ask

Nick, 2026-08-29: "sync accounts with the least amount of friction as
possible across devices. i login to my Wren account on one device that has
all my settings and stored things, and then i can login on another device
and everything is there, magically."

## Why this is a grilling ticket, not a task

The ask as phrased — *a Wren account you log into* — collides with two
ratified positions: README's "local-first, no third-party servers" and map
2's out-of-scope line "anything requiring Wren servers." Agent credentials
and grants are also part of "settings" now, and syncing a trust store is a
security decision, not a convenience one. The destination may well be
right; the mechanism needs Nick's eyes on the trade before anyone builds.

Options to grill through, roughly cheapest-first:

1. **Settings export/import** — a signed file (or QR handoff) carrying
   settings, theme, keybindings, per-view prefs. No servers, no account.
   Least magic, least friction *at setup time only*.
2. **Syncthing-style user-owned transport** — sync a settings document via
   the user's own Drive/iCloud/file sync. Local-first preserved; "log in"
   becomes "point both devices at the same folder." Gmail account OAuth
   still happens per device (tokens must not leave the keychain).
3. **A Wren sync service** — the ask taken literally. Real accounts, real
   servers, real liability (and the open-source story changes: who runs
   it?). Would need its own map; explicitly out of scope today.

Hard constraints whatever wins: OAuth tokens and agent credentials stay in
the OS keychain and never sync; mail itself never syncs (each device
resyncs from Gmail); agent grants sync only with an explicit, per-device
consent step — a grant is a trust decision made on one machine.

Owner gates: which option; whether "Wren account" is worth reopening the
no-servers line; where agent grants sit.

## Resolution (grill 3, 2026-08-29)

Both, in sequence — and the collision with the no-servers line resolved
by making the server the business: option 1 (settings export/import)
ships free in map 3 as ticket P5; option 3 (a hosted Wren sync service)
is the ratified subscription spine and map 4's product build. The hard
constraints stand verbatim: tokens and credentials never leave the
keychain, grants never sync, mail never syncs. Option 2 (user-owned
transport) dies — it is the worst of both without the business.
