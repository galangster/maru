# M5 — The publishable permission-model spec  `wayfinder:task`

status: in progress · claimed: M5 lane, 2026-08-29 · blocked by: —

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

## Resolution

Shipped as [docs/PERMISSION-MODEL.md](../../docs/PERMISSION-MODEL.md) —
draft v0.1, RFC-2119 voice, written for implementers of other gateways
with Wren as the worked example and every claim tied to the code and the
tests that pin it. Eleven sections: the stance (default deny, human-gated
egress, total observability), the four objects, identity (own credentials,
digest-only storage, clientInfo as display-only, resolve-once), capability
and scope structure, the nine evaluation rules with rationale and the
grant-replacement semantics, the approval queue as the app-level answer to
MCP's missing deferred-approval primitive (dispatch-then-mark, quiet deny,
lazy TTL expiry), revocation (wins backwards, next-call effect, no
hangup), the audit contract (one row per call, machine-no vs human-no,
append-never-fails-the-action, the polling caveat), transport requirements
(user-restricted local IPC, first-frame auth, caps), provenance, and a
conformance summary.

Accuracy gate: one fact-check agent verified every checkable claim against
`src/core/agents/*`, `src/core/gateway-server/*`, `src-tauri/src/
gateway.rs` and the test suites. It found five discrepancies — malformed-
address rejection attributed to the wrong layer, an unreachable unlogged
denial path stated too broadly, the approval queue listed as an `evaluate`
consumer when it deliberately is not, the 0600/0700 MUST stated stronger
than the best-effort implementation, and a misquoted audit row — all five
corrected in the document rather than papered over. Everything else
verified, including the exact outcome vocabulary, both caps, and the
22-row triage trail.

Placement and license stay with G1 as the ticket required; the README and
CONNECT-AN-AGENT now link the spec.
