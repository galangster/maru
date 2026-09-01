# A2 — The Maru account in the desktop app  `wayfinder:task`

status: **in flight (lane B, 2026-09-01)** · map 4 · spec §3, §4, §6, §7, §12, §13

`src/core/account/` (Argon2id via hash-wasm, HKDF and AES-GCM via WebCrypto,
BIP39 recovery, typed client, vault build/merge/apply, sync loop) and
Settings → Maru account (sign up, forced recovery ceremony, devices,
entitlement and Subscribe, history restore, change password, delete).
Desktop-family credentials file without a consent screen on a second Mac.

Acceptance: the test list in the lane brief; demo-mode walkthrough; existing
638 tests still pass. Build log lands in G2-cross-device-sync.md.
