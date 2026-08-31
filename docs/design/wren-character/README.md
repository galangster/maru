# The wren character — traced source

Nick's reference art (downsampled) and the SVG paths traced from it at
440×440, plus the tracer itself. The living design surface is the
Claude Design canvas linked from `wayfinder/tickets/P13-wren-character.md`;
these files are the machine-readable source the P13 rig starts from.

- `*-reference.png` — Nick's original poses (perched, flight, the two
  preens share `preen-reference.png`).
- `*.paths.txt` — traced layers per pose: BODY (white), WING + BEAK
  (deep pink), EYE bbox, PALE* (legs/underfeathers/sparkles).
  Colors: bg #F84368 · wing #F83562 · white #FDF9F8 · pale #F9C8D6 ·
  shadow #D93B57.
- `trace.mjs` — re-run against new reference art:
  `node trace.mjs <img.png> [cropX cropY cropW cropH]` (fractions).
  Imports sharp from this repo's node_modules by absolute path — fix
  the import if the checkout moves.

Still to design: perk (new mail) and ruffle (error) poses.
