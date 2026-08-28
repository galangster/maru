# Wayfinder map — Wren MVP  `wayfinder:map`

Tracker: local-markdown fallback (no external tracker configured). Tickets
live in [tickets/](tickets/), named `T<n>-<slug>.md`. A ticket is claimed by
its `claimed:` field, closed by `status: closed` plus a Resolution section.

## Destination

A sealed Wren MVP: Spark-like unified multi-account Gmail client — Tauri 2 +
React + shadcn/ui — verified running on macOS with screenshots, Windows
installer produced by CI workflow, real Gmail sign-in ready behind a BYO
OAuth client, full demo mode, docs and handoff committed.

## Notes

- **Execution override (Nick, 2026-08-28):** zero-touch autonomous one-shot;
  execution is carried into this map. Grilling-type decisions are
  self-resolved and logged in [DECISIONS.md](../docs/DECISIONS.md) for async
  review. Nick: "i'll let you decide autonomously for every decision to make
  here on out."
- **Hard constraint (Nick):** no MetaDAO styling — Wren is a separate
  product with its own Spark-inspired design language.
- Skills per phase: tdd (engine) · design-foundations, interface-craft,
  animations, better-writing (polish, invoked inside the polish lane) ·
  simplify (seal, run by orchestrator).
- Delegation per [SOP.md](../docs/SOP.md): sequential single-writer lanes,
  Opus floor for component-writing lanes, compact evidence returns.

## Decisions so far

- [Grill rounds 1–3](../docs/DECISIONS.md): runtime, frontend, auth path,
  sync scope, storage, threading, composer, cut lines — all pre-map, logged.
- [Round 4 — Nick's live answers](../docs/DECISIONS.md): Tauri 2 over
  Electron ("faster, lighter, more optimized, more futureproof"); React +
  canonical shadcn confirmed; BYO OAuth client; autonomous execution; no
  MetaDAO styling.
- [Gmail API research](../docs/research/gmail-api-notes.md): scopes =
  gmail.modify + gmail.send only; 2026-05 quota model forces batched,
  metadata-first sync; historyId expiry is routine (full-window resync path);
  loopback+PKCE confirmed. Prior art says greenfield, no fork
  ([prior-art.md](../docs/research/prior-art.md)).

## Not yet specified

- Exact motion spec for composer/palette (decided in polish lane against
  the built shell).
- Windows CI runner verification depth (workflow ships; first real run needs
  a GitHub remote, which is Nick's call).
- Post-MVP auth hardening: production-status flip guidance vs weekly re-auth.

## Out of scope

- Snooze, send-later, templates, signatures, smart-inbox categorization, AI
  features, IMAP/other providers, multi-select, Gmail drafts sync, calendar,
  >90-day backfill — ruled out in [Q17](../docs/DECISIONS.md); returns only
  with a redrawn destination.
