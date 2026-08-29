# M4 — The triage-morning slice  `wayfinder:task`

status: closed · claimed: M4 lane, 2026-08-29 · blocked by: M3

## Question → work

End-to-end proof: an agent (Claude) connects, reads overnight mail,
archives noise under its grant, drafts replies into the approval queue;
the human opens Wren to a tidy inbox and taps approvals. Ship with docs
(connecting Claude Code/Desktop to Wren) and a recorded demo. This closing
graduates the "spec document" fog item.

## Resolution

The morning ships three ways: as a machine proof, as a playbook, and as a
recording — each one honest about which half of the story it carries.

**The proof** is `tests/triage-live.test.ts`, over the same rig as M3's
smoke — real socket, real shim as a child process, real MCP handshake, real
gateway on the store demo mode seeds. The rig itself moved to
`tests/helpers/live-rig.ts` so the two live tests drive one product path
rather than two copies of it. The arc: ping, accounts, survey, three noise
archives (asserted as *exactly* those threads leaving the inbox — set
arithmetic, not counts), a star for the security advisory, two read → draft
→ request_send loops, the refusal the trust model exists for (Rosa's domain
outside the send scope, refused by name, `blocked` in the trail), both
approvals tapped programmatically — the one step no tool can reach — and the
sent list gaining both threads. The trail is asserted row by row, all
twenty-two, and printed so the gate's operator reads a morning rather than
an assertion count.

**The playbook** is docs/TRIAGE-MORNING.md: the grants the story needs, the
paste-ready prompt, and the two load-bearing lines in it — *do not retry a
blocked send* (the refusal already names the address; retries fill the
timeline and change nothing) and *do not poll list_pending* (every call is
an audit row; M3's follow-on note, answered in prompt discipline rather
than by special-casing the audit path). The gateway also surfaced in the
README, which had predated the era entirely.

**The recording** is docs/captures/triage-morning-demo.webm — 14 s,
deterministic, re-recordable via `scripts/record-triage.mjs` (Playwright
video over `?demo=1`, whose fixtures are staged as the morning after
Scout's pass): inbox with the badge at two, `w` into the queue, read,
approve confirming green, the audit log ending on "You approved". It is
the human's half. The split-screen film with a live Claude driving the
agent's half needs Nick at the keyboard and stays an owner gate; its beat
sheet is the playbook's §4.

Gates: typecheck clean · 388 tests green (387 + the triage smoke; both live
suites re-run verbose with trails printed) · recording verified by frame
extraction · /simplify ran before the seal (two agents, four angles).
Applied from it: the shim's argument contract moved into one `spawnShim`
seam; rig teardown moved into `useLiveRig` so a third live test cannot
forget it; `Draft`, `requestSend`, `trailSince` and `printTrail` shared
between the two live tests; `ShimClient.stderr` dropped as dead state; the
smoke's parallel tool/outcome arrays joined into the triage test's tighter
`tool:outcome` form; `SocketRelay`/`ShimClient`/`portOpen`/`waitForPort`
unexported; `PORT`/`ORIGIN` moved beside `startServerIfNeeded`; vite and
chromium boots parallelized in both capture scripts. Skipped: parallelizing
`seedDemoAgents` with `relay.listen()` (sub-millisecond, reviewer-noted not
worth the churn); parallelizing the three archive calls (row order in the
trail assertion is load-bearing).

Follow-on: the spec fog item graduates as
[M5-permission-spec.md](M5-permission-spec.md). The live film and the
lived-in `claude mcp add` run remain owner gates from the overnight
handoff.
