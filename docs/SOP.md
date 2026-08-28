# Build SOP — Wren

Derived from the runtime-efficiency contract (~/.claude/CLAUDE.md). This is
the operating procedure for this build and any future session on this repo.

## Delegation shape

- The orchestrator (Fable) owns: decisions, contracts (`src/shared/`),
  briefs, merges, gates, and the handoff. It writes docs and contract files
  itself and delegates everything else.
- Implementation lanes run **sequentially, single-writer, in the main
  checkout** (sequential dispatch is unlimited; worktrees are required only
  for concurrent writers).
- Lanes that write components run on **Opus or better** (model floor).
  Mechanical lanes (scaffold, captures, fixtures) run on Sonnet.
- Delegates never spawn children. Briefs are written in short imperative
  sentences (ASD-STE100 style). Every brief names its deliverables, its
  verification command, and a max-400-word return format.
- Research runs as one background agent against primary sources; findings
  land in `docs/research/`, never in orchestrator context at length.
- No read-heavy audit fan-out. The design-review and simplify passes are
  single agents (simplify manages its own two-agent split).

## Lane order

1. Scaffold (Sonnet) — skeleton, deps, shadcn init, dev-launch proof.
2. Engine (Opus) — main process: OAuth, Gmail client, sync, store, IPC.
   TDD: vitest first for threading/sync/MIME against fixtures.
3. Shell (Opus) — renderer: three-pane layout, list, reading pane, theming,
   demo data rendering.
4. Features (Opus) — composer, command palette, settings, onboarding,
   notifications, shortcuts.
5. Polish (Opus) — invokes design-foundations + interface-craft critique
   internally, fixes, re-captures.
6. Seal — orchestrator runs /simplify on the full diff, then docs, CI,
   handoff.

## Gates (prove once per boundary)

- After every lane: `npm run typecheck && npm test` plus lane-specific
  proof (launch, screenshot script). A passing gate is not re-run unless
  its inputs change.
- Visual states are captured by `scripts/screenshot.mjs` (Playwright +
  Electron, demo mode) — deterministic, repeatable, and the artifact Nick
  reviews. UI work is not "done" until screenshots are sent for approval.
- Commit at every lane boundary. Never push (no remote).

## Token rules

- One Bash call per intent; batch independent calls.
- Never re-read written files; briefs carry the contract instead of the
  code.
- Agent returns are compact evidence: file lists, test output tails,
  pass/fail — never transcripts.
- Escalate to denser process only when a gate fails or evidence conflicts.
