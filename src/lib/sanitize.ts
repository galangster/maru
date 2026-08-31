// Message-body sanitizing.
//
// Mail bodies are hostile input. Everything that renders one goes through
// here, and the result is only ever handed to a sandboxed iframe — never to
// dangerouslySetInnerHTML.
//
// Policy:
//   - scripts, forms, <style>, framing, metadata and media elements are removed
//   - inline `style` attributes survive, because that is how mail is designed
//   - remote images are withheld by default and counted, so the reading pane
//     can offer "Remote images blocked · Show". A withheld image becomes a
//     text CHIP rather than being deleted, and any container it left empty has
//     its declared height collapsed — deleting the pixels but not the box is
//     what used to leave a hole in the middle of a message.
//   - a remote CSS url() is stripped the same way, and ONLY while images are
//     withheld, so Show actually reveals background imagery
//   - cid: images resolve against the message's inline attachments
//   - `buildSrcdoc` adds a CSP that forbids everything by default. It is the
//     BACKSTOP: the rules above work by enumerating tags and properties, and
//     enumeration is what leaked last time. It must be handed the same
//     allowRemoteImages the sanitize call got, or the two layers disagree.

import DOMPurify from 'dompurify'

export interface SanitizeOptions {
  allowRemoteImages: boolean
  /** Content-Id (angle brackets stripped) → data: URL. */
  inlineImages?: Map<string, string>
}

export interface SanitizeResult {
  html: string
  /** How many remote images were withheld. 0 means nothing was blocked. */
  blockedImages: number
  /**
   * How many remote images the body REFERENCES, whether or not they were
   * withheld. This is the one the CSP must be keyed on, and the distinction is
   * not academic: `blockedImages` is counted inside the `!allowRemoteImages`
   * guards, so the moment a person clicks Show it drops to zero. Deciding
   * whether to widen the CSP from that number meant the widening never
   * happened and Show did nothing at all.
   */
  remoteImages: number
}

const FORBID_TAGS = [
  'script',
  'style',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'noscript',
  // Media, all of which fetch on their own and none of which mail needs. A
  // <video poster> is a tracking pixel with a different tag name, and every
  // one of these was reachable before (P16, 2026-08-31).
  'video',
  'audio',
  'source',
  'track',
  'picture',
]

const FORBID_ATTR = ['srcset', 'ping', 'formaction', 'background', 'usemap', 'poster']

/** A 1x1 fully transparent GIF. It never reaches the output — `chipBlockedImages`
 *  swaps the node for a span — but it is what guarantees the remote URL is gone
 *  from the intermediate tree the collapse pass walks, rather than merely
 *  overwritten later. */
const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * Is this URL going to hit the network?
 *
 * `/^https?:/` was the old test and it missed two forms that mail uses every
 * day: a protocol-relative `//host/px.gif`, and a leading space before the
 * scheme (attribute values are not trimmed for you). Both fetched, and both
 * therefore told the sender the message had been opened — the exact thing the
 * "Remote images blocked" pill promises they cannot do.
 */
function isRemote(raw: string): boolean {
  const url = raw.trim()
  return /^https?:/i.test(url) || url.startsWith('//')
}

/** Declared area in px², when the markup states one. Beacons are 1x1 to 8x8. */
function declaredArea(node: Element): number | null {
  const w = Number.parseFloat(node.getAttribute('width') ?? '')
  const h = Number.parseFloat(node.getAttribute('height') ?? '')
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null
  return w * h
}

/** At or below 8x8 an image is a beacon, not a picture: no chip, just the count. */
const TRACKER_MAX_AREA_PX = 8 * 8

/** Every CSS property that can fetch, not just `background`. */
const CSS_FETCHING_PROPERTY =
  /(?:[a-z-]*background[a-z-]*|list-style(?:-image)?|mask(?:-image)?|border-image(?:-source)?|content|cursor|src)\s*:[^;]*url\([^)]*\)[^;]*;?/gi

/**
 * Sizing left behind on a container whose only content was a blocked image.
 *
 * The leading boundary is load-bearing. Without it this matches INSIDE
 * `line-height:` and `max-height:` — mail carries `line-height` on nearly
 * every `<td>` — and the replace turns `line-height:20px;color:red` into
 * `line-color:red`, which is not CSS at all.
 *
 * And it must be PUT BACK: every `.replace` with this pattern uses `'$1'`, not
 * `''`. The group consumes the separator that ended the previous declaration,
 * so dropping it welded the neighbours together —
 * `width:600px;height:350px;border:0` became `width:600pxborder:0`, killing
 * both `width` and `border` in every minified newsletter. The original tests
 * missed it because none of them put a declaration on BOTH sides of the
 * height.
 */
const CSS_SIZING = /(^|[;\s])(?:min-)?height\s*:[^;]*;?/gi

let state: SanitizeOptions & { blocked: number; remote: number; needsPostPass: boolean } = {
  allowRemoteImages: false,
  blocked: 0,
  remote: 0,
  needsPostPass: false,
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof Element)) return

  // SVG's <image href> is allowlisted by DOMPurify and its tagName is `image`,
  // not `IMG` — so it went straight past the old check and fetched.
  const tag = node.tagName.toUpperCase()
  // SVG's <image href> only. An `href` on an HTML <img> fetches nothing, so
  // counting it would inflate the pill for a non-event.
  if (tag === 'IMAGE') {
    const href = node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? ''
    if (isRemote(href)) state.remote++
    if (isRemote(href) && !state.allowRemoteImages) {
      state.blocked++
      node.remove()
      return
    }
  }

  if (tag === 'IMG') {
    const src = node.getAttribute('src') ?? ''
    if (src.trim().startsWith('cid:')) {
      const resolved = state.inlineImages?.get(src.trim().slice(4).replace(/^<|>$/g, ''))
      if (resolved) node.setAttribute('src', resolved)
      else node.remove()
      return
    }
    if (isRemote(src)) state.remote++
    if (isRemote(src) && !state.allowRemoteImages) {
      state.blocked++
      // SUBSTITUTE, do not remove. Removing the <img> killed the pixels but
      // never the box: every layout-bearing ancestor kept its `height` attr,
      // so a hero built as <td height="350"> left a 350px hole in the middle
      // of the message — which is what the owner was actually looking at
      // (P16, 2026-08-31). Keeping a blanked node lets the placeholder chip
      // and the alt text occupy the space instead, and lets the collapse pass
      // below recognise the container as empty.
      const area = declaredArea(node)
      if (area !== null && area <= TRACKER_MAX_AREA_PX) {
        // A 1x1 beacon is not a picture. It feeds the count and nothing else;
        // a chip for it would be noise where the sender wanted none.
        node.remove()
        return
      }
      // The original URL is deliberately NOT kept anywhere in the output.
      // "Show" re-sanitizes from the raw message, so nothing downstream ever
      // reads it back — parking a tracker URL in the rendered DOM would be
      // storing the thing this function exists to withhold.
      node.setAttribute('src', BLANK)
      node.setAttribute('class', 'wren-blocked')
      state.needsPostPass = true
      for (const attr of ['width', 'height', 'hspace', 'vspace', 'align']) {
        node.removeAttribute(attr)
      }
      return
    }
  }

  // A CSS url() can pull a remote image just as well as an <img> can — and not
  // only through `background`: list-style-image, mask-image, border-image,
  // content and cursor all fetch too, and the old `background`-only regex
  // never saw them.
  const style = node.getAttribute('style')
  if (style && /url\(/i.test(style)) {
    const remote = /url\(\s*['"]?\s*(?:https?:)?\/\//i.test(style)
    // Counted outside the withheld guard, because this is what the CSP is
    // keyed on and it has to stay true after Show is clicked.
    if (remote) state.remote++
    // Only strip what is actually withheld. The strip used to run
    // unconditionally, so clicking "Show" dropped the pill to zero and
    // revealed NOTHING for a mail whose imagery is CSS backgrounds — and it
    // destroyed safe data: backgrounds permanently, in both states.
    if (remote && !state.allowRemoteImages) {
      // Only a BACKGROUND counts toward the pill. cursor/mask/border-image are
      // stripped too, but the pill's sentence is about images the sender can
      // use to see that you opened the mail — counting a `cursor:url()` makes
      // the one number the privacy promise rests on say something untrue.
      if (/[a-z-]*background[a-z-]*\s*:[^;]*url\(/i.test(style)) state.blocked++
      let stripped = style.replace(CSS_FETCHING_PROPERTY, '')
      // The declaration that carried the image usually carried its height too
      // (`background-image:url(...);height:350px`), and dropping only the
      // former is exactly what leaves the hole.
      if (stripped !== style) stripped = stripped.replace(CSS_SIZING, '$1')
      node.setAttribute('style', stripped)
      state.needsPostPass = true
    }
  }

  if (tag === 'A') {
    const href = (node.getAttribute('href') ?? '').trim()
    // A RELATIVE href must never become a top navigation.
    //
    // Mail has no base URL, so a relative link is already meaningless as mail
    // — but a srcdoc iframe resolves it against the PARENT, which is the app's
    // own origin. Combined with `target="_top"` below, `<a href="?screenshot=1">`
    // in a received message was a same-origin top-level navigation that the
    // Rust guard allows because the host matches. Clicking an ordinary-looking
    // link in a stranger's email could reload the reader's real mail client
    // into a different mode.
    //
    // Absolute http(s)/mailto/tel links are untouched and still open
    // externally. This only removes a target for links that never had a
    // legitimate destination.
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')
    if (!absolute && !href.startsWith('#')) {
      node.removeAttribute('href')
      node.removeAttribute('target')
      node.setAttribute('rel', 'noopener noreferrer')
      return
    }
    // `_top`, not `_blank`: the message iframe blocks popups, and WebKit
    // never fires parent-attached click listeners inside a no-scripts
    // sandbox. A top navigation is the one path that works everywhere —
    // the browser build's click handler intercepts it, and in Tauri the
    // Rust on_navigation guard routes it to the system browser.
    node.setAttribute('target', '_top')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * Turn each blanked <img> into the chip the reader actually sees.
 *
 * A span rather than a styled <img>: `content: attr(alt)` on a replaced
 * element is the kind of trick that works in one engine and not the next, and
 * the alt text goes in as `textContent`, so a sender cannot smuggle markup
 * through their own alt attribute.
 *
 * It runs after sanitizing rather than inside the hook because replacing nodes
 * mid-traversal is how you get DOMPurify to walk a tree that no longer exists.
 */
function chipBlockedImages(root: ParentNode): void {
  for (const img of Array.from(root.querySelectorAll('img.wren-blocked'))) {
    const chip = img.ownerDocument.createElement('span')
    chip.className = 'wren-blocked'
    const alt = (img.getAttribute('alt') ?? '').trim()
    chip.textContent = alt || 'Image'
    img.replaceWith(chip)
  }
}

/**
 * Collapse containers that a blocked image left empty.
 *
 * Removing the pixels was never enough: mail lays heroes out as
 * `<td height="350">` or `<div style="height:350px">`, and those boxes keep
 * their height whether or not anything is inside them. That is the hole in the
 * middle of the message the owner reported (P16). A box that now has no text,
 * no surviving image and no explicit background is not a layout any more — it
 * is a gap — so its declared height comes off.
 *
 * Deliberately conservative: anything with visible text or a real image keeps
 * its sizing, because a wrong collapse here silently reflows a legitimate
 * newsletter, which is worse than the hole it is fixing.
 */
function collapseEmptyBoxes(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll('[height], [style]'))) {
    const style = el.getAttribute('style') ?? ''
    // Same anchored test as CSS_SIZING, so what is detected is exactly what
    // gets stripped. `line-height` is not a height.
    const hasHeight = el.hasAttribute('height') || /(^|[;\s])(?:min-)?height\s*:/i.test(style)
    if (!hasHeight) continue

    if ((el.textContent ?? '').trim() !== '') continue
    // A blanked placeholder does not count as content — it is what is left of
    // the thing that was withheld — but a real image does.
    const images = el.querySelectorAll('img, svg, image')
    if (Array.from(images).some((img) => !img.classList.contains('wren-blocked'))) continue
    // A box painting its own colour was doing more than holding an image.
    if (/background(-color)?\s*:\s*(?!none|transparent)/i.test(style)) continue

    el.removeAttribute('height')
    if (style) {
      const stripped = style.replace(CSS_SIZING, '$1')
      if (stripped.trim()) el.setAttribute('style', stripped)
      else el.removeAttribute('style')
    }
  }
}

export function sanitizeBody(html: string, opts: SanitizeOptions): SanitizeResult {
  state = { ...opts, blocked: 0, remote: 0, needsPostPass: false }
  // RETURN_DOM so the post-pass gets the tree DOMPurify already built, rather
  // than serializing and re-parsing it. "Does this box still contain anything"
  // needs a tree and cannot be asked of a string — but it does not need a
  // SECOND one, and a thread of twenty newsletters would otherwise pay twenty
  // extra full parses in one synchronous render.
  const root = DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR,
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: false,
    WHOLE_DOCUMENT: false,
    RETURN_DOM: true,
  }) as unknown as HTMLElement

  // Read the count out NOW. `state` is module scope shared with the hook, and
  // the post-pass below is a dozen lines away from where the value was made.
  const blocked = state.blocked
  const remote = state.remote

  // Gated on there being WORK, not merely on something having been blocked: a
  // 1x1 beacon, an SVG <image> and an unresolved cid: all bump the count while
  // leaving nothing for either pass to find.
  if (state.needsPostPass) {
    // Order matters: collapse while the blanked <img>s are still recognisable
    // as withheld, THEN swap them for chips. Reversed, a chip's own text would
    // make every container look occupied and nothing would collapse.
    collapseEmptyBoxes(root)
    chipBlockedImages(root)
  }

  return { html: root.innerHTML, blockedImages: blocked, remoteImages: remote }
}

/**
 * Wraps sanitized body HTML in a full document for the iframe's `srcdoc`.
 *
 * The body always renders on a light "paper" surface, in both themes. Mail is
 * authored against a white background and hard-codes its own text colours;
 * re-tinting it for dark mode either lies about the sender's design or leaves
 * dark-on-dark text. A sheet of paper inside the message card is the honest
 * option, and it is what every desktop client that does not rewrite mail does.
 */
export function buildSrcdoc(bodyHtml: string, opts?: { allowRemoteImages?: boolean }): string {
  // The CSP is a BACKSTOP, not the policy. The hook above is still what
  // decides what is blocked and what gets counted — but the hook works by
  // enumerating tags and properties, and enumeration is exactly what leaked
  // (protocol-relative srcs, SVG <image href>, <video poster>, and every CSS
  // url() that is not `background`). A default-src of 'none' does not care
  // what the markup is called, so anything the enumeration misses next time
  // still cannot reach the network.
  //
  // `img-src data:` covers the blocked-image placeholder and cid: attachments
  // resolved to data URLs. When the reader has clicked Show, https: joins it —
  // and only then.
  // http: as well as https:. `isRemote` treats both as remote-and-allowable,
  // so a CSP that permits only https: would let the sanitizer hand through an
  // http-only newsletter and then block it one layer down — which is defect 2's
  // exact symptom ("Show reveals nothing") wearing a different hat.
  const imgSrc = opts?.allowRemoteImages ? 'data: https: http:' : 'data:'
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    /* The paper's own margin: mail text must not touch the sheet's edge.
       Padding, not margin, so it is part of the measured scrollHeight. */
    padding: 14px 16px;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 15.5px;
    line-height: 24px;
    color: #191716;
    overflow-wrap: break-word;
    /* Mail is arbitrary third-party markup and will ask for weights the frame
       does not have. DIRECTION §4: never fake a weight — fail visibly. */
    font-synthesis: none;
    -webkit-font-smoothing: antialiased;
  }
  * { max-width: 100%; }
  /* A leading paragraph's own margin would stack on the body padding and
     read as a hole; same at the tail. */
  body > :first-child { margin-top: 0; }
  body > :last-child { margin-bottom: 0; }
  img { height: auto; }
  /* A withheld image, in place of the hole one used to leave. Hard-coded hex
     because the iframe cannot see the app's custom properties — which is why
     the link colour below is a literal too. These mirror --wren-radius-xs 6,
     --wren-surface-sunken and --wren-text-3 at their LIGHT values; the paper
     is always light, so there is no dark variant to keep in step.
     A flat inline chip, not a framed box: DIRECTION §10.2 bans decorative
     bars, and the point is to occupy a line, not to draw a picture frame. */
  .wren-blocked {
    display: inline-block;
    max-width: 100%;
    padding: 4px 8px;
    border-radius: 6px;
    background: #F0EDEC;
    color: #6F6D6B;
    font-size: 13px;
    line-height: 16px;
    vertical-align: baseline;
  }
  /* Links in third-party mail stay a conventional blue — the app's own hue-blue
     ink, NOT the coral accent: mail content is not Maru chrome, and the old
     value here was the retired indigo accent, not a link colour. */
  a { color: #145EC1; }
  table { border-collapse: collapse; }
  blockquote {
    margin: 0 0 16px;
    padding: 0 0 0 16px;
    border-left: 2px solid #E7E5E4;
    color: #5D5A59;
  }
</style></head><body>${bodyHtml}</body></html>`
}
