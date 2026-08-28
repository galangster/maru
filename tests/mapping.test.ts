import { describe, it, expect } from 'vitest'
import { mapGmailMessage, mapGmailThread, parseAddressList } from '../src/core/gmail/mapping'
import {
  SIMPLE_ALTERNATIVE,
  NESTED_WITH_ATTACHMENTS,
  PLAIN_ONLY_ENCODED,
  THREAD_THREE_MESSAGES,
} from './fixtures/gmail'

const ACCOUNT = 'acct-1'

describe('parseAddressList', () => {
  it('splits on commas that are outside quoted display names', () => {
    expect(parseAddressList('Nick Galang <nick@gmail.com>, "Ellison, Dana" <dana@fernwood.dev>')).toEqual([
      { name: 'Nick Galang', email: 'nick@gmail.com' },
      { name: 'Ellison, Dana', email: 'dana@fernwood.dev' },
    ])
  })

  it('accepts a bare address with no display name', () => {
    expect(parseAddressList('ops@fernwood.dev')).toEqual([{ email: 'ops@fernwood.dev' }])
  })

  it('decodes RFC 2047 encoded display names', () => {
    expect(parseAddressList('=?UTF-8?B?TsOpaWxsIMOTIENvbm5vcg==?= <neall@example.org>')).toEqual([
      { name: 'Néill Ó Connor', email: 'neall@example.org' },
    ])
  })

  it('returns an empty list for an empty header', () => {
    expect(parseAddressList('')).toEqual([])
  })
})

describe('mapGmailMessage', () => {
  it('prefers the text/html part and keeps the text/plain alternative', () => {
    const m = mapGmailMessage(ACCOUNT, SIMPLE_ALTERNATIVE)
    expect(m.bodyHtml).toBe('<div dir="ltr">Thanks for the update &mdash; see you Tuesday.</div>')
    expect(m.bodyText).toBe('Thanks for the update - see you Tuesday.\n')
    expect(m.bodyState).toBe('full')
  })

  it('maps identity, addresses and threading headers', () => {
    const m = mapGmailMessage(ACCOUNT, SIMPLE_ALTERNATIVE)
    expect(m.id).toBe('m-simple-1')
    expect(m.threadId).toBe('t-simple')
    expect(m.accountId).toBe(ACCOUNT)
    expect(m.subject).toBe('Re: Tuesday walkthrough')
    expect(m.from).toEqual({ name: 'Maya Ellison', email: 'maya@fernwood.dev' })
    expect(m.to).toEqual([
      { name: 'Nick Galang', email: 'nick@gmail.com' },
      { name: 'Ellison, Dana', email: 'dana@fernwood.dev' },
    ])
    expect(m.cc).toEqual([{ email: 'ops@fernwood.dev' }])
    expect(m.bcc).toEqual([])
    expect(m.replyTo).toEqual([{ name: 'Maya Ellison', email: 'maya+reply@fernwood.dev' }])
    expect(m.rfcMessageId).toBe('<CA+abc123@mail.fernwood.dev>')
    expect(m.inReplyTo).toBe('<CA+prev999@mail.fernwood.dev>')
    expect(m.references).toBe('<CA+root000@mail.fernwood.dev> <CA+prev999@mail.fernwood.dev>')
    expect(m.date).toBe(1755000000000)
  })

  it('derives unread and starred from label membership', () => {
    const unread = mapGmailMessage(ACCOUNT, SIMPLE_ALTERNATIVE)
    expect(unread.unread).toBe(true)
    expect(unread.starred).toBe(false)

    const starred = mapGmailMessage(ACCOUNT, NESTED_WITH_ATTACHMENTS)
    expect(starred.unread).toBe(false)
    expect(starred.starred).toBe(true)
  })

  it('walks nested multiparts to find the html body', () => {
    const m = mapGmailMessage(ACCOUNT, NESTED_WITH_ATTACHMENTS)
    expect(m.bodyHtml).toBe('<p>Your order is on its way. <img src="cid:logo-1"></p>')
    expect(m.bodyText).toBe('Your order is on its way.')
  })

  it('collects inline and regular attachments with contentId stripped of angle brackets', () => {
    const m = mapGmailMessage(ACCOUNT, NESTED_WITH_ATTACHMENTS)
    expect(m.attachments).toEqual([
      {
        id: 'att-logo-1',
        messageId: 'm-nested-1',
        filename: 'logo.png',
        mimeType: 'image/png',
        sizeBytes: 1180,
        inline: true,
        contentId: 'logo-1',
      },
      {
        id: 'att-invoice-1',
        messageId: 'm-nested-1',
        filename: 'invoice-40812.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 88231,
        inline: false,
      },
    ])
  })

  it('falls back to text/plain when no html part exists, and decodes encoded headers', () => {
    const m = mapGmailMessage(ACCOUNT, PLAIN_ONLY_ENCODED)
    expect(m.bodyHtml).toBeUndefined()
    expect(m.bodyText).toBe('Sending the notes over.\nBest,\nN')
    expect(m.subject).toBe('Café notes')
    expect(m.from).toEqual({ name: 'Néill Ó Connor', email: 'neall@example.org' })
    expect(m.attachments).toEqual([])
  })

  it('marks a metadata-format message (no body data anywhere) as metadata', () => {
    const m = mapGmailMessage(ACCOUNT, THREAD_THREE_MESSAGES.messages[0])
    expect(m.bodyState).toBe('metadata')
    expect(m.bodyHtml).toBeUndefined()
    expect(m.bodyText).toBeUndefined()
    expect(m.snippet).toBe('Can we move the walkthrough?')
  })
})

describe('mapGmailThread', () => {
  it('summarises a thread from its messages', () => {
    const messages = THREAD_THREE_MESSAGES.messages.map((m) => mapGmailMessage(ACCOUNT, m))
    const t = mapGmailThread(ACCOUNT, THREAD_THREE_MESSAGES, messages)

    expect(t.key).toBe('acct-1/t-simple')
    expect(t.gmailThreadId).toBe('t-simple')
    expect(t.accountId).toBe(ACCOUNT)
    expect(t.messageCount).toBe(3)
    // Subject comes from the first message; snippet and time from the latest.
    expect(t.subject).toBe('Tuesday walkthrough')
    expect(t.snippet).toBe('Thanks for the update &mdash; see you Tuesday')
    expect(t.lastMessageAt).toBe(1755000000000)
    expect(t.unread).toBe(true)
    expect(t.starred).toBe(false)
    expect(t.hasAttachments).toBe(false)
    expect(t.labelIds.slice().sort()).toEqual(['IMPORTANT', 'INBOX', 'UNREAD'])
  })

  it('collects deduplicated participants in first-seen order', () => {
    const messages = THREAD_THREE_MESSAGES.messages.map((m) => mapGmailMessage(ACCOUNT, m))
    const t = mapGmailThread(ACCOUNT, THREAD_THREE_MESSAGES, messages)
    expect(t.participants.map((p) => p.email)).toEqual([
      'nick@gmail.com',
      'maya@fernwood.dev',
      'dana@fernwood.dev',
      'ops@fernwood.dev',
    ])
  })

  it('flags attachments when any message carries a non-inline attachment', () => {
    const m = mapGmailMessage(ACCOUNT, NESTED_WITH_ATTACHMENTS)
    const t = mapGmailThread(ACCOUNT, { id: 't-nested', historyId: '1', messages: [NESTED_WITH_ATTACHMENTS] }, [m])
    expect(t.hasAttachments).toBe(true)
    expect(t.starred).toBe(true)
  })
})
