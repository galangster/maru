# M1 — Trust model: grants, approval queue, audit log  `wayfinder:task`

status: closed · claimed: M1 lane, 2026-08-29 · blocked by: —

## Question → work

Design and build the earned-autonomy substrate before any agent connects:
per-agent capability grants (read/search, draft, archive/label, send —
scoped by recipient/domain where relevant), the approval queue (UI pane +
OS notification tap-to-approve), the audit timeline (every agent action,
per-agent page), grant/revoke UI in Settings. Store-backed, tested. The
MCP server (M2) consumes this; nothing agent-facing ships before it.

## Resolution

Shipped. Migration #2 appends four tables — `agents`, `grants`, `approvals`,
`audit_log` — and migration #1 is untouched. `src/core/agents/` holds the
substrate: a registry that issues a 32-byte credential once and stores only its
SHA-256 digest, a grant book whose pure `evaluate()` is the single authority on
"may this agent do this, to this recipient, now", an approval queue that submits
a pending id immediately and dispatches through `MailService.send` on approval,
and an append-only audit log capped at 500 rows per read. `AgentGateway`
composes the four and owns the clock, the ids and the event bus; its
`verifyCredential` / `authorize` / `requestSend` are the seam M2 connects to.

Two research facts from `docs/research/mcp-gateway-notes.md` are load-bearing
and are recorded at the code that depends on them. §2: `clientInfo` is
self-reported and unauthenticated, so a grant attaches to an `Agent.id` reached
only through a Wren-issued credential, never to a name a client claims. §4:
there is no deferred-approval primitive in MCP, so the queue is an app-level
pending-id composition and no tool call ever blocks on a human.

The rule set `evaluate()` enforces is written out in the file header and tested
one rule per test. The two that matter most: revocation wins backwards over
older grants of the same capability, and every recipient of a send — to, cc and
bcc — must be admitted by one single grant, so one stranger on the cc line
denies the whole message and two narrow grants never add up to a wide one.

UI: an approval-queue surface reached from a count badge that appears in the
sidebar footer only while something is pending, an audit timeline reachable
from the queue and from Settings with per-agent filter tabs, and a Settings →
Agents section carrying the create flow, the one-time credential, per-capability
toggles and the send-scope editor. Approving runs the real send and takes the
send celebration with it. Demo mode seeds Scout, two pending replies and a
two-day trail, so all of it is capturable and reviewable before any agent
exists.

Contract: `src/core/types.ts` is unchanged. `AgentEvent` is its own additive
union on the gateway's own bus rather than new `MailEvent` variants — the
gateway holds a MailService, so making MailService emit agent events would have
inverted that. `src/core/index.ts` gained `createAgentGateway` and re-exports
`htmlToText`.

Gates: typecheck clean · 310 tests green (259 + 51 new) · build clean · all 13
captures produce, including `m1-11-approvals-light`, `m1-12-agents-settings-light`
and `m1-13-audit-dark`.

Follow-on for M2: `AgentGateway.authorize` is written to be safe if the
connection discipline slips — an unknown id denies, and a revoked agent denies
whatever its grant rows say — but the socket must still resolve the token once
per connection and never trust a client-supplied agent id.
