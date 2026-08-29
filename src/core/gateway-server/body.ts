// What an agent wrote, turned into the HTML a ComposeDraft carries.
//
// `ComposeDraft.bodyHtml` is HTML because that is what the composer produces
// and what `buildRawMessage` encodes. A model does not write HTML — it writes
// prose, and it writes Markdown whether or not it was asked to. So the draft
// tools take `body_markdown` or `body_text` and this file is the one place
// either becomes a body.
//
// The Markdown here is a **documented subset**, not a CommonMark engine. A
// full parser is a dependency and a much larger attack surface for one field
// on one tool; the subset below covers what a model actually emits in mail —
// paragraphs, breaks, lists, emphasis, code and links — and anything outside
// it survives as the literal characters the agent typed, which is the failure
// mode a reader can understand.
//
// SAFETY: every input is escaped *first*, and the inline patterns then run
// over already-escaped text. So no path exists by which a `<script>` an agent
// wrote reaches the message, and a link's href is additionally restricted to
// http, https and mailto. The human still sees the message in the approval
// queue before anything leaves the machine — but a body that could smuggle
// markup would make that review a lie.

import { escapeHtml, paragraphsToHtml } from '../../lib/compose'

/** Plain text: the composer's own paragraph rule, under this file's name. */
export const textToHtml = paragraphsToHtml

/** The subset, spelled out for the tool description and for the tests. */
export const MARKDOWN_SUBSET =
  'paragraphs, line breaks, - and 1. lists, > quotes, **bold**, *italic*, `code` and [text](https://…) links'

const SAFE_HREF = /^(https?:\/\/|mailto:)/i

/** Inline spans, applied to text that is already HTML-escaped. */
function inline(escaped: string): string {
  return (
    escaped
      // Code first: its contents must not then be read as emphasis.
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
        // `href` is escaped text, so `&amp;` is already safe in an attribute.
        const url = href.replace(/&amp;/g, '&')
        if (!SAFE_HREF.test(url)) return whole
        return `<a href="${escapeHtml(url)}">${label}</a>`
      })
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
  )
}

function listItems(lines: string[], strip: RegExp): string {
  return lines.map((line) => `<li>${inline(escapeHtml(line.replace(strip, '')))}</li>`).join('')
}

const BULLET = /^\s*[-*]\s+/
const ORDERED = /^\s*\d+[.)]\s+/
const QUOTE = /^\s*>\s?/

/** The subset above. Anything it does not recognise stays as literal text. */
export function markdownToHtml(markdown: string): string {
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const out: string[] = []

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '')
    if (lines.length === 0) continue

    if (lines.every((line) => BULLET.test(line))) {
      out.push(`<ul>${listItems(lines, BULLET)}</ul>`)
      continue
    }
    if (lines.every((line) => ORDERED.test(line))) {
      out.push(`<ol>${listItems(lines, ORDERED)}</ol>`)
      continue
    }
    if (lines.every((line) => QUOTE.test(line))) {
      const inner = lines.map((line) => line.replace(QUOTE, '')).join('\n')
      out.push(`<blockquote><p>${inline(escapeHtml(inner)).replace(/\n/g, '<br>')}</p></blockquote>`)
      continue
    }

    out.push(`<p>${inline(escapeHtml(lines.join('\n'))).replace(/\n/g, '<br>')}</p>`)
  }

  return out.join('')
}
