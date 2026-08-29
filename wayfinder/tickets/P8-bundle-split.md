# P8 — Bundle split  `wayfinder:task`  *(cuttable)*

status: closed · claimed: autonomous run, 2026-08-29 · blocked by: —

The 1.39 MB index chunk (build warning since M-era): dynamic-import the
heavy leaves (tiptap editor, settings surfaces, agents surfaces) so the
shell paints from a smaller core. Prove with the build output and a
cold-start timing before/after; captures must stay byte-identical.

## Resolution

The four heavy floating surfaces (composer with its whole tiptap world,
settings, approval queue, audit timeline) now load on first open through a
`Latch` — once opened, mounted forever, so exit animations and in-dialog
state behave exactly as they did eager. Startup chunk: **1,387 KB →
541 KB** (gzip 445 → 175); the composer's 405 KB and the rest arrive when
summoned. All captures byte-identical except the expected ones — the
capture flow itself exercises the latched paths (settings, queue,
timeline all open under Playwright) and holds.
