// RFC 5322 / 2045-2047 codec: the message builder for users.messages.send,
// and the matching decoders the Gmail mapping reads headers with.
//
// This file is the canonical wire-format pair. `formatAddress`/`parseAddress`
// here are inverses over what Gmail actually sends: the parser accepts
// anything an RFC 5322 header can hold and never drops it, and the formatter
// re-encodes it. `lib/compose.ts` keeps a *separate*, deliberately strict
// parser for the composer's chip input, where an unparseable fragment must be
// rejected rather than accepted verbatim — see the note there.
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

/** base64url (RFC 4648 §5) -> bytes. Works in Node and in a WebView. */
export function decodeBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

const utf8 = new TextDecoder('utf-8')

export function decodeBase64UrlText(input: string): string {
  return utf8.decode(decodeBase64Url(input))
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

// ---------------------------------------------------------------------------
// Header decoding (RFC 2047)
// ---------------------------------------------------------------------------

function decodeCharset(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase()).decode(bytes)
  } catch {
    return utf8.decode(bytes)
  }
}

function decodeQEncoded(text: string, charset: string): string {
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '_') {
      bytes.push(0x20)
    } else if (c === '=' && i + 2 < text.length) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(text.charCodeAt(i))
    }
  }
  return decodeCharset(new Uint8Array(bytes), charset)
}

/**
 * Decodes RFC 2047 encoded-words. Whitespace *between* two encoded words is
 * dropped, per the spec, so a name split across words rejoins cleanly.
 */
export function decodeRfc2047(input: string): string {
  if (!input.includes('=?')) return input
  const pattern = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g
  let out = ''
  let last = 0
  let previousWasEncoded = false
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    const between = input.slice(last, match.index)
    if (!(previousWasEncoded && between.trim() === '')) out += between
    const [, charset, encoding, text] = match
    out +=
      encoding.toLowerCase() === 'b'
        ? decodeCharset(decodeBase64Url(text), charset)
        : decodeQEncoded(text, charset)
    last = match.index + match[0].length
    previousWasEncoded = true
  }
  out += input.slice(last)
  return out
}

// ---------------------------------------------------------------------------
// Address parsing — the inverse of formatAddress below
// ---------------------------------------------------------------------------

/** Splits an address header on top-level commas (quotes and <> are respected). */
export function splitAddressList(header: string): string[] {
  const parts: string[] = []
  let current = ''
  let inQuotes = false
  let inAngle = false
  for (let i = 0; i < header.length; i++) {
    const c = header[i]
    if (c === '"' && header[i - 1] !== '\\') inQuotes = !inQuotes
    else if (c === '<' && !inQuotes) inAngle = true
    else if (c === '>' && !inQuotes) inAngle = false
    if (c === ',' && !inQuotes && !inAngle) {
      parts.push(current)
      current = ''
      continue
    }
    current += c
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

export function parseAddress(raw: string): EmailAddress | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const angle = trimmed.match(/^(.*)<([^>]*)>\s*$/)
  if (angle) {
    let name = decodeRfc2047(angle[1].trim()).trim()
    if (name.startsWith('"') && name.endsWith('"') && name.length > 1) name = name.slice(1, -1)
    name = name.replace(/\\"/g, '"').trim()
    const email = angle[2].trim()
    if (!email) return null
    return name ? { name, email } : { email }
  }
  return { email: trimmed }
}

export function parseAddressList(header: string | undefined): EmailAddress[] {
  if (!header) return []
  const out: EmailAddress[] = []
  for (const chunk of splitAddressList(header)) {
    const addr = parseAddress(chunk)
    if (addr) out.push(addr)
  }
  return out
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
