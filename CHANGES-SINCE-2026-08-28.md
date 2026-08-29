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

Unchanged from baseline: MailService/Platform contracts (additive only),
engine test suite semantics, fonts, PRD scope.
