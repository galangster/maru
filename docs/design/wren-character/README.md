# The wren character — traced source

Nick's reference art (downsampled) and the SVG paths traced from it at
440×440, plus the tracer itself. The living design surface is the
Claude Design canvas linked from `wayfinder/tickets/P13-wren-character.md`;
these files are the machine-readable source the P13 rig starts from.

- `*-reference.png` — Nick's original poses (perched, flight, the two
  preens share `preen-reference.png`).
- `character-sheet.png` — Nick's canonical sheet (bio, expressions,
  poses, turnaround, storyboard). CANONICAL PALETTE: #FF4F87 primary ·
  #FF7BA1 · #FFD6E1 · #FEE9EF ground · ink #1A1A1A.
- `*.paths.txt` — traced layers per pose: BODY (white), WING + BEAK
  (pink), EYE bbox, PALE* (legs/underfeathers/sparkles). Render with
  the canonical palette; the raw trace colors in these files' source
  images were pre-canon.
- In-app: `src/assets/wren-poses.ts` (generated from these) +
  `src/components/wren-figure.tsx` (the rig).
- `trace.mjs` — re-run against new reference art:
  `node trace.mjs <img.png> [cropX cropY cropW cropH]` (fractions).
  Imports sharp from this repo's node_modules by absolute path — fix
  the import if the checkout moves.

Still to design: perk (new mail) and ruffle (error) poses.
