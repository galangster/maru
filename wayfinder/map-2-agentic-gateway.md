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

- Rounds 1–2 (above) — the live grilling with Nick, all recommendations
  accepted.
- [R2a MCP practices](tickets/R2a-mcp-practices.md): unix socket 0600, no
  loopback; approval = app-level pending-id; clientInfo display-only.
- [R2b landscape](tickets/R2b-competitive-scan.md): the gap is the
  *assembled* system, not approval gates alone; multi-provider roadmap is
  table stakes; CASA claim needs legal read before public use.
- [M1 trust substrate](tickets/M1-trust-model.md): shipped — migration #2,
  credential-hashed agents, the nine-rule evaluate() (rule 9: one grant must
  admit every recipient), approval queue + audit timeline + Agents settings.
- [M2 gateway](tickets/M2-mcp-server.md): shipped — Rust frame relay
  (0600 socket / named pipe via interprocess), TS session manager + SDK
  server over RelayTransport, `bin/wren-mcp.mjs` shim; live handshake smoke.
- [M3 tool surface](tickets/M3-tool-surface.md): shipped — eleven tools,
  one authorize-and-audit path, size discipline to the frame-cap level;
  live smoke walked search→read→draft→request_send→approve→sent.
- Audit cycle 2 (docs/design/UI-REVIEW-2026-08-29.md): B+ on the new
  surfaces, 2 blocking + 11 should-fix — all fixed same night, including
  approval-focus/announcement, the credential moment, and `w` ("waiting on
  you") as the queue's keyboard entry.
- [M4 triage morning](tickets/M4-triage-morning.md): shipped — the whole
  morning as a live test over the real socket + shim (survey, archive,
  star, two queued replies, the out-of-scope refusal, approvals, tidy
  inbox, trail asserted row by row), docs/TRIAGE-MORNING.md playbook with
  the paste-ready prompt and filming runbook, the recorded demo of the
  human half (docs/captures/triage-morning-demo.webm), and the gateway
  surfaced in the README. Graduates the spec fog item as
  [M5](tickets/M5-permission-spec.md). The live split-screen film with a
  real Claude stays an owner gate — it needs Nick at the keyboard.

## Not yet specified

- The permission-grant data model's exact shape (per-agent × capability ×
  scope: recipient/domain/label) — sharpens in M1.
- Standing-permission UX ("always allow X for this agent") and revocation.
- ~~The spec document that makes "defacto" claimable~~ — graduated to
  [M5](tickets/M5-permission-spec.md) by M4's close.
- Outlook (Graph) and IMAP providers behind the provider seam.
- Agent identity: how a connecting MCP client names itself trustworthily.
- Windows/Linux hand-verification of the gateway era.

## Out of scope

- Send-API infrastructure (Resend territory) — different business.
- Cloud-proxied AI features; anything requiring Wren servers.
- Agent-owned mailboxes / a2a email — revisit only with a redrawn
  destination.
- Teams/multiplayer before single-player agent trust is proven.
