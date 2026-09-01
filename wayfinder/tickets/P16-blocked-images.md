# P16 — Blocked remote images: the void, the dead Show, the bypasses  `wayfinder:task`

status: **CLOSED (2026-09-01)** · claimed: autonomous run 7 · blocked by: —

The three defects below were fixed on 2026-08-31 (run 6, commits `717707e`,
`57a1947`, `64a3880`) — the ticket was written before that work and its line
numbers are stale. Run 7 verified all three in the running app and closed the
TAIL: three further defects in the same two mechanisms, found by probing the
paths the 33 existing tests did not reach. Resolution at the bottom.

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


---

# RESOLUTION — 2026-09-01

## The three original defects: fixed 2026-08-31, verified 2026-09-01

Verified by driving the real app in `?images=block` against the Offhours
fixture, which is one of the two demo threads that pulls a remote image.

1. **The void.** Fixed by substitution rather than removal, plus
   `collapseEmptyBoxes`. The hero now renders as a small `Image` chip and the
   message frame measures **428 px** where the hole made it **970**.
2. **Show is dead for CSS backgrounds.** Fixed: the strip is guarded on
   `allowRemoteImages`, and the CSP is keyed on `remoteImages` rather than
   `blockedImages` — the count that does not fall to zero the moment Show is
   clicked. Clicking Show restores the real URL and widens the CSP to
   `img-src data: https: http:` in the same render.
3. **Tracking-pixel bypasses.** Fixed: `FORBID_TAGS` gained the media
   elements, `FORBID_ATTR` gained `poster`/`srcset`/`background`, `isRemote`
   handles protocol-relative and leading whitespace, SVG `<image href>` is
   handled, and `CSS_FETCHING_PROPERTY` covers every image-loading property
   rather than `background` alone. The srcdoc CSP is the backstop underneath
   all of it.

The ticket's two prerequisites are also done: **the DOM test harness exists**
(jsdom, opted into per-file with `// @vitest-environment jsdom`), and
`tests/sanitize.test.ts` now carries **60 tests** where the file had zero.

## The tail: three defects run 7 found and fixed

All three sat in the two mechanisms the original fix introduced. None was
reachable by the existing tests, which is why they survived.

**T1 — an `<img>` was treated as a box.** `collapseEmptyBoxes` asks "does this
still hold anything" by looking at an element's text and its **descendant**
images. An `<img>` has neither, so it satisfied every emptiness test and had
its own `height` stripped — in any message that also blocked a remote image. A
cid: logo declared `height="60"` came back with no height; one declared only a
height rendered at full natural size. Fixed by skipping elements that are
themselves images, with a test that the box AROUND a blocked image still
collapses.

**T2 — a vendor prefix welded two declarations.** `CSS_FETCHING_PROPERTY` had
no declaration-boundary anchor, so it matched INSIDE a prefix:
`color:red;-webkit-mask-image:url(x);border:0` came back as
`color:red;-webkit-border:0`, killing a legitimate `border`. **This is the
same lesson `CSS_SIZING` already records four lines below it**, unlearned one
regex over. Fixed with the same anchor plus `(?:-[a-z]+-)?`, because anchoring
alone would have made prefixed properties stop matching at all — turning a
cosmetic bug into a leak.

**T3 — counted but not stripped.** `remote` came from a regex over the whole
style attribute while the strip came from the property list, so anything the
first saw and the second did not — `filter:url(https://…)` is the real case —
was counted as a remote image and left in the output. Counted is what widens
the CSP, so **a body with no picture in it at all rendered under
`img-src data: https: http:`**, opening the backstop for exactly the class of
mail where the enumeration carries the load alone. That is the same structural
mistake the beacon drop is hoisted above both counters to avoid. Fixed by one
pass: a declaration is counted only if the replace handled it, so
counted-but-not-stripped is now unreachable. `filter` and `clip-path` stay out
of the list on purpose — `img-src` does not govern them and `default-src
'none'` is what stops them.

## What is NOT closed by this ticket

- **The double layout shift on Show** could not be verified in demo mode: the
  fixture hero points at a fake domain, so the image never loads and the frame
  height does not move (428 before and after). It needs a real newsletter, so
  it is a hand-check rather than something an agent can prove. The zoom loop
  the ticket warned about is guarded — `measure()` resets `body.style.zoom`
  before reading and only writes a real change.
- **Session- and thread-scoped Show** is unchanged and is a product decision,
  not a defect. It is in `NICK-QUEUE.md` as "Remembering Show images per
  sender".
- Remote images **load by default** since 2026-08-31, so everything above is
  behind an opt-in setting. That lowers the frequency of the cosmetic defects
  and does not lower the stakes of the privacy ones: the beacon drop and the
  CSP run under BOTH policies.

## Environment note, confirmed twice in one session

The Vite dev server served a **stale `sanitize.ts`** while reporting a
successful HMR update, and a full `preview_stop` + `preview_start` did not
clear it — the first measurement said the chip was never applied and the frame
was 970 px tall, which was simply the old module. A reload with a
cache-busting query parameter fixed it. **If a browser measurement disagrees
with a passing unit test, distrust the browser first.**
