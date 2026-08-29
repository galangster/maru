# P9 — Gateway CI matrix  `wayfinder:task`  *(cuttable)*

status: closed · claimed: autonomous run, 2026-08-29 · blocked by: —

Windows named-pipe and Linux socket verification in CI: cargo tests for
src-tauri/src/gateway.rs on windows-latest + ubuntu-latest, and the
Node-side suites on both. Does not retire the hand-smoke owner gate; it
shrinks what the hands must check.

## Resolution

`.github/workflows/gateway-ci.yml`: the full Node suite (typecheck + 427
tests) on ubuntu-latest **and** windows-latest, plus `cargo test` for the
Rust relay on Linux with the Tauri system deps (Windows already compiles
it in windows-build.yml). The two unix-socket live suites self-skip on
win32 with the reason written at the `describe` — on Windows the app's
real channel is the named pipe through the Rust relay, which is exactly
what CI cannot converse with; the hand-smoke owner gate stays for that.
Triggered on push/PR/dispatch; the first run (33276597213) came back
**green on all three jobs** — the suite's first-ever Windows pass, and the
relay's first Linux compile+test.
