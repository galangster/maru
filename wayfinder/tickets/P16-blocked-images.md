# P16 — Blocked remote images: the void, the dead Show, the bypasses  `wayfinder:task`

status: queued (2026-08-31, investigated) · claimed: — · blocked by: —

## The ask

Nick, 2026-08-31: "i'm also still getting this image blocking thing, so
probably need to look at this again and queue it up afterward."
Screenshot: an Alfred rent-reminder mail, the "Remote images blocked"
pill, then ~350px of blank space before the body text.

Investigated 2026-08-31. "Still" is a repeated report, **not a
regression** — the `IMG` branch has been unchanged since the first
shell commit (e5ebd96, T3). This has never been fixed.

## Three defects, one code path

All in `src/lib/sanitize.ts` (a DOMPurify `afterSanitizeAttributes`
hook, output wrapped in a sandboxed iframe `srcdoc`). No CSP, no proxy —
blocking is pure DOM surgery.

**1. The void (what Nick sees).** Blocking removes the pixels but never
the box. `sanitize.ts:64` calls `node.remove()` on the `<img>`, while
every layout-bearing ancestor survives: DOMPurify's default allowlist
keeps `height`, `width`, `bgcolor`, `cellpadding` and inline `style`. A
hero built as `<td height="350">` keeps its 350px with nothing inside.
Worse, `sanitize.ts:72` strips a `background-image:url(…)` declaration
but leaves `height:350px` in the *same* style attribute — which is
exactly the canonical marketing-email hero, and exactly Nick's ~350px
hole. The iframe measures its height from the document, so it
faithfully reproduces the gap.

**2. Show is dead for CSS backgrounds.** `sanitize.ts:71-75` strips the
`background` declaration **unconditionally** — the `allowRemoteImages`
guard is only on the counter, not on the write. So for a mail whose
imagery is CSS backgrounds: the pill appears, the user clicks Show, the
count drops to zero, the pill disappears, and *nothing loads*. Very
plausibly a second thing behind "still". The same line also destroys
safe `data:` backgrounds permanently, in both states.

**3. Tracking-pixel bypasses (privacy, not cosmetics).** `/^https?:/i`
at `sanitize.ts:62` misses protocol-relative `src="//host/px.gif"`,
`src=" https://…"` with leading whitespace, `<svg><image href>` (SVG
`image` is allowlisted and its tagName is `image`, not `IMG`), and
`<video poster>` / `<source>` — `video`, `audio`, `source`, `track`,
`picture` are all absent from `FORBID_TAGS`. The background-only regex
never sees `list-style-image`, `mask-image`, `border-image`,
`content:url()` or `cursor:url()`. Every one fires a real request and
tells the sender the mail was opened — which is the exact promise the
pill makes. For a client whose pitch is verifiable privacy this is the
most serious of the three.

## Fix

1. **Substitute, don't remove.** Stash `src` in
   `data-wren-blocked-src`, swap in a transparent 1×1 `data:` URI,
   delete `width`/`height`, add `class="wren-blocked"`, keep `alt`.
2. **Drop trackers entirely.** Declared area under ~64px² gets no
   placeholder — it feeds the pill count only.
3. **Neutralise the container.** When stripping a `background` url,
   strip `height`/`min-height` in the same block; and after sanitizing,
   clear sizing on any element whose subtree now has no text and no
   image.
4. **Guard the background strip on `allowRemoteImages`** so Show works,
   and never strip `data:` backgrounds.
5. **Add a CSP meta to `buildSrcdoc`** — `default-src 'none'; img-src
   data:; style-src 'unsafe-inline'`, relaxed to `img-src data: https:`
   once allowed. A backstop that does not depend on enumerating tags,
   and it closes all of defect 3 at once.
6. **Placeholder styling** goes inside `buildSrcdoc` as hard-coded hex
   (the iframe cannot see the app's CSS variables — this is why
   `#E7E5E4` etc. are already literals there): a flat sunken inline
   pill, `border-radius:6px`, `background:#F0EDEC`, `color:#6F6D6B`,
   13px, mirroring `--wren-radius-xs` / `--wren-surface-sunken` /
   `--wren-text-3`. Not a framed box — DIRECTION §10.2 bans decorative
   bars.

## What makes it harder than it looks

- **The zoom loop.** `message-body.tsx:152-218` runs a ResizeObserver
  that writes `body.style.zoom` from `scrollWidth`. Placeholder CSS
  changes `scrollWidth` → changes the fit → changes heights. Test
  against a 600px fixed-width newsletter or you trade a void for a zoom
  oscillation.
- **Double layout shift on Show**: the pill unmounts as the frame
  grows, and the frame keeps its stale height until the next observer
  tick, so content jumps twice in opposite directions.
- **No test harness.** `vitest.config.ts` is `environment: "node"` and
  there is no jsdom/happy-dom installed, so nothing in `sanitize.ts` is
  testable today. **Adding a DOM environment is part of this ticket** —
  this is security-adjacent code that currently has zero coverage.
- **Session- and thread-scoped** (`ui-store.ts:69-70`): the same
  newsletter is blocked again next session, and Show must be clicked
  every time. If Nick reads Alfred daily, "still" may partly mean
  exactly that. Remembering per *sender* is a product decision — see
  the queue.

## Sequencing

Defect 2 and the CSP half of defect 3 are small and worth doing with
the current visual pass. The container-collapse work (defect 1) wants
the DOM test harness first.
