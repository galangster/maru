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
]

const FORBID_ATTR = ['srcset', 'ping', 'formaction', 'background', 'usemap']

let state: SanitizeOptions & { blocked: number } = { allowRemoteImages: false, blocked: 0 }

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof Element)) return

  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') ?? ''
    if (src.startsWith('cid:')) {
      const resolved = state.inlineImages?.get(src.slice(4).replace(/^<|>$/g, ''))
      if (resolved) node.setAttribute('src', resolved)
      else node.remove()
      return
    }
    if (/^https?:/i.test(src) && !state.allowRemoteImages) {
      state.blocked++
      node.remove()
      return
    }
  }

  // A CSS background can pull a remote image just as well as an <img> can.
  const style = node.getAttribute('style')
  if (style && /url\(/i.test(style)) {
    const stripped = style.replace(/[a-z-]*background[a-z-]*\s*:[^;]*url\([^)]*\)[^;]*;?/gi, '')
    if (/url\(\s*['"]?https?:/i.test(style) && !state.allowRemoteImages) state.blocked++
    node.setAttribute('style', stripped)
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
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 15.5px;
    line-height: 24px;
    color: #1A1E28;
    overflow-wrap: break-word;
    /* Mail is arbitrary third-party markup and will ask for weights the frame
       does not have. DIRECTION §4: never fake a weight — fail visibly. */
    font-synthesis: none;
    -webkit-font-smoothing: antialiased;
  }
  * { max-width: 100%; }
  img { height: auto; }
  /* Links in third-party mail stay a conventional blue — the app's own hue-blue
     ink, NOT the coral accent: mail content is not Maru chrome, and the old
     value here was the retired indigo accent, not a link colour. */
  a { color: #145EC1; }
  table { border-collapse: collapse; }
  blockquote {
    margin: 0 0 16px;
    padding: 0 0 0 16px;
    border-left: 2px solid #DDE0E6;
    color: #565B66;
  }
</style></head><body>${bodyHtml}</body></html>`
}
