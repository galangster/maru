// Pure Gmail JSON -> domain mapping. No I/O, no Platform: every function here
// is a total function of its arguments so the sync engine stays testable.

import type { Attachment, EmailAddress, Message, Thread } from '../types'
import { threadKey } from '../types'
import { decodeBase64UrlText, decodeRfc2047, parseAddressList } from '../mime'
import type { GmailMessage, GmailPart, GmailThread } from './types'

// The RFC 2047 decoder, the base64url codec and the address parser are the
// wire format, not a Gmail concern: core/mime.ts owns them alongside the
// encoders they invert. Re-exported here so the Gmail layer stays the one
// import site for everything that reads a Gmail payload.
export {
  decodeBase64Url,
  decodeBase64UrlText,
  decodeRfc2047,
  parseAddress,
  parseAddressList,
} from '../mime'

const LABEL_UNREAD = 'UNREAD'
const LABEL_STARRED = 'STARRED'
/** Location labels, not descriptive ones — see the union in mapGmailThread. */
const LABEL_TRASH = 'TRASH'
const LABEL_SPAM = 'SPAM'

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

  // TRASH and SPAM are not additive, and unioning them like every other label
  // made mail vanish.
  //
  // Every other Gmail label describes the thread as a whole: one important
  // message makes the conversation important, one unread message makes it
  // unread. These two describe a message's LOCATION, and a long conversation
  // routinely holds a few deleted replies while still sitting in the inbox.
  // Unioning them meant a single trashed message anywhere in the history
  // stamped TRASH on the thread — and because every non-trash view excludes
  // TRASH, the whole conversation disappeared from the inbox while its newest
  // message was plainly still in it. Found 2026-08-31 on the owner's own
  // mailbox: both messages he reported missing were threads whose newest
  // message carried INBOX and no TRASH, buried under replies he had deleted
  // weeks earlier.
  //
  // A thread is in the trash only when there is nothing left of it anywhere
  // else. `every` on an empty message list is vacuously true, which is why the
  // `labels.has` guard comes first — a thread with no messages must not
  // acquire a label none of them had.
  for (const id of [LABEL_TRASH, LABEL_SPAM]) {
    if (labels.has(id) && !ordered.every((m) => m.labelIds.includes(id))) labels.delete(id)
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
