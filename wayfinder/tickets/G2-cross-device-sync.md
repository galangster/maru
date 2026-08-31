# G2 — Cross-device settings sync  `wayfinder:grilling`

status: REOPENED (owner ruling, 2026-08-31) · claimed: — · blocked by: one token decision

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


## Reopened — owner ruling, 2026-08-31

Nick: "yeah whatever we need to do to change what we have already,
that's what i want. a single unified sign in basically where i can
universally access my accounts on any device."

That settles the question grill 3 left open: option 3 (a hosted Maru
account) is the destination, and the no-servers line yields to it. It
is map 4's build and it stays sequenced after the Google submission.

### The one thing this ruling does NOT yet settle

Grill 3's hard constraints were: **tokens never leave the keychain,
mail never syncs, grants never sync.** "Universally access my accounts"
can mean either of two things, and they are very different products:

**(a) The account LIST syncs; each device still authorises.** You sign
into Maru on Windows, it already knows you have four Gmail accounts and
all your settings, and it walks you through one Google consent per
account. Friction: four clicks, once per device. Tokens stay in each
machine's keychain, the dossier's claims stand unchanged, and nothing
about the Google review posture moves.

**(b) The TOKENS sync too.** Sign in once, mail is simply there. This
means Maru's server holds — or brokers — credentials that grant
mailbox access. That is a different security posture, a different
liability, and it is very likely a different conversation with Google:
token handling and storage is exactly what OAuth verification scrutinises.
It also breaks the sentence the dossier currently makes.

**(a) gets most of the "magically, everything is there" feeling for
almost none of the risk** — the part that actually hurts today is
re-configuring settings, accounts and prefs, not clicking Allow once.
Recommend (a) for map 4, with (b) as an explicit later decision if the
one-consent-per-device step proves to be the thing people complain
about.

Owner gate: (a) or (b). Do not build until this is answered — it
determines whether the sync service ever touches a credential, which is
the difference between a settings service and a custodian.
