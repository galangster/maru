# Changes since the sealed MVP baseline

Baseline: commit `7dc8e86` ("T6 seal", 2026-08-28 — the state described by
ENGINEER-HANDOFF.md). This delta covers `7dc8e86..HEAD`. Per-change: what,
where, why, proof.

1. **Full craft audit applied.** All blocking/should-fix findings from the
   ui-review audit (tab-order flood, palette stacking, listbox semantics,
   keyboard-action motion, alignment breaks). Where: src/features/**,
   report at docs/design/UI-REVIEW-2026-08-28.md. Why: Nick's "no stone
   unturned" directive, 2026-08-28. Proof: d757c1c; 236 tests; captures.
2. **Magic pass + interface sounds.** Send micro-sequence with 4 s undo,
   star fill crossfade, empty-state tiers; CC0 sound set (off by default,
   Appearance toggle). Where: src/features/**, src/lib/sound*.ts,
   src/assets/sounds/. Why: MAGIC.md/SOUNDS.md research, Nick's fun
   directive. Proof: d757c1c; guard tests.
3. **Anron icon system.** 42/43 glyphs from Nick's Figma library behind the
   Icon seam; Filled twins + semantic color for active states; shadcn
   internals routed through the seam (chip session, merged). Where:
   src/components/ui/icon*, src/assets/icons/anron/. Proof: 8f50c45,
   14afbae, 82f42ef; captures.
4. **Live-Gmail engine fixes** (first real-mailbox run): pooled-connection
   transaction starvation → no explicit transactions + WAL; batch 429
   storms → 10-item chunks with per-part retry rounds; desktop-unsupported
   notification listener guarded; drag/notification permissions added.
   Where: src/core/store/db.ts, src/core/gmail/api.ts, src-tauri/
   capabilities. Why: observed live failures (log evidence in-session).
   Proof: e2894ad, ac6d3b3; verified full backfill + cross-account send.
5. **Amie-ification.** De-tinted achromatic neutrals, 8-hue category
   family, ring-composed lighter depth, tighter radii, inset rounded rows,
   concentric-corner sweep, celebrations, macOS titlebar fix. Where:
   src/styles/tokens.css, src/features/**, src-tauri/tauri.conf.json;
   study at docs/design/AMIE-STUDY.md. Why: Nick's Amie directive,
   2026-08-29. Proof: 3175e3e; captures t3-01/t3-03/t4-05.
6. **Infra**: GitHub remote galangster/wren (private); Windows CI run
   succeeded (artifact `wren-windows`); Google OAuth client configured;
   account connected. Proof: run 33233183538; live sync in-session.

7. **Universal keys + identity.** Delete/Backspace archive, ⌘⌫ trash,
   arrows, Space reading rhythm, ⌘N/⌘,/⌘F, z undo, w approval queue; the
   titlebar wordmark removed (Nick's ruling); Nick's coral bird is the app
   icon. Where: keymap.ts, titlebar.tsx, src-tauri/icons. Proof: a0629de.
8. **The agent gateway era (overnight 2026-08-29, map 2 M1–M3).** Trust
   substrate (agents/grants/approvals/audit, nine-rule evaluate()), the
   in-app MCP server over an authenticated 0600 unix socket with the
   `bin/wren-mcp.mjs` shim, and eleven grant-gated tools with every send
   queued for human approval. New surfaces: approval queue ("Waiting on
   you"), audit timeline, Settings → Agents. Where: src/core/agents/,
   src/core/gateway-server/, src-tauri/src/gateway.rs, src/features/
   agents+approvals+audit, docs/CONNECT-AN-AGENT.md. Why: map 2 charted
   with Nick 2026-08-29. Proof: 131c920, c6a0f9d, 92373a3; 387 tests; live
   socket smokes in both M2 and M3.
9. **Second full ui-review cycle** (docs/design/UI-REVIEW-2026-08-29.md):
   B+ on the new surfaces; all blocking/should-fix findings fixed
   (approval focus + announcements, credential-moment weight, badge
   contrast 14.63:1, anchored dialog growth, virtualized audit table).
   Proof: 28f093b + the theme-picker mirror fix.

10. **M4, the triage morning.** The gateway's first story shipped three
    ways: a live E2E test of the whole morning over the real socket + shim
    (survey, noise archives, star, two queued replies, the out-of-scope
    refusal, approvals, tidy inbox, 22-row trail asserted in order); the
    docs/TRIAGE-MORNING.md playbook (grants, paste-ready prompt, filming
    runbook); the recorded demo of the human half
    (docs/captures/triage-morning-demo.webm, re-recordable via
    scripts/record-triage.mjs). README gains its gateway section. Where:
    tests/triage-live.test.ts, tests/helpers/live-rig.ts (rig extracted
    from the M3 smoke), scripts/. Why: map 2 M4; the map's "one filmable
    story". Proof: 9d1db86; 388 tests; frame-verified webm. Spec fog item
    graduated as ticket M5.

11. **M6, the component-system audit.** Token/seam layers verified clean;
    duplication fixed one layer up: empty-state and thread-result promoted
    to src/components (domain half split to features/list/inbox-zero.ts,
    celebrate.ts to src/lib), SurfaceHeader/SurfaceEmpty + seven recipe
    constants added to wren-controls, ~30 call sites deduplicated, and
    docs/design/COMPONENTS.md written (layers, promotion rule, import
    rules). Why: Nick's scalability directive, 2026-08-29. Proof: this
    commit; 388 tests; all 13 captures byte-identical twice. New asks
    charted, not absorbed: tickets M7 (list sort/filter) and G2
    (cross-device sync, a grilling ticket against the no-servers line).

12. **M7, list order + the lens.** Long threads now open landed on the
    newest message (the cause behind Nick's oldest-first screenshot —
    chronological threads opened at the top). Per-view sort and filter:
    sliders popover on the list header, lens bar with count + Reset,
    palette verbs, filter-aware empty states that never borrow "Inbox
    zero". SegmentedGroup promoted to the kit (theme picker + lens share
    it). Where: features/list/*, features/mail/ui-store.ts,
    features/reading/, wren-controls.tsx. Why: Nick's ask, 2026-08-29
    (ticket M7). Proof: this commit; 397 tests; live browser verification;
    capture m7-14. Known limit documented: the lens sees the newest
    100-thread page.

13. **M5, the permission-model spec.** docs/PERMISSION-MODEL.md v0.1: the
    earned-autonomy model as a standalone RFC-2119 spec for other gateway
    builders — identity, grants, the nine rules, the app-level approval
    queue, revocation, the audit contract, transport requirements, and a
    conformance summary. Fact-checked claim-by-claim against the code by
    an independent agent; five discrepancies corrected. Linked from the
    README and CONNECT-AN-AGENT. Why: map 2's "defacto" thesis, graduated
    by M4. Proof: this commit; the accuracy pass. Placement/license stay
    behind G1.

Unchanged from baseline: MailService/Platform contracts (additive only),
engine test suite semantics, fonts, PRD scope.
