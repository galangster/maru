// Pure Gmail JSON -> domain mapping. No I/O, no Platform: every function here
// is a total function of its arguments so the sync engine stays testable.

import type { Attachment, EmailAddress, Message, Thread } from '../types'
import { threadKey } from '../types'
import type { GmailMessage, GmailPart, GmailThread } from './types'

const LABEL_UNREAD = 'UNREAD'
const LABEL_STARRED = 'STARRED'

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Header decoding (RFC 2047)
// ---------------------------------------------------------------------------

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

function decodeCharset(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase()).decode(bytes)
  } catch {
    return utf8.decode(bytes)
  }
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
// Address parsing
// ---------------------------------------------------------------------------

/** Splits an address header on top-level commas (quotes and <> are respected). */
function splitAddressList(header: string): string[] {
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

// ---------------------------------------------------------------------------
// Payload walking
// ---------------------------------------------------------------------------

export function headerValue(part: GmailPart | undefined, name: string): string | undefined {
  const headers = part?.headers
  if (!headers) return undefined
  const lower = name.toLowerCase()
  for (const h of headers) if (h.name.toLowerCase() === lower) return h.value
  return undefined
}

function baseMimeType(part: GmailPart): string {
  return (part.mimeType ?? '').split(';')[0].trim().toLowerCase()
}

function isAttachmentPart(part: GmailPart): boolean {
  if (part.body?.attachmentId) return true
  if (part.filename && part.filename.length > 0) return true
  const disposition = headerValue(part, 'Content-Disposition') ?? ''
  return disposition.trim().toLowerCase().startsWith('attachment')
}

interface WalkResult {
  html?: string
  text?: string
  attachments: Attachment[]
}

function walkPayload(messageId: string, part: GmailPart | undefined, acc: WalkResult): void {
  if (!part) return
  const mime = baseMimeType(part)

  if (isAttachmentPart(part)) {
    const disposition = (headerValue(part, 'Content-Disposition') ?? '').trim().toLowerCase()
    const rawContentId = headerValue(part, 'Content-ID')
    const contentId = rawContentId ? rawContentId.trim().replace(/^<|>$/g, '') : undefined
    acc.attachments.push({
      id: part.body?.attachmentId ?? '',
      messageId,
      filename: decodeRfc2047(part.filename ?? ''),
      mimeType: mime || 'application/octet-stream',
      sizeBytes: part.body?.size ?? 0,
      inline: disposition.startsWith('inline') || (!disposition && !!contentId),
      contentId,
    })
    // An attachment never contributes to the readable body.
    return
  }

  const data = part.body?.data
  if (data) {
    if (mime === 'text/html' && acc.html === undefined) acc.html = decodeBase64UrlText(data)
    else if (mime === 'text/plain' && acc.text === undefined) acc.text = decodeBase64UrlText(data)
  }

  for (const child of part.parts ?? []) walkPayload(messageId, child, acc)
}

// ---------------------------------------------------------------------------
// Message / Thread mapping
// ---------------------------------------------------------------------------

function messageDate(raw: GmailMessage): number {
  if (raw.internalDate) {
    const n = Number(raw.internalDate)
    if (Number.isFinite(n) && n > 0) return n
  }
  const header = headerValue(raw.payload, 'Date')
  if (header) {
    const parsed = Date.parse(header)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

export function mapGmailMessage(accountId: string, raw: GmailMessage): Message {
  const labelIds = raw.labelIds ?? []
  const acc: WalkResult = { attachments: [] }
  walkPayload(raw.id, raw.payload, acc)

  return {
    id: raw.id,
    threadId: raw.threadId,
    accountId,
    from: parseAddressList(headerValue(raw.payload, 'From'))[0] ?? { email: '' },
    to: parseAddressList(headerValue(raw.payload, 'To')),
    cc: parseAddressList(headerValue(raw.payload, 'Cc')),
    bcc: parseAddressList(headerValue(raw.payload, 'Bcc')),
    replyTo: parseAddressList(headerValue(raw.payload, 'Reply-To')),
    date: messageDate(raw),
    subject: decodeRfc2047(headerValue(raw.payload, 'Subject') ?? ''),
    snippet: raw.snippet ?? '',
    bodyHtml: acc.html,
    bodyText: acc.text,
    bodyState: acc.html !== undefined || acc.text !== undefined ? 'full' : 'metadata',
    labelIds,
    attachments: acc.attachments,
    rfcMessageId: headerValue(raw.payload, 'Message-ID'),
    references: headerValue(raw.payload, 'References'),
    inReplyTo: headerValue(raw.payload, 'In-Reply-To'),
    unread: labelIds.includes(LABEL_UNREAD),
    starred: labelIds.includes(LABEL_STARRED),
  }
}

/** Adds addresses to `into`, keeping first-seen order and one row per inbox. */
export function mergeParticipants(into: EmailAddress[], addresses: EmailAddress[]): EmailAddress[] {
  const seen = new Set(into.map((p) => p.email.toLowerCase()))
  for (const addr of addresses) {
    const key = addr.email.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    into.push(addr)
  }
  return into
}

export function mapGmailThread(accountId: string, raw: GmailThread, messages: Message[]): Thread {
  const ordered = messages.slice().sort((a, b) => a.date - b.date)
  const latest = ordered[ordered.length - 1]
  const first = ordered[0]

  const labels = new Set<string>()
  const participants: EmailAddress[] = []
  let hasAttachments = false

  for (const m of ordered) {
    for (const id of m.labelIds) labels.add(id)
    mergeParticipants(participants, [m.from, ...m.to, ...m.cc])
    if (m.attachments.some((a) => !a.inline)) hasAttachments = true
  }

  return {
    key: threadKey(accountId, raw.id),
    gmailThreadId: raw.id,
    accountId,
    subject: first?.subject ?? '',
    snippet: latest?.snippet ?? raw.snippet ?? '',
    lastMessageAt: latest?.date ?? 0,
    participants,
    labelIds: [...labels],
    unread: ordered.some((m) => m.unread),
    starred: ordered.some((m) => m.starred),
    messageCount: ordered.length,
    hasAttachments,
  }
}
