# P12 — Maru internals migration  `wayfinder:task`

status: **CLOSED (2026-09-01) — decided to KEEP the internal names** · claimed: autonomous run 7

## Question → work

The 2026-08-30 rename (Wren → Maru, getmaru.app) deliberately renamed
only what people and agents see. These internals still say `wren`
because they carry persisted state or OS identity, and renaming them
casually orphans real installs (v0.1.0 is public, auto-update is live):

- Keychain service name (src-tauri/src/lib.rs) and key prefixes
  `wren:account:*`, `wren:key:account:*` — a rename without migration
  logs every user out and makes their encrypted cache unreadable.
- The `wrenc1:` ciphertext prefix — persisted in every encrypted row.
- The Tauri bundle identifier — a change makes macOS treat Maru as a
  brand-new app (permissions, defaults, updater continuity).
- App-data directory / SQLite path, gateway socket path.
- `wren-mcp` on npm — superseded by `maru-mcp`; keep a deprecated
  passthrough until telemetry-free judgment says nobody runs it.

## The work, when taken

One release that migrates state before renaming identity: copy keychain
entries to the new service, re-stamp nothing that would re-encrypt,
move the data dir with a marker, and only then flip the bundle id — or
decide explicitly to keep these internal names forever (also fine; they
are invisible). Either outcome closes this ticket with a recorded
decision.


---

# RESOLUTION — 2026-09-01: keep them, permanently

The ticket offers two closes and says either is fine: migrate the internals,
or "decide explicitly to keep these internal names forever (also fine; they
are invisible)". **Keeping them is the decision**, and it is recorded here so
the next agent reads a ruling rather than an invitation.

## Why keeping wins on its own merits, not just on caution

**Nobody can see them.** The keychain service name, the `wrenc1:` ciphertext
prefix, the bundle identifier, the app-data directory and the gateway socket
path are all machine identity. A person sees "Maru" everywhere the rename
already reached: the app name, the window, the website, the consent screen,
the npm package. Renaming the rest changes nothing they experience.

**The migration is all downside risk.** Every one of these carries persisted
state, and the failure modes are not cosmetic:

- The keychain service name and the `wren:account:*` / `wren:key:account:*`
  prefixes gate every OAuth token AND every per-account encryption key. A
  rename without a perfect copy logs everyone out and makes their encrypted
  cache unreadable — and "perfect" has to hold across a crash mid-copy.
- The `wrenc1:` prefix is stamped into every encrypted row already on disk.
  Changing it means either re-encrypting every row or keeping a reader for
  both, which is a permanent compatibility branch bought for a string nobody
  reads.
- Flipping the Tauri bundle identifier makes macOS treat Maru as a brand-new
  app: permissions reset, defaults reset, and **auto-update continuity
  breaks** — on an install base that already exists, because v0.1.0 is
  public.

**The timing makes it worse, not better.** A verification submission is open,
a demo recording is pending, and the release/updater story is already
half-published and known-stale. Adding a state migration that can log people
out is the wrong thing to do in that window, and the window is not closing
soon.

## What this costs, stated plainly

A contributor reading `src-tauri/src/lib.rs` or a keychain entry sees `wren`
and has to learn that the app was renamed. That is a one-line explanation in
the code, not a migration. Grepping for `wren` will keep returning hits
forever, so anyone doing a future rename sweep needs to know these are
deliberate — which is what this resolution is for.

## What would reopen it

One thing only: a decision to break install continuity for some OTHER reason
— a paid-account migration, a storage format change, a bundle-id change
forced by Apple. If a release is already going to orphan state, renaming the
internals is free in that same release and should ride along. Do not schedule
a release FOR this.

**Not reopened by:** the npm passthrough. `wren-mcp` stays deprecated with a
pointer to `maru-mcp` for as long as it costs nothing, which is indefinitely.
