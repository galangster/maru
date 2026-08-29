# Wayfinder map 2 — Agentic gateway  `wayfinder:map`

Tracker: local-markdown fallback. Tickets in [tickets/](tickets/), prefixed
`G` (grilling/HITL), `M` (task), `R2-` (research). Charted 2026-08-29 in a
live grilling session with Nick; the MVP map (map.md) closed with its
destination reached.

## Destination

Wren becomes the open-source, local-first **agent gateway to your own
email** — MCP-native, earned-autonomy trust model — built first for people
who already run agents. "Defacto" through openness: the permission/audit
model becomes the reference for how agents touch a person's mailbox.

## Notes

- Ratified in-session (Nick, 2026-08-29, two grill rounds, all
  recommendations accepted): agent-gateway thesis over send-API /
  AI-features / agent-mailboxes; first users = agent-runners; earned
  autonomy (read default, drafts free, send behind approval queue,
  per-agent grants, full audit); open source.
- Architecture: MCP server lives **inside the running Wren app** (thin
  stdio shim); one process owns the store; approvals and audit are UI.
- v1 tool surface (~8, send-gated): list_accounts, search_mail,
  read_thread, get_attachment, draft_new/draft_reply, request_send,
  archive/label (grant-gated), list_pending.
- Gmail-only until the thesis is proven; OS coverage already Win/Mac/Linux.
- First slice = the **triage morning**: agent reads overnight mail,
  archives noise under grant, drafts real replies into the approval
  queue; the human opens Wren to a tidy inbox. One filmable story.
- Execution override from the MVP map does NOT carry over: this map is
  plan-first; a session claims one ticket at a time.

## Decisions so far

- Rounds 1–2 (above) — recorded in this map's Notes; ticket-level detail
  lands as tickets close.

## Not yet specified

- The permission-grant data model's exact shape (per-agent × capability ×
  scope: recipient/domain/label) — sharpens in M1.
- Standing-permission UX ("always allow X for this agent") and revocation.
- The spec document that makes "defacto" claimable (publishable permission
  + audit model) — graduates after M4 proves the model.
- Outlook (Graph) and IMAP providers behind the provider seam.
- Agent identity: how a connecting MCP client names itself trustworthily.
- Windows/Linux hand-verification of the gateway era.

## Out of scope

- Send-API infrastructure (Resend territory) — different business.
- Cloud-proxied AI features; anything requiring Wren servers.
- Agent-owned mailboxes / a2a email — revisit only with a redrawn
  destination.
- Teams/multiplayer before single-player agent trust is proven.
