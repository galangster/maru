# R2a — MCP local-server practices  `wayfinder:research` (AFK)

status: closed · claimed: fable-orchestrator · blocked by: —

## Resolution

Closed 2026-08-29 → docs/research/mcp-gateway-notes.md. Shim↔app: unix
socket/named pipe 0600 primary (spec's own security doc rules out bare
loopback; Docker Desktop = good precedent, Figma/Blender = flagged bad).
No spec-level deferred approval — the queue is app-level (pending ID +
notifications/subscribe); per-call human-in-the-loop is spec-mandated
anyway. clientInfo is self-reported (SEP-1289 dormant): display label
only — grants bind to Wren-issued credentials. Follow list-summary/
fetch-detail split for thread tools; set readOnly/destructive/idempotent
hints; snake_case verb_noun names.

## Question

Current (2026) best practice for local MCP servers shipped with desktop
apps: stdio-shim-to-app patterns, authenticating the shim↔app channel,
agent/client identity, consent flows, tool-annotation conventions
(readOnly/destructive hints), result-size norms. Primary sources: MCP spec
+ SDK docs. Findings → docs/research/mcp-gateway-notes.md.
