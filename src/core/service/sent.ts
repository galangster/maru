// What a just-sent message looks like locally.
//
// Neither service round-trips the message it has just sent: Gmail's send
// response carries an id, a threadId and labels and nothing else, and the demo
// service has no server at all. Both therefore build the local rows from the
// draft — which is the same arithmetic twice, and it drifted (one carried the
// thread's prior star, the other did not; one recomputed htmlToText per field).
// It is written once here and parameterised by the few things that genuinely
// differ: the ids, the clock and the RFC threading headers.

import { mergeParticipants } from '../gmail/mapping'
import { base64DecodedBytes, htmlToText } from '../mime'
import type { Account, Message, SendableDraft, Thread } from '../types'
import { threadKey } from '../types'

export interface SentContext {
  /** The sending account, already resolved. */
  account: Account
  /** Gmail's thread id for the sent message: the reply's, or a new one. */
  gmailThreadId: string
  messageId: string
  /** Send time, from the service's own clock. */
  date: number
  /** Labels Gmail reported, when it reported any. */
  labelIds?: string[]
  rfcMessageId?: string
  inReplyTo?: string
  references?: string
  /** Names an attachment row; the two services number them differently. */
  attachmentId: (index: number) => string
  /** The thread as it stands locally, when the send is a reply. */
  existingThread?: Thread | null
  /** The thread's messages as they stand locally, oldest first. */
  existingMessages?: Message[]
}

export interface SentRows {
  key: string
  message: Message
  /** Every message in the thread including the new one, oldest first. */
  messages: Message[]
  thread: Thread
}

export function sentRowsFor(draft: SendableDraft, ctx: SentContext): SentRows {
  const { account } = ctx
  const key = threadKey(account.id, ctx.gmailThreadId)
  const existingMessages = ctx.existingMessages ?? []
  const bodyText = htmlToText(draft.bodyHtml)

  const message: Message = {
    id: ctx.messageId,
    threadId: ctx.gmailThreadId,
    accountId: account.id,
    // The sender's NAME, never the account's label — issue #61. `senderName`
    // is undefined for an account that has not been given one, and
    // `displayName(addr)` falls back to the address, which is what the reading
    // pane already shows for any message that arrives without a name.
    from: { name: account.senderName, email: account.email },
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    replyTo: [],
    date: ctx.date,
    subject: draft.subject,
    snippet: bodyText.slice(0, 140),
    bodyHtml: draft.bodyHtml,
    bodyText,
    bodyState: 'full',
    labelIds: ctx.labelIds ?? ['SENT'],
    attachments: draft.attachments.map((a, i) => ({
      id: ctx.attachmentId(i),
      messageId: ctx.messageId,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: base64DecodedBytes(a.dataBase64),
      inline: false,
    })),
    rfcMessageId: ctx.rfcMessageId,
    references: ctx.references,
    inReplyTo: ctx.inReplyTo,
    unread: false,
    starred: false,
  }

  const messages = [...existingMessages.filter((m) => m.id !== message.id), message]
  const existing = ctx.existingThread ?? null

  const thread: Thread = {
    key,
    gmailThreadId: ctx.gmailThreadId,
    accountId: account.id,
    subject: existing?.subject ?? draft.subject,
    snippet: message.snippet,
    lastMessageAt: ctx.date,
    participants: mergeParticipants(existing ? existing.participants.slice() : [], [
      message.from,
      ...draft.to,
      ...draft.cc,
    ]),
    labelIds: [...new Set([...(existing?.labelIds ?? []), 'SENT'])],
    unread: false,
    starred: existing?.starred ?? false,
    messageCount: messages.length,
    hasAttachments: messages.some((m) => m.attachments.some((a) => !a.inline)),
  }

  return { key, message, messages, thread }
}

/** What the search index reads for a thread: every body it holds, joined. */
export function bodyTextOf(messages: Message[]): string {
  return messages.map((m) => m.bodyText ?? (m.bodyHtml ? htmlToText(m.bodyHtml) : '')).join(' ')
}
