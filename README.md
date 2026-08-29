# Wren

A lightweight, beautiful unified-Gmail desktop client. One quiet inbox for
all your Gmail accounts — local-first, no third-party servers, no
subscription. Windows-first, runs on macOS too.

Built with Tauri 2 + React 19 + TypeScript + Tailwind v4 + shadcn/ui.
Typeset in Open Runde and DM Sans. ~10 MB core, talks only to Google.

## Features (MVP)

- Multi-account Gmail via OAuth (your own Google Cloud client — see below)
- Unified inbox, Starred / Sent / Trash, per-account views and labels
- 90-day local sync with incremental history polling; offline reading
- Sandboxed HTML rendering, remote images blocked by default
- Compose / reply / reply-all / forward with rich text and attachments
- Command palette (⌘/Ctrl K), full keyboard control, local full-text search
- Light/dark, OS notifications, demo mode with fixture data

## Run it

```bash
npm install
npm run tauri dev        # native app
npm run dev              # browser demo at http://localhost:1420/?demo=1
```

First run opens onboarding: explore the demo instantly, or connect Gmail —
that requires a free Google Cloud OAuth client (one 5-minute setup):
**[docs/SETUP-GOOGLE-OAUTH.md](docs/SETUP-GOOGLE-OAUTH.md)**.

## Build

```bash
npm run tauri build      # bundles for the current OS
```

Windows installers (NSIS + MSI) build in CI: `.github/workflows/`
`windows-build.yml` (run it via workflow_dispatch or a `v*` tag once the
repo has a GitHub remote).

## Architecture

Everything is TypeScript in the webview; Rust is confined to official
plugins and ~80 lines of commands (keychain, OAuth loopback).

- `src/core/` — domain + engine: typed Gmail REST client (batched,
  quota-aware), OAuth PKCE, SQLite store, 90-day/incremental sync,
  MiniSearch index, MIME builder. UI-independent; 218 vitest tests.
- `src/core/types.ts` — the contract. The UI consumes `MailService` only;
  `service/real.ts` (Gmail) and `service/demo.ts` (fixtures) implement it.
- `src/platform/` — the native seam (`Platform`): SQLite, native fetch,
  keychain, loopback listener, notifications.
- `src/features/` — the app: shell, list, reading pane, composer, palette,
  settings, onboarding, keyboard.
- `docs/design/DIRECTION.md` — the visual system (tokens in
  `src/styles/tokens.css`). `docs/PRD.md`, `docs/DECISIONS.md`,
  `wayfinder/` — product spec, decision log, build map.

Icons route through `src/components/ui/icon.tsx` (lucide today, Anron
swap-ready). Fonts are bundled in `src/assets/fonts/` under their licenses
(OFL / Open Runde license).
