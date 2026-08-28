# Decision log — grill rounds (self-interrogation)

Nick invoked `/grill-me` and simultaneously requested zero-touch autonomy. The
grilling skill's design tree was therefore run as a self-interrogation on
2026-08-28: every frontier question is recorded here with the recommended
answer auto-adopted. Any decision can be overturned; each entry names the
cost of reversal. ⚠ marks decisions that deviate from standing doctrine or
carry real residual risk — read those first.

## Round 1 — roots

**Q1 — Runtime: Electron or Tauri?**
Adopted: **Electron** (electron-vite, TypeScript everywhere).
Why: the sync engine, OAuth loopback server, SQLite, and MIME building all
live in Node where the ecosystem is deepest; Tauri would put them in Rust or
behind plugin seams — each one a one-shot failure point. Windows WebView2
variance is avoided; Spark and Mailspring themselves ship on this stack.
Cost: heavier install/RAM than Tauri. Reversal: the renderer is plain web
code and the engine is behind a typed IPC contract, so a Tauri port swaps the
shell, not the app. Revisit post-MVP if "lightweight" must mean binary size.

**Q2 — ⚠ Frontend: React + shadcn/ui, or Svelte + shadcn-svelte?**
Adopted: **React + shadcn/ui**.
This deviates from the runtime-efficiency contract §10 ("Svelte is the
production frontend direction"). Justification: (a) Nick's explicit
instruction this session names shadcn as the component library, and canonical
shadcn is React; (b) the design/motion skills requested for the polish phase
(interface-craft, motion-react, component-design) are React-based; (c)
one-shot reliability — the React ports of every needed primitive (virtual
list, resizable panes, command palette) are first-party. Overturn path: §10
was ratified in the MetaDAO design-system context; if Nick extends it here,
the UI layer sits alone in `src/renderer` against the IPC contract.

**Q3 — Gmail access: Gmail REST API, IMAP, or a bundled OAuth client?**
Adopted: **Gmail REST API + OAuth 2.0 loopback/PKCE + bring-your-own client
ID**. No credentials ship in the repo; a 5-minute setup doc covers creating
the Google Cloud OAuth client. A first-class **demo mode** (fixture data)
makes the app fully evaluable with zero setup.
Why: REST gives threads, labels, history-based incremental sync, and parsed
MIME for free; IMAP+app-passwords is clunkier and weaker. Bundling a shared
client ID is a security smell and needs Google verification we can't do.
Cost: Nick performs the OAuth dance himself (Claude must never enter
credentials). Reversal: the provider is behind an interface; IMAP can be
added as a second provider later.

**Q4 — Product shape?**
Adopted: Spark-style three-pane app — sidebar (unified + per-account
folders), thread list, reading pane — unified inbox as the home view.

## Round 2 — engine and data

**Q5 — Sync scope:** initial backfill = all threads from the last **90 days**
per account (`newer_than:90d`), then incremental `history.list` polling every
60 s + manual refresh; full window resync when the stored historyId is
rejected. No Gmail push (needs Pub/Sub infrastructure). "Load older" is
post-MVP.

**Q6 — Storage:** SQLite via better-sqlite3 in the main process, FTS5 for
search, schema behind a small store interface (fallback seam if native
rebuild ever breaks a platform).

**Q7 — ⚠ OAuth scopes:** `gmail.modify` + `gmail.send` + `userinfo.email`.
gmail.modify is a *restricted* scope: with a BYO client in Testing status,
Google expires refresh tokens after ~7 days (re-auth weekly). Mitigation
documented in setup guide; research pass verifies current policy. Accepted
for MVP — personal-use apps live with this.

**Q8 — Send pipeline:** build RFC 822 text (small hand-rolled/`mimetext`
builder), base64url → `messages.send` with `threadId` + In-Reply-To /
References for replies. No SMTP.

**Q9 — Threading:** Gmail's native `threadId`. No JWZ algorithm.

**Q10 — Search:** local FTS5 (subject, sender, body text) for MVP; remote
Gmail query fallback post-MVP.

**Q11 — Composer:** Tiptap StarterKit (bold/italic/lists/links) in a
Spark-style docked sheet; To/Cc/Bcc chips; attachments on send and receive.

**Q12 — Name:** **Wren** — small, light, fast bird; working title, trivially
changeable (one constant + package fields).

## Round 3 — platform, safety, cut lines

**Q13 — ⚠ Windows-first, built on macOS:** custom titlebar via Windows
titleBarOverlay (window-controls overlay), Segoe-safe font stack under Inter,
NSIS installer through electron-builder, and a GitHub Actions workflow that
produces the Windows build. Residual risk: no Windows machine in this
session, so the Windows binary is CI-verified, not hand-verified. macOS build
is what gets visually verified here (also satisfies the later Mac port).

**Q14 — Security posture:** contextIsolation on, nodeIntegration off, typed
preload bridge only; message HTML sanitized with DOMPurify and rendered in a
sandboxed iframe; remote images blocked by default with per-message allow;
tokens encrypted at rest via Electron safeStorage (DPAPI on Windows,
Keychain on macOS); no telemetry.

**Q15 — Demo mode:** `--demo` flag and an onboarding button seed two fixture
accounts with realistic threads. All screenshots and UI verification run in
demo mode.

**Q16 — Keyboard + notifications:** Gmail-style keys (j/k, e archive,
# trash, s star, r reply, c compose, / search, u toggle read, ⌘/Ctrl+K
palette, ⌘/Ctrl+Enter send); OS notifications for new mail.

**Q17 — Out of scope for MVP:** snooze, send-later, templates, signatures,
smart-inbox categorization, AI features, IMAP/other providers, multi-select,
Gmail drafts sync (local draft persistence only), calendar, unified
"load older than 90d".

**Q18 — Build SOP:** sequential single-writer lanes (scaffold → engine →
shell → features → polish), Opus-floor agents for component-writing lanes,
one verification gate per boundary, simplify pass before seal. Detail in
[SOP.md](SOP.md).

## Round 4 — Nick's live answers (2026-08-28) + research corrections

Nick installed `mattpocock-skills` mid-run and answered one frontier round
directly. His rulings supersede the matching Round 1 entries:

**Q1→ Frontend:** React + canonical shadcn/ui stands (his delegation), with a
new hard constraint: **no MetaDAO styling** — "this is a totally separate
product." Wren's design language is its own, Spark-inspired.

**Q2→ ⚠ Runtime: Tauri 2, superseding Electron.** Nick: "do whichever is
faster, lighter, more optimized, more futureproof" — that is Tauri on every
axis (~10 MB core, WebView2, no bundled Chromium). One-shot de-risking: the
entire app core (Gmail client, sync engine, OAuth logic) is TypeScript in
the webview, unit-testable in Node; Rust is confined to official plugins
(sql, notification, opener, http) + a ~40-line keychain command + the OAuth
loopback listener. Native HTTP plugin carries all Google calls (no CORS
exposure). Search drops FTS5 for an in-memory MiniSearch index (no native
seam). Fallback if the Rust toolchain blocks: Electron, per Round 1.

**Q3→** BYO OAuth client confirmed as recommended.

**Q4→** Autonomous one-shot confirmed; wayfinder map carries the execution
override in its Notes. Nick: "i'll let you decide autonomously for every
decision to make here on out."

**Research corrections adopted** (see docs/research/gmail-api-notes.md):
scopes reduced to `gmail.modify` + `gmail.send`; sync engine designed for
the 2026-05 quota model (6,000 units/min/user, messages.get = 20 units →
batched ≤50, metadata-first, lazy body hydration); historyId expiry treated
as routine with a cheap full-window resync path; replies carry References/
In-Reply-To headers *and* threadId.

**Toolchain note:** system Rust was 1.72 (Homebrew, 2023) — upgraded via
`brew upgrade rust` to meet Tauri 2's minimum.

Frontier empty. Tree closed 2026-08-28.
