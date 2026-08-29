# G1 — License + going public  `wayfinder:grilling` (HITL)

status: open · claimed: — · blocked by: —

## Question

MIT or Apache-2 (patent grant)? When does galangster/wren flip public —
and what must be scrubbed first (docs reference Nick's Google Cloud
project id, personal emails in decision logs, capture provenance)? Naming:
does the shim ship as `wren-mcp`? Resolve live with Nick.

## Partial resolution — license (2026-08-29)

Nick delegated the license choice ("I'm unsure about the licensing you can
choose what's best for me") and added the load-bearing fact that Wren will
probably become a subscription. Chosen: **AGPL-3.0-only for the code**,
**CC BY 4.0 for docs/PERMISSION-MODEL.md**.

Why AGPL against the subscription intent: desktop *use* is untouched by
the network clause, so the agent-runner audience loses nothing; what it
blocks is a third party hosting a Wren-derived service — exactly the
territory a future paid sync/hosted offering (G2 option 3) would occupy —
without sharing back. Sole authorship keeps every door open: Nick can
dual-license, sell commercial exceptions, or relicense later; a permissive
license now would be the only irreversible pick. The spec is CC BY because
the "defacto" thesis wants the model copied even where the code is not.

Still open in this ticket: repo-public timing + the scrub list (a
public-readiness audit is being prepared), and the `wren-mcp` naming call.
