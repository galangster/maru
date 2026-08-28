// RFC 5322 / 2045-2047 message builder for users.messages.send.
//
// Gmail wants `raw`: a base64url-encoded RFC 822 message. Everything here is
// pure so the send path is testable without a network or a Platform.

import type { ComposeDraft, EmailAddress } from './types'

const CRLF = '\r\n'
const MAX_LINE = 76

// ---------------------------------------------------------------------------
// base64
// ---------------------------------------------------------------------------

function bytesToBinaryString(bytes: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return s
}

export function base64EncodeBytes(bytes: Uint8Array): string {
  return btoa(bytesToBinaryString(bytes))
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return base64EncodeBytes(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlEncodeText(text: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(text))
}

/** Splits a base64 blob into `width`-column lines, as RFC 2045 requires. */
export function wrapBase64(b64: string, width = MAX_LINE): string {
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += width) lines.push(b64.slice(i, i + width))
  return lines.join(CRLF)
}

// ---------------------------------------------------------------------------
// Header encoding
// ---------------------------------------------------------------------------

function isAscii(s: string): boolean {
  return /^[\x20-\x7E]*$/.test(s)
}

/** RFC 2047 B-encoding, applied only when the value needs it. */
export function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value
  return `=?UTF-8?B?${base64EncodeBytes(new TextEncoder().encode(value))}?=`
}

const SPECIALS = /[()<>@,;:\\".[\]]/

export function formatAddress(addr: EmailAddress): string {
  const name = addr.name?.trim()
  if (!name) return addr.email
  if (!isAscii(name)) return `${encodeHeaderValue(name)} <${addr.email}>`
  const display = SPECIALS.test(name) ? `"${name.replace(/(["\\])/g, '\\$1')}"` : name
  return `${display} <${addr.email}>`
}

export function formatAddressList(list: EmailAddress[]): string {
  return list.map(formatAddress).join(', ')
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** RFC 5322 date, always in UTC so the output is locale-independent. */
export function formatDate(epochMs: number): string {
  const d = new Date(epochMs)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${DAYS[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`
  )
}

// ---------------------------------------------------------------------------
// Quoted-printable
// ---------------------------------------------------------------------------

function hexEscape(byte: number): string {
  return `=${byte.toString(16).toUpperCase().padStart(2, '0')}`
}

/**
 * RFC 2045 §6.7. Encodes one logical line at a time so hard line breaks are
 * preserved, then soft-wraps each result at 76 columns including the `=`.
 */
export function quotedPrintableEncode(input: string): string {
  const encoder = new TextEncoder()
  const lines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []

  for (const line of lines) {
    const tokens: string[] = []
    const chars = [...line]
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      const isLast = i === chars.length - 1
      if (ch === ' ' || ch === '\t') {
        // Trailing whitespace must be escaped or transports will eat it.
        tokens.push(isLast ? hexEscape(ch === ' ' ? 0x20 : 0x09) : ch)
        continue
      }
      const code = ch.codePointAt(0)!
      if (code >= 0x21 && code <= 0x7e && ch !== '=') {
        tokens.push(ch)
        continue
      }
      for (const byte of encoder.encode(ch)) tokens.push(hexEscape(byte))
    }

    let current = ''
    const wrapped: string[] = []
    for (const token of tokens) {
      if (current.length + token.length > MAX_LINE - 1) {
        wrapped.push(current + '=')
        current = ''
      }
      current += token
    }
    wrapped.push(current)
    out.push(wrapped.join(CRLF))
  }

  return out.join(CRLF)
}

// ---------------------------------------------------------------------------
// HTML -> text
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

const BLOCK_CLOSE = /<\/(p|div|h[1-6]|blockquote|tr|table|ul|ol|section|article)\s*>/gi

/** Best-effort plain-text alternative derived from the composer's HTML. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(BLOCK_CLOSE, '\n\n')
    .replace(/<[^>]+>/g, '')

  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------------------------------------------------------------------------
// Message assembly
// ---------------------------------------------------------------------------

export interface BuildContext {
  fromEmail: string
  fromName?: string
  inReplyTo?: string
  references?: string
  /** Injectable for deterministic tests. */
  now?: number
  boundarySeed?: () => string
}

function makeBoundary(kind: string, seed: () => string): string {
  return `----=_wren_${kind}_${seed()}`
}

function defaultSeed(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  )
}

function textPart(mimeType: string, body: string, boundary: string): string {
  return [
    `--${boundary}`,
    `Content-Type: ${mimeType}; charset="UTF-8"`,
    'Content-Transfer-Encoding: quoted-printable',
    '',
    quotedPrintableEncode(body),
    '',
  ].join(CRLF)
}

function attachmentPart(
  att: { filename: string; mimeType: string; dataBase64: string },
  boundary: string,
): string {
  const name = encodeHeaderValue(att.filename)
  return [
    `--${boundary}`,
    `Content-Type: ${att.mimeType}; name="${name}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${name}"`,
    '',
    wrapBase64(att.dataBase64.replace(/\s+/g, '')),
    '',
  ].join(CRLF)
}

/**
 * Builds the full RFC 822 message and returns it base64url-encoded, ready for
 * `users.messages.send`. Replies must also carry `threadId` on the API call —
 * the headers alone are the documented mechanism, threadId is belt and braces.
 */
export function buildRawMessage(draft: ComposeDraft, ctx: BuildContext): string {
  const seed = ctx.boundarySeed ?? defaultSeed
  const altBoundary = makeBoundary('alt', seed)
  const hasAttachments = draft.attachments.length > 0
  const mixedBoundary = hasAttachments ? makeBoundary('mix', seed) : null

  const from: EmailAddress = { name: ctx.fromName, email: ctx.fromEmail }
  const headers: string[] = [`From: ${formatAddress(from)}`]
  if (draft.to.length) headers.push(`To: ${formatAddressList(draft.to)}`)
  if (draft.cc.length) headers.push(`Cc: ${formatAddressList(draft.cc)}`)
  if (draft.bcc.length) headers.push(`Bcc: ${formatAddressList(draft.bcc)}`)
  headers.push(`Subject: ${encodeHeaderValue(draft.subject)}`)
  headers.push(`Date: ${formatDate(ctx.now ?? Date.now())}`)
  headers.push('MIME-Version: 1.0')
  if (ctx.inReplyTo) headers.push(`In-Reply-To: ${ctx.inReplyTo}`)
  if (ctx.references) headers.push(`References: ${ctx.references}`)

  const alternative =
    textPart('text/plain', htmlToText(draft.bodyHtml), altBoundary) +
    textPart('text/html', draft.bodyHtml, altBoundary) +
    `--${altBoundary}--${CRLF}`

  let body: string
  if (mixedBoundary) {
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
    body =
      `--${mixedBoundary}${CRLF}` +
      `Content-Type: multipart/alternative; boundary="${altBoundary}"${CRLF}${CRLF}` +
      alternative +
      draft.attachments.map((a) => attachmentPart(a, mixedBoundary)).join('') +
      `--${mixedBoundary}--${CRLF}`
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`)
    body = alternative
  }

  return base64UrlEncodeText(headers.join(CRLF) + CRLF + CRLF + body)
}
