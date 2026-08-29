# T3 — Shell: three-pane UI on demo data  `wayfinder:task` (AFK)

status: closed · claimed: fable-orchestrator · blocked by: T2, T7

## Resolution

Closed 2026-08-28, commit e5ebd96. Three-pane shell on demo data: virtualized
date-grouped list (152px sender column), sandboxed reading pane (no
allow-scripts; parent-side height/link handling), optimistic actions,
keyboard basics, Icon seam, react-query data layer, capture harness
(scripts/screenshot.mjs → docs/captures/t3-0[1-4]). All gates green; engine
suite intact. Orchestrator visual gate passed; captures sent to Nick.
Flagged for T5: sidebar footer truncation, account-dot placement at row
far-right, header count semantics (37 threads vs 9 unread).

## Work

Sidebar, virtualized thread list (date groups, hover actions), reading pane
(sanitized HTML in sandboxed iframe, blocked remote images, attachments),
theming (light/dark), platform seam so the UI runs in a plain browser on the
demo provider. Gate: typecheck + browser screenshots of inbox, thread,
dark mode.
