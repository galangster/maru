# Wren — PRD (MVP)

A lightweight, beautiful unified-Gmail desktop client. Spark-inspired,
Windows-first, built with Electron + React + shadcn/ui. One inbox for all
your Gmail accounts, local-first and fast.

## Users and job

One person with 2–5 Gmail accounts who wants a single, fast, quiet inbox on
Windows without a subscription, an account system, or their mail routed
through a third-party server. Wren talks only to Google.

## MVP scope

| In | Out (post-MVP) |
| --- | --- |
| Multi-account Gmail sign-in (OAuth loopback + PKCE, BYO client ID) | Non-Gmail providers (IMAP) |
| Unified inbox + per-account views; Starred, Sent, Trash, Later, per-label views | Smart-inbox categorization, send-later, cross-device snooze |
| 90-day local sync, incremental history polling, offline reading | Full-history backfill, Gmail push (Pub/Sub) |
| Thread view: sanitized HTML, inline images, attachment download | Drafts sync to Gmail (local drafts only) |
| Actions: archive, trash, star, read/unread | Multi-select bulk actions |
| Compose / reply / reply-all / forward with rich text + attachments | Signatures, templates, AI anything |
| Local full-text search (FTS5) | Remote Gmail search fallback |
| Command palette + Gmail-style keyboard shortcuts | Custom keybindings |
| OS notifications for new mail | Notification rules |
| Demo mode (fixtures; zero-setup evaluation) | |
| Light/dark theme, Windows-controls-overlay titlebar | |

## UX spec

- **Layout.** Three panes: sidebar (240 px, collapsible) · thread list
  (~380 px) · reading pane. Resizable via drag handles. Below ~900 px the
  reading pane overlays.
- **Sidebar.** Unified section (Inbox with unread count, Starred, Sent,
  Trash), then one section per account (color-dotted, its own inbox +
  labels), then Settings. Compose button pinned on top.
- **Thread list.** Date-grouped (Today / Yesterday / This week / earlier),
  rows with initials-avatar, sender, subject + snippet, time, account dot,
  star; unread = weight + dot, never a colored left sliver (Nick's rule).
  Hover reveals quick actions (archive, trash, read, star). Virtualized.
- **Reading pane.** Thread header (subject, participants, labels), message
  cards collapsed except the last, HTML in a sandboxed iframe, blocked
  remote-image banner with "Show images", attachment chips, inline
  reply/reply-all/forward bar.
- **Composer.** Docked bottom-right sheet (Spark-style), To/Cc/Bcc chips
  with account picker for From, Tiptap rich text, attachment picker,
  ⌘/Ctrl+Enter to send.
- **Onboarding.** Welcome → "Connect Google account" (walks through client-ID
  setup with a link to docs) → or "Explore with demo data" in one click.
- **Command palette.** ⌘/Ctrl+K: navigation, actions on selection, search.

## Design language

Cloud-soft modern SaaS (references: Family, Phantom, Aave, Umbra — see
docs/design/DIRECTION.md). Open Runde (Medium/Semibold) for UI chrome and
headings; DM Sans (Regular/Medium) for body and lists; at most five sizes.
Soft rounded geometry on a 4 px spacing grid — spacing and alignment are an
explicit review gate. Liquid-glass treatment on floating surfaces only
(palette, composer, overlays) with solid list rows for scroll performance;
hairline borders and washes for emphasis (no left accent slivers); full
dark mode; motion restrained and physical, `prefers-reduced-motion`
respected. All icons route through one `Icon` component (Anron target;
lucide interim, tuned to match). No MetaDAO styling.

## Non-functional

- Cold start < 1.5 s to interactive inbox (from local DB, sync in background).
- 60 fps list scrolling at 5k threads (virtualized).
- Idle memory target < 150 MB (Tauri/WebView2).
- Gmail quota discipline: batched fetches (≤50/batch), metadata-first
  hydration, lazy full bodies (2026-05 quota model: 6,000 units/min/user,
  messages.get = 20 units).
- Security: contextIsolation, sanitized HTML in sandboxed iframes, remote
  images loaded by default with a Settings switch to block them and a
  declared-size drop for tracking pixels either way, tokens via safeStorage,
  no telemetry, no Maru servers. With images on — the default — a message's
  pictures are fetched from the sender's host; blocking them restores
  Google as the only network peer.

## Architecture (summary)

Tauri 2 shell; the entire app core is TypeScript running in the webview:
Gmail REST client (via the native tauri http plugin — no CORS exposure),
sync engine, OAuth PKCE logic, and view state. Native seams are official
Tauri plugins (sql/SQLite, notification, opener) plus a tiny Rust keychain
command for token storage and a loopback listener for the OAuth redirect.
A `platform/` seam (tauri | demo) lets the UI run in a plain browser on
fixture data for development and screenshot verification. Search is a local
in-memory index (MiniSearch) rebuilt from SQLite at startup — no FTS5
native dependency. Windows packaging (NSIS/MSI) via tauri-action in GitHub
Actions; macOS build used for local verification.

## Phases and gates

1. **Scaffold** — electron-vite + Tailwind + shadcn boot; gate: dev app
   launches.
2. **Engine** — OAuth, sync, store, IPC; gate: vitest suite green
   (threading, sync reducer, MIME build against fixtures).
3. **Shell** — three-pane UI on demo data; gate: typecheck + screenshot
   review.
4. **Features** — composer, palette, settings, onboarding, notifications;
   gate: scripted Playwright smoke + screenshots.
5. **Polish** — design-review pass (design-foundations / interface-craft),
   motion pass (animations), copy pass; gate: before/after screenshots.
6. **Seal** — simplify pass, README + setup guide + CI workflow, handoff.
