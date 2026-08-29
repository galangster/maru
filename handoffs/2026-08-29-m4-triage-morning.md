# Session handoff — M4 triage morning, 2026-08-29

Boundary: the M4 ticket closes. Machine facts:
[CHANGES-SINCE-2026-08-28.md](../CHANGES-SINCE-2026-08-28.md) entry 10;
ticket resolution:
[M4-triage-morning.md](../wayfinder/tickets/M4-triage-morning.md);
map state: [map-2-agentic-gateway.md](../wayfinder/map-2-agentic-gateway.md).

## State

M4 shipped at 9d1db86 (this wrap commit follows it). 388 tests green;
typecheck clean; both live suites re-run verbose with trails printed.
Deliverables: `tests/triage-live.test.ts` (the morning as a machine proof,
over the extracted `tests/helpers/live-rig.ts`), `docs/TRIAGE-MORNING.md`
(playbook + paste-ready prompt + filming runbook),
`docs/captures/triage-morning-demo.webm` (the human half, 14 s,
frame-verified, re-recordable via `scripts/record-triage.mjs`), README
gateway section. /simplify ran before seal; findings and skips recorded in
the ticket resolution. Not pushed this session.

## Open owner gates (Nick)

1. **Live the story**: connect Claude Code per docs/CONNECT-AN-AGENT.md,
   paste the docs/TRIAGE-MORNING.md prompt, run the morning for real —
   demo mode first, then your mail.
2. **Film it**: the split-screen recording with a live Claude needs you at
   the keyboard; the beat sheet is TRIAGE-MORNING.md §4. The shipped webm
   covers the human half only.
3. Carried from the overnight handoff: G1 (license, repo-public timing,
   `wren-mcp` naming), N5/N6 owner nits, Windows hand-smoke,
   production-status flip, Anron overlay alternates.
4. ~~Push~~ — done same session; main is at e2ea9a1 on galangster/wren.

## Next tickets on the map

[M5-permission-spec.md](../wayfinder/tickets/M5-permission-spec.md) — the
publishable permission-model spec, graduated from fog by M4's close; its
placement and license posture sit behind G1. Other fog worth grading:
connection-consent prompt; user-label mutation + outgoing attachments on
the MailService seam.

## Resume prompt (fresh session)

```
Open /Users/galangster/Projects/wren. Read handoffs/2026-08-29-m4-triage-
morning.md, then wayfinder/map-2-agentic-gateway.md. Take M5 (permission
spec) or the ticket Nick names. Contracts: src/core/types.ts +
src/core/agents/ seams; DIRECTION.md is visual law; SOP.md governs lanes.
```
