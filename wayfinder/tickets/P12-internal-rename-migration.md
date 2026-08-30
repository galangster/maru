# P12 — Maru internals migration  `wayfinder:task`

status: open · claimed: — · blocked by: nothing urgent; do deliberately

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
