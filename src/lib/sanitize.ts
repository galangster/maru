// Message-body sanitizing.
//
// Mail bodies are hostile input. Everything that renders one goes through
// here, and the result is only ever handed to a sandboxed iframe — never to
// dangerouslySetInnerHTML.
//
// Policy:
//   - scripts, forms, <style>, framing and metadata elements are removed
//   - inline `style` attributes survive, because that is how mail is designed
//   - remote (http/https) images are removed by default and counted, so the
//     reading pane can offer "Remote images blocked · Show"
//   - cid: images resolve against the message's inline attachments

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

/** A 1x1 fully transparent GIF. The blocked image keeps its box in the DOM so
 *  alt text and the placeholder chip have something to hang on, but fetches
 *  nothing. */
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

/** Declared area, when the markup states one. Tracking pixels are ~1x1. */
function declaredArea(node: Element): number | null {
  const w = Number.parseFloat(node.getAttribute('width') ?? '')
  const h = Number.parseFloat(node.getAttribute('height') ?? '')
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null
  return w * h
}

/** Below this, an image is a beacon and not a picture: no chip, just the count. */
const TRACKER_AREA = 64

/** Every CSS property that can fetch, not just `background`. */
const CSS_FETCHING_PROPERTY =
  /(?:[a-z-]*background[a-z-]*|list-style(?:-image)?|mask(?:-image)?|border-image(?:-source)?|content|cursor|src)\s*:[^;]*url\([^)]*\)[^;]*;?/gi

/** Sizing left behind on a container whose only content was a blocked image. */
const CSS_SIZING = /(?:min-)?height\s*:[^;]*;?/gi

let state: SanitizeOptions & { blocked: number } = { allowRemoteImages: false, blocked: 0 }

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof Element)) return

  // SVG's <image href> is allowlisted by DOMPurify and its tagName is `image`,
  // not `IMG` — so it went straight past the old check and fetched.
  const tag = node.tagName.toUpperCase()
  if (tag === 'IMAGE' || (tag === 'IMG' && node.hasAttribute('href'))) {
    const href = node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? ''
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
      if (area !== null && area <= TRACKER_AREA) {
        // A 1x1 beacon is not a picture. It feeds the count and nothing else;
        // a chip for it would be noise where the sender wanted none.
        node.remove()
        return
      }
      node.setAttribute('data-wren-blocked-src', src)
      node.setAttribute('src', BLANK)
      node.setAttribute('class', 'wren-blocked')
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
    // Only strip what is actually withheld. The strip used to run
    // unconditionally, so clicking "Show" dropped the pill to zero and
    // revealed NOTHING for a mail whose imagery is CSS backgrounds — and it
    // destroyed safe data: backgrounds permanently, in both states.
    if (remote && !state.allowRemoteImages) {
      state.blocked++
      let stripped = style.replace(CSS_FETCHING_PROPERTY, '')
      // The declaration that carried the image usually carried its height too
      // (`background-image:url(...);height:350px`), and dropping only the
      // former is exactly what leaves the hole.
      if (stripped !== style) stripped = stripped.replace(CSS_SIZING, '')
      node.setAttribute('style', stripped)
    }
  }

  if (node.tagName === 'A') {
    // `_top`, not `_blank`: the message iframe blocks popups, and WebKit
    // never fires parent-attached click listeners inside a no-scripts
    // sandbox. A top navigation is the one path that works everywhere —
    // the browser build's click handler intercepts it, and in Tauri the
    // Rust on_navigation guard routes it to the system browser.
    node.setAttribute('target', '_top')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function sanitizeBody(html: string, opts: SanitizeOptions): SanitizeResult {
  state = { ...opts, blocked: 0 }
  const clean = DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR,
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: false,
    WHOLE_DOCUMENT: false,
  })
  return { html: clean, blockedImages: state.blocked }
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
export function buildSrcdoc(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
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
