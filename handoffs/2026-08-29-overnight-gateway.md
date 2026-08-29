# Session handoff — overnight gateway build, 2026-08-29

Boundary: the overnight autonomous run Nick requested closes with map 2's
M1–M3 shipped, audited, fixed, and pushed. Machine facts:
[CHANGES-SINCE-2026-08-28.md](../CHANGES-SINCE-2026-08-28.md) entries 7–9;
map state: [map-2-agentic-gateway.md](../wayfinder/map-2-agentic-gateway.md).

## State

HEAD pushed to galangster/wren (private). 387 tests green; typecheck/build
clean; cargo clean; two live socket smokes recorded in M2/M3 resolutions.
All 13 captures current. Wren the client: five real accounts syncing,
Amie-ified, universal keys, coral icon. Wren the gateway: agents can
connect (socket + shim), hold grants, use eleven tools; every send queues
for human approval; everything audited.

## Open owner gates (Nick)

1. **Try the gateway**: create an agent in Settings → Agents, then
   `claude mcp add wren -- node <repo>/bin/wren-mcp.mjs --token <credential>`
   per docs/CONNECT-AN-AGENT.md — the real M4 "triage morning" ticket wants
   this lived-in first.
2. **G1 ticket (HITL)**: license (MIT vs Apache-2), repo-public timing +
   scrub list, `wren-mcp` naming.
3. **N5/N6 owner nits** from audit 2 (DIRECTION tile count, font-family
   question) — cheap, deferred as owner taste calls.
4. Standing: Windows hand-smoke; production-status flip for the 7-day
   re-auth; Anron overlay alternates (aliases are unprinted).

## Next tickets on the map

M4 (triage-morning demo + docs + recording) is unblocked. Fog worth
graduating next: connection-consent prompt, user-label mutation +
outgoing attachments on the MailService seam (M3 recorded both), the
publishable permission-model spec after M4.

## Resume prompt (fresh session)

```
Open /Users/galangster/Projects/wren. Read handoffs/2026-08-29-overnight-
gateway.md, then wayfinder/map-2-agentic-gateway.md. Take M4 (triage
morning) or the ticket Nick names. Contracts: src/core/types.ts +
src/core/agents/ seams; DIRECTION.md is visual law; SOP.md governs lanes.
```
