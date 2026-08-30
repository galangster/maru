# P11 — Bulk actions + search operators  `wayfinder:task`

status: in progress · claimed: overnight run, 2026-08-30 · blocked by: —

## Question → work

Approved into the map by Nick's "reduce as much friction as possible /
keep optimizing / ship more" directive at v0.1.0's publish.

1. **Search operators.** `from:`, `to:`, `is:unread`, `is:starred`,
   `has:attachment`, `label:` composed with free text — parsed into a
   filter over the search/index results, shown honestly in the results
   strip. Gmail's grammar where it fits MiniSearch's reality.
2. **Bulk triage.** Multi-select in the list (`x` toggles, shift-click
   ranges, a select-all affordance), a bulk bar naming the selection
   count with archive / trash / read / unread, one undo for the batch.

## Resolution — 2026-08-30, overnight run

Both halves shipped in one seal.

**Search operators.** `src/core/search/operators.ts` is the shared layer:
`parseSearchQuery` lifts `from:`/`to:` (both match participants — the
index is thread-level, documented, not hidden), `is:unread|read|starred`,
`has:attachment`, and `label:` (quoted names supported, values lowercased
at parse) out of the free text; `matchesFilters` applies them;
`searchWithOperators` runs the pipeline — MiniSearch ranks the remaining
text, or `index.all()` (newest first) when the query is operators alone.
`label:` resolves against user labels by lowercased name via
`labelNameMap(labels)`; an unknown name matches *nothing* (a typo finds
nothing rather than everything). Both services hand in their accounts'
labels (`Promise.all`) and stay two lines each. Palette placeholder now
hints the grammar.

**Bulk triage.** `x` toggles (new keymap row, printed in the sheet),
shift-click ranges from the last toggle, avatar-click checks with the
mouse, select-all in the bar. The bar shares the 8-high strip with the
lens/search bars and outranks the lens; verbs: Archive/Trash (Restore in
Trash view), Read, Unread, Clear (esc). `src/features/list/bulk.ts` is
the one orchestrator for both entry points (bar buttons, and `e`/`#`/`u`
with threads checked — `isBulkAction` narrows, zero-target falls through
to the single-thread path). One undo per batch, phrased "N threads
archived"; selection advances past the whole batch via the widened
`nextAfterRemoval(visible, key | Set)`. A lens change clears the batch —
the store owns that invariant now, not each consumer.

**Proof.** 447 tests (17 new: tests/search-operators.test.ts,
tests/bulk.test.ts); typecheck clean; live demo verification — operator
counts match fixture truth (9 unread, 4 starred, unknown label → 0),
`walkthrough from:maya` → 1, bar renders/batches/undoes, Escape and lens
changes clear. (Live-probe note: the pane throttles timers when hidden,
which lagged DOM readouts one query behind — engine values were verified
by unit probe and a fronted-tab rerun.)

**/simplify** ran as the standard two agents / four angles. Applied:
checkedCount derived from `rows` (ref + eslint-disable gone);
`toLowerCase` once in the parse; label-map builder deduped into
`operators.labelNameMap` with `Promise.all` in both services;
`isBulkAction` positive narrow replacing an unsound cast (a checked
`unarchive` could have produced an undefined label); bulk labels derived
from the exported `UNDO_LABELS`; `showUndoToast` now the one undo-toast
spelling (three copies removed); `StripButton` the one strip-button
recipe (lens Reset + bulk verbs); `followSelection` deleted in favor of
the widened `nextAfterRemoval`; undo closure captures keys, not Thread
objects; lens-clears-batch moved into the store. Skipped, with reasons:
`hasFilters` reshape (three-line function, tested, not worth the churn);
`index.all()` sort caching and real-service label-map caching
(sub-perceptible at Wren's scale; no clean invalidation hook for the
latter — recorded here so it isn't rediscovered).

Known limits, honest: operators filter the *local* index (same reach as
plain search — synced threads only); `from:`/`to:` are both participant
matches; no negation (`-from:`) in v1; bulk selection works on the list,
not on search results.

status: **done**
