# I1 — The iOS target  `wayfinder:task`

status: **in flight (lane C, 2026-09-01)** · map 5

rustup and the `aarch64-apple-ios` / `-sim` targets; `tauri.ios.conf.json`
with `app.getmaru.ios` and iOS 17; `tauri ios init` committed; an iOS
capability; `VITE_MARU_DEMO=1` to force demo mode at build time; the app
boots on an iPhone 16 simulator. `docs/IOS.md` documents the toolchain.

## Merged to main 2026-09-01 (`50b1887`)

Lane C (`5f1dd2d`, `b238fc0`, `15219bd`, `072a0ed`) plus C2/C3 (`9830045`).
rustup and both iOS targets installed; `tauri.ios.conf.json` carries
`app.getmaru.ios`; `src-tauri/gen/apple` committed; iOS capability file;
an iOS build forces demo mode until I3. Two pre-existing Rust defects fixed on
the way: `mobile_entry_point` sat on the macOS-only helper, and the updater's
Rustls had no crypto provider on iOS. Desktop-only plugins, the gateway and
`oauth_listen` are now `cfg(desktop)`. Toolchain in `docs/IOS.md`.
