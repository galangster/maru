# M5 — The publishable permission-model spec  `wayfinder:task`

status: open · claimed: — · blocked by: —

## Question → work

The document that makes "defacto" claimable: a standalone, publishable spec
of Wren's permission and audit model — grants (per-agent × capability ×
scope), rule-by-rule evaluation (including rule 9's every-recipient test),
the approval queue's app-level pending-id pattern over MCP's missing
deferred-approval primitive, revocation-wins-backwards, and the append-only
audit contract. Written for people building *other* agent gateways, not for
Wren's users; the reference other projects cite. Graduated from fog by M4:
the triage morning proved the model end to end (tests/triage-live.test.ts),
so the spec now describes something demonstrated rather than intended.

Source material: tickets M1–M4 resolutions, docs/CONNECT-AN-AGENT.md §4–5,
docs/research/R2a. Where it lands (docs/ vs a top-level SPEC.md) and its
license posture belong to G1's owner gates.
