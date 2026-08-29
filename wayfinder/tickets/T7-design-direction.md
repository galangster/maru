# T7 — Design direction: Mobbin + liquid glass + tokens  `wayfinder:research` (AFK)

status: closed · claimed: fable-orchestrator · blocked by: —

## Resolution

Closed 2026-08-28, commit 2a1a585. System: periwinkle-indigo accent (OKLCH
hue 268) carried at low chroma through the neutrals; AA-verified tiers;
5-size type scale (Open Runde 500/600 chrome, DM Sans 400/500 body); glass
recipe blur(20)/saturate(180) with WebView2 rules (max 2 layers, never on
scroll containers, no animated blur; true Liquid Glass refraction rejected —
Chromium-only). Mobbin: fixed sender column, space-not-dividers grouping,
fill-step depth, centered glass palettes. docs/design/DIRECTION.md +
src/styles/tokens.css.

## Question

What exact visual system (palette, type spec, spacing, radius, elevation,
glass recipe, icon treatment) should Wren's shell build against, given
Nick's Round-5 direction: cloud-soft SaaS, liquid glass done properly on
WebView2, Family/Phantom/Aave/Umbra references, Open Runde + DM Sans, Anron
icon feel, 4 px grid discipline, no MetaDAO styling?

Deliverables: docs/design/DIRECTION.md + src/styles/tokens.css.
