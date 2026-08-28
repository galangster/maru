# Prior art — open-source mail clients (2024-2026 era)

Researched 2026-08-28, verified against GitHub API metadata and project docs.

## Mail-0/Zero

- Repo: https://github.com/Mail-0/Zero
- License: MIT
- Stack: Next.js + React + TypeScript + TailwindCSS + shadcn/ui (frontend); Node.js +
  Drizzle ORM + PostgreSQL (backend); Better Auth with Google OAuth. Talks to the
  Gmail API directly (also Outlook).
- Alive/dead: **alive but chaotic.** 10.8k stars, 17 open PRs. However, the default
  branch (`staging`) hasn't been committed to since 2025-08-31 (a year stale), and
  `main` last moved 2026-05-26 (~3 months stale as of today). Meanwhile dozens of
  dated feature branches (`07-28-...`, `08-12-...`, `08-21-...`) show work continuing
  outside the default branches — i.e. active development, poor branch/release hygiene.
- Lesson worth stealing: it's the closest thing to a real reference implementation of
  **Gmail API + shadcn/ui + Google OAuth** in the open — its setup docs spell out the
  exact Cloud Console scope/redirect-URI configuration needed, which is a useful
  checklist even where the code itself isn't reusable.

## Mailspring

- Repo: https://github.com/Foundry376/Mailspring
- License: GPL-3.0
- Stack: Electron + React + TypeScript UI (plugin architecture) on top of a **separate
  local sync engine written in C++/C** (`Mailspring-Sync`, built on Mailcore2) that
  runs as a spawned local process and talks IMAP/SMTP; not a Gmail-API-first client.
- Alive/dead: **alive.** Pushed today (2026-08-28), 17.7k stars, healthy issue
  turnover. Fork of the older, dead Nylas Mail (N1) by one of its original authors.
- Lesson worth stealing: **separating the sync engine from the UI process** as its own
  long-running local service (SQLite-backed) is the pattern to imitate — it survives
  UI reloads/crashes, and keeps heavy MIME/IMAP work off the Electron renderer/main
  thread. For a Gmail-API-only client this maps to: run the sync loop (history.list
  polling, batch fetch, local cache writes) as an isolated process or worker, not
  inline in the main Electron process.

## Thunderbird

- Repo: https://github.com/thunderbird/thunderbird-desktop (official desktop repo,
  mirrored from Mozilla's internal `comm-central`/`comm-unified` trees)
- License: MPL-2.0
- Stack: C++/XUL-descended Mozilla toolkit (Gecko-based), not a web-stack app at all.
- Alive/dead: **alive**, actively pushed (today), backed by MZLA/Mozilla, huge
  install base.
- Lesson worth stealing: **account-type abstraction.** Thunderbird's IMAP/POP/Gmail
  handling is unified behind one account model with provider-specific auth plugged in
  underneath (XOAUTH2 for Gmail) — a clean reference for how to keep "Gmail" from
  leaking into every layer of a sync/store design, useful even though the actual
  codebase (C++/Gecko) is not reusable for an Electron+React app.

## Betterbird

- Repo: https://github.com/Betterbird/thunderbird-patches (this repo holds the *patch
  set*, not a standalone codebase — Betterbird applies these on top of Mozilla's
  Thunderbird source and ships its own builds from betterbird.eu)
- License: MPL-2.0 (Mozilla-derived); patches repo itself lists `NOASSERTION` via
  GitHub's license detector but is MPL-licensed per the FAQ.
- Stack: same as Thunderbird (C++/Gecko) — a soft fork, closely tracking Thunderbird
  ESR, maintained by former Thunderbird peer Jorg K.
- Alive/dead: **alive**, pushed today (2026-08-28), active patch cadence.
- Lesson worth stealing: **soft-fork-via-patchset is a legitimate distribution model**
  when you want to stay close to upstream instead of diverging — not directly
  applicable to a from-scratch Electron client, but worth knowing as a pattern if Wren
  ever needs to track a fast-moving upstream (e.g. Gmail API changes) without
  forking outright.

## Geary

- Repo: https://gitlab.gnome.org/GNOME/geary (GNOME's GitLab, not GitHub)
- License: LGPL-2.1
- Stack: Vala + GTK (WebKitGTK for message rendering), Linux/GNOME-only.
- Alive/dead: **maintained but slow-moving.** Latest stable release 46.0 (May 2024);
  current work is a GTK4 migration. Not dead, but not a fast-moving project either.
- Lesson worth stealing: Geary **delegates all OAuth entirely to the OS account
  manager** (GNOME Online Accounts) rather than embedding its own OAuth client — the
  app never sees a client secret or handles the token dance itself. Good illustration
  of "push auth out of the app" as a design option, though not directly portable to a
  cross-platform Electron app (no GOA equivalent on macOS/Windows).

## Delta Chat Desktop

- Repo: https://github.com/deltachat/deltachat-desktop
- License: GPL-3.0
- Stack: Electron + React/TypeScript UI, backed by a **Rust core** (`deltachat-core-rust`,
  via napi-rs bindings) that does IMAP/SMTP/crypto and local storage. Not Gmail-API-
  specific — it's an email-as-transport chat client (Autocrypt/e2ee focus), but the
  architecture is close to what a modern Electron mail client looks like.
- Alive/dead: **alive**, pushed today (2026-08-28), 1.6k stars, steady activity.
- Lesson worth stealing: the **Electron+React UI / Rust-core split with a typed
  bindings boundary** is the cleanest modern example of "native performance core,
  web-stack UI" among these six — worth studying for how they keep the Rust core's
  state machine (sync status, message store) as the single source of truth that the
  UI subscribes to, rather than letting UI state and sync state drift apart.

---

## Fork-base verdict

**None of the six is a viable fork base for an Electron + React + shadcn desktop
Gmail client — greenfield is the right call.** Reasoning, three lines:

1. Thunderbird, Betterbird, and Geary are wrong-stack entirely (C++/Gecko or
   Vala/GTK) — adopting any of them means abandoning Electron+React+shadcn, not
   forking into it.
2. Mailspring is the closest architecturally (Electron+React) but its GPL-3.0
   license, plugin-architecture overhead, and IMAP-first (not Gmail-API-first) sync
   engine in C++ would need to be gutted and rebuilt anyway — cheaper to start clean
   and borrow only the process-separation pattern.
3. Mail-0/Zero is stack-matched (Next.js/React/shadcn/Gmail API) and MIT-licensed,
   which makes it the *most* tempting fork target on paper, but its own repo hygiene
   (stale default branches, chaotic branch sprawl, no evident release process) and
   Next.js-server-first architecture (not a desktop/Electron app — it's a hosted web
   app with a Postgres backend) mean forking it would mean fighting its assumptions
   more than reusing them; treat its setup docs and OAuth config as reference, not its
   code as a base.
