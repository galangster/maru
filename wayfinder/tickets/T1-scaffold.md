# T1 — Scaffold the app  `wayfinder:task` (AFK)

status: closed · claimed: fable-orchestrator · blocked by: —

## Resolution

Closed 2026-08-28, commit e918af0. Tauri CLI 2.11.4 / crate 2.11.5, React
19.2.8, Tailwind 4.3.3, Vite 8.2.2, TS 7.0.2, shadcn base-nova. All four
gates passed (typecheck, vite build, cargo build, tauri dev smoke). Rust
seams finished: sql/http/notification/opener plugins, keyring with native
OS stores, oauth_listen loopback command. Notable: port 5173 occupied by
another local project — engine lane moves Wren to 1420.

## Work

Create the Tauri 2 + Vite + React + Tailwind v4 + shadcn/ui skeleton in this
repo. Wire official plugins (sql, http, notification, opener), the keychain
command stub, icons, and dev/build scripts. Gate: `npm run build` passes,
`cargo build` passes, `tauri dev` opens a window with a styled shadcn
component.
