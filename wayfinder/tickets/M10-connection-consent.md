# M10 — First-connection consent  `wayfinder:task`

status: closed (notice tier) · claimed: M10 lane, 2026-08-29 · blocked by: —

## Question → work

The fog item the map has carried since R2a: a "Claude Code wants to
connect to Wren" moment. Today, registering the shim *is* the consent
step — the same posture as every stdio MCP server — and the credential
ceremony already puts a human in the loop at creation. What a
first-connection prompt adds is consent at *use*, which catches the one
attack the ceremony misses: a copied credential connecting from somewhere
the human never set up.

Two designs, and the choice is Nick's before anyone builds:

1. **Notice (recommended).** First connection of each agent raises an OS
   notification and an unmissable audit row ("Scout connected for the
   first time · clientInfo: claude-code 1.x"), plus a badge state in
   Settings → Agents until seen. Non-blocking: the trust model already
   fails safe (a fresh agent holds nothing; revocation bites next call).
   Cheap, no protocol changes, ships in a day.
2. **Gate.** The first `auth` frame for an agent parks the connection
   (the relay's `authResult` is already async, so the mechanics exist)
   until the human approves in Wren; a timeout refuses. Real consent, but
   it adds a blocking human step to every new-agent setup — against the
   grain of "registering the shim is consent" — and needs spec §3.4 and
   CONNECT-AN-AGENT rewritten, a queue-like surface, and offline
   semantics (approve while away?).

Recommendation: ship 1 now; hold 2 until a real-world credential-theft
story justifies the friction. Either way the spec gains a §3.5 naming the
first-connection event as auditable.

## Resolution

Option 1 shipped, under Nick's "keep going" directive and this ticket's own
recommendation. `AgentGateway.noteConnection` owns the story: a connection
with no prior `connected` row in the agent's recent history writes
“connected for the first time.” and emits `agentFirstConnected`, which the
app turns into an OS notification (“Its credential is now in use. Review
what it holds in Settings → Agents.”). The look-back is bounded by the
audit read cap and errs noisy, never silent. Spec gained §3.5; the
CONNECT-AN-AGENT caveat was rewritten from "no consent screen yet" to the
notice as it now exists. Tests pin first vs routine connections and the
single event. The blocking **gate** variant remains unbuilt by design —
revisit only with a real credential-theft story (the mechanics exist:
`authResult` is already async).
