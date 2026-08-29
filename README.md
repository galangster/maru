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

## Agent gateway

Wren is also an MCP gateway to your own mail: agents connect through a local
socket, hold per-agent grants (read · draft · archive/label · scoped send),
and every send waits for your approval in Wren. Nothing an agent does is
invisible — every call, and every refusal, lands in an append-only audit log.

- **[docs/CONNECT-AN-AGENT.md](docs/CONNECT-AN-AGENT.md)** — connect Claude
  Code, Claude Desktop, or anything that speaks MCP over stdio.
- **[docs/TRIAGE-MORNING.md](docs/TRIAGE-MORNING.md)** — the first story to
  run: an agent triages your overnight inbox and you wake to a tidy inbox
  and a queue of drafts waiting on your tap.
- **[docs/PERMISSION-MODEL.md](docs/PERMISSION-MODEL.md)** — the model as a
  publishable spec, written for people building other agent gateways:
  identity, grants, the nine evaluation rules, the approval queue, and the
  audit contract.

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
- `src/core/agents/` + `src/core/gateway-server/` — the agent gateway:
  grants, approval queue, audit log, and the in-app MCP server behind
  `bin/wren-mcp.mjs` (stdio shim over a 0600 unix socket / named pipe).
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

## License

- **Code**: [AGPL-3.0-only](LICENSE). Run it anywhere, fork it, read every
  line — and if you build a service on it, your users get the same rights.
  Desktop use is unaffected by the AGPL's network clause.
- **The permission-model spec** ([docs/PERMISSION-MODEL.md](docs/PERMISSION-MODEL.md)):
  CC BY 4.0 — it exists to be borrowed by other agent gateways.
- **Bundled assets** keep their own licenses: fonts under the OFL and the
  Open Runde license (src/assets/fonts/), interface sounds CC0, the Anron
  icon glyphs by their author's permission (Nick's own library).
