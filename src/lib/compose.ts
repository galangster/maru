// Pure composer logic: address parsing, reply-recipient derivation, subject
// prefixes and the quoted original.
//
// Nothing here touches React, the DOM or MailService, so every rule the
// composer depends on is unit-testable in plain Node — see tests/compose.test.ts.

import type { AttachmentSource, EmailAddress, Message } from '@/core/types'

export type ReplyMode = 'reply' | 'replyAll' | 'forward'

/**
 * Deliberately permissive. This validates *shape*, not deliverability: the
 * point is to reject "nick@" and "hello world" while a chip is being typed,
 * not to re-implement RFC 5322. The server is the authority on the rest.
 */
const EMAIL_SHAPE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>".]{2,}$/

export function isEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim())
}

export interface ParsedAddresses {
  addresses: EmailAddress[]
  /** Fragments that looked like an attempt at an address and were not one. */
  invalid: string[]
}

/**
 * Splits a pasted or typed fragment into chips.
 *
 * Separators are comma, semicolon and newline — never a bare space, because
 * `Ada Lovelace <ada@example.com>` is one address, not three.
 */
export function parseAddresses(input: string): ParsedAddresses {
  const addresses: EmailAddress[] = []
  const invalid: string[] = []

  for (const raw of input.split(/[,;\n]+/)) {
    const piece = raw.trim()
    if (piece === '') continue
    const parsed = parseAddress(piece)
    if (parsed) addresses.push(parsed)
    else invalid.push(piece)
  }

  return { addresses: dedupeAddresses(addresses), invalid }
}

/** `Ada Lovelace <ada@example.com>`, `<ada@example.com>` or `ada@example.com`. */
export function parseAddress(input: string): EmailAddress | null {
  const piece = input.trim()
  const angled = /^(.*)<([^<>]+)>$/.exec(piece)
  if (angled) {
    const email = angled[2].trim()
    if (!isEmail(email)) return null
    const name = angled[1].trim().replace(/^["']|["']$/g, '').trim()
    return name ? { name, email } : { email }
  }
  return isEmail(piece) ? { email: piece } : null
}

export function formatAddress(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email
}

/** Case-insensitive on the address, first occurrence wins (it has the name). */
export function dedupeAddresses(list: EmailAddress[]): EmailAddress[] {
  const seen = new Set<string>()
  const out: EmailAddress[] = []
  for (const address of list) {
    const key = address.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(address)
  }
  return out
}

function without(list: EmailAddress[], emails: Set<string>): EmailAddress[] {
  return list.filter((a) => !emails.has(a.email.toLowerCase()))
}

function lowerSet(emails: string[]): Set<string> {
  return new Set(emails.map((e) => e.toLowerCase()))
}

/** The subset of a Message the recipient rules actually read. */
export type ReplySource = Pick<Message, 'from' | 'to' | 'cc' | 'replyTo'>

export interface ReplyRecipients {
  to: EmailAddress[]
  cc: EmailAddress[]
}

/**
 * Who a reply goes to.
 *
 *   reply     — the sender, minus you
 *   replyAll  — the sender in To; everyone else who saw it in Cc; minus you
 *   forward   — nobody; the user picks
 *
 * "The sender" is Reply-To when the message carries one, which is how mailing
 * lists and no-reply senders ask to be answered. When stripping yourself would
 * leave nothing — replying to your own sent mail — the original To stands in,
 * because an empty To is never what the user meant.
 */
export function deriveRecipients(
  message: ReplySource,
  mode: ReplyMode,
  selfEmails: string[],
): ReplyRecipients {
  if (mode === 'forward') return { to: [], cc: [] }

  const self = lowerSet(selfEmails)
  const sender = message.replyTo.length > 0 ? message.replyTo : [message.from]

  let to = without(dedupeAddresses(sender), self)
  if (to.length === 0) to = without(dedupeAddresses(message.to), self)
  if (to.length === 0) to = dedupeAddresses(sender)

  if (mode === 'reply') return { to, cc: [] }

  const already = lowerSet([...selfEmails, ...to.map((a) => a.email)])
  const cc = without(dedupeAddresses([...message.to, ...message.cc]), already)
  return { to, cc }
}

/** `Re:` / `Fwd:`, added once. An existing prefix of either kind is kept. */
export function replySubject(subject: string, mode: ReplyMode): string {
  const base = subject.trim()
  const prefix = mode === 'forward' ? 'Fwd:' : 'Re:'
  const existing = mode === 'forward' ? /^(fwd|fw):/i : /^re:/i
  if (existing.test(base)) return base
  return base ? `${prefix} ${base}` : prefix
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The subset of a Message the quote builder reads. */
export type QuoteSource = Pick<
  Message,
  'from' | 'to' | 'date' | 'subject' | 'bodyHtml' | 'bodyText'
>

/**
 * Plain text as message HTML: a blank line starts a paragraph, a single
 * newline is a break, everything is escaped.
 *
 * Exported because the agent gateway composes bodies too (`body_text` on the
 * draft tools), and two functions that both decide what a blank line means
 * would eventually disagree about it in one of the two places.
 */
export function paragraphsToHtml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function quotedBody(message: QuoteSource): string {
  if (message.bodyHtml) return message.bodyHtml
  return paragraphsToHtml(message.bodyText ?? '')
}

function addressLine(list: EmailAddress[]): string {
  return escapeHtml(list.map(formatAddress).join(', '))
}

/**
 * The original, quoted, with two empty paragraphs above it so the caret lands
 * on blank space instead of against the quote — the one thing every mail
 * client gets right and is immediately noticed when it is missing.
 *
 * `formatDate` is injected so a frozen capture clock and a live one agree.
 */
export function quoteOriginal(
  message: QuoteSource,
  mode: ReplyMode,
  formatDate: (ts: number) => string,
): string {
  const spacer = '<p></p><p></p>'
  const body = quotedBody(message)

  if (mode === 'forward') {
    const header = [
      '<p>---------- Forwarded message ----------</p>',
      `<p>From: ${addressLine([message.from])}<br>`,
      `Date: ${escapeHtml(formatDate(message.date))}<br>`,
      `Subject: ${escapeHtml(message.subject)}<br>`,
      `To: ${addressLine(message.to)}</p>`,
    ].join('')
    return `${spacer}${header}<blockquote>${body}</blockquote>`
  }

  const attribution = `<p>On ${escapeHtml(formatDate(message.date))}, ${addressLine([
    message.from,
  ])} wrote:</p>`
  return `${spacer}${attribution}<blockquote>${body}</blockquote>`
}

/** An attachment a new draft carries from the message it answers. */
export interface CarriedAttachment {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  source: AttachmentSource
}

/** The subset of a Message the carry rule reads. */
export type CarrySource = Pick<Message, 'id' | 'attachments'>

/**
 * The attachments a new draft carries from the message it answers.
 *
 *   forward   — all of them
 *   reply     — none
 *   replyAll  — none
 *
 * Gmail's rule, and the right one: a forward is usually done *for* the
 * attachment, and a reply goes back to the person who already has the file.
 *
 * Inline parts are left behind. They are the `cid:` images the quoted body
 * already points at, and carrying them without their Content-ID headers would
 * bolt a copy of every signature logo onto the forward as a visible file.
 *
 * The bytes are not read here. Each entry names where they live and the send
 * path fetches them — see `AttachmentSource`.
 */
export function carriedAttachments(
  message: CarrySource,
  mode: ReplyMode,
  threadKey: string,
): CarriedAttachment[] {
  if (mode !== 'forward') return []
  return message.attachments
    .filter((attachment) => !attachment.inline)
    .map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      source: { threadKey, messageId: message.id, attachmentId: attachment.id },
    }))
}

/** The subset of a draft the send gate reads. */
export type SendGateSource = { accountId: string; to: EmailAddress[] }

/**
 * Why this draft cannot be sent yet, or null when it can.
 *
 * A sentence rather than a boolean, because a disabled control that does not
 * say why is the one place in Maru that explains nothing (issue 7). The same
 * string is the button's tooltip, the line beside it, and what a screen reader
 * hears — one answer, not three.
 *
 * Recipients are asked about first: it is the case a person actually hits, and
 * the account resolves itself the moment there is one to resolve.
 */
export function sendBlockReason(draft: SendGateSource): string | null {
  if (draft.to.length === 0) return 'Add a recipient to send'
  if (!draft.accountId) return 'Pick an account to send from'
  return null
}

export const ATTACHMENT_WARN_BYTES = 20 * 1024 * 1024

export function totalBytes(sizes: number[]): number {
  return sizes.reduce((sum, n) => sum + n, 0)
}
