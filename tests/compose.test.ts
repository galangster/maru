// Composer rules: chip parsing and reply-recipient derivation. Both are pure
// functions in src/lib/compose.ts precisely so they can be pinned here.

import { describe, expect, it } from 'vitest'

import type { Attachment, EmailAddress } from '@/core/types'
import {
  carriedAttachments,
  dedupeAddresses,
  deriveRecipients,
  formatAddress,
  isEmail,
  parseAddress,
  parseAddresses,
  quoteOriginal,
  replySubject,
  type ReplySource,
} from '@/lib/compose'

const A = (email: string, name?: string): EmailAddress => (name ? { name, email } : { email })

describe('isEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isEmail('ada@example.com')).toBe(true)
    expect(isEmail('  ada.lovelace+mail@sub.example.co.uk  ')).toBe(true)
  })

  it('rejects fragments a user is still typing', () => {
    for (const bad of ['ada', 'ada@', '@example.com', 'ada@example', 'ada example.com', '']) {
      expect(isEmail(bad)).toBe(false)
    }
  })
})

describe('parseAddress', () => {
  it('reads a display name out of angle brackets', () => {
    expect(parseAddress('Ada Lovelace <ada@example.com>')).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })

  it('strips quotes around the display name', () => {
    expect(parseAddress('"Lovelace, Ada" <ada@example.com>')).toEqual({
      name: 'Lovelace, Ada',
      email: 'ada@example.com',
    })
  })

  it('accepts a bare address, with or without brackets', () => {
    expect(parseAddress('ada@example.com')).toEqual({ email: 'ada@example.com' })
    expect(parseAddress('<ada@example.com>')).toEqual({ email: 'ada@example.com' })
  })

  it('returns null for anything that is not an address', () => {
    expect(parseAddress('Ada Lovelace')).toBeNull()
    expect(parseAddress('Ada <not-an-email>')).toBeNull()
  })
})

describe('parseAddresses', () => {
  it('splits on comma, semicolon and newline', () => {
    const { addresses, invalid } = parseAddresses('a@x.com, b@x.com; c@x.com\nd@x.com')
    expect(addresses.map((a) => a.email)).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'])
    expect(invalid).toEqual([])
  })

  it('does not split a display name on its spaces', () => {
    const { addresses } = parseAddresses('Ada Lovelace <ada@x.com>, Alan Turing <alan@x.com>')
    expect(addresses).toEqual([
      { name: 'Ada Lovelace', email: 'ada@x.com' },
      { name: 'Alan Turing', email: 'alan@x.com' },
    ])
  })

  it('reports the fragments it could not read', () => {
    const { addresses, invalid } = parseAddresses('ada@x.com, nonsense, bob@')
    expect(addresses.map((a) => a.email)).toEqual(['ada@x.com'])
    expect(invalid).toEqual(['nonsense', 'bob@'])
  })

  it('ignores empty fragments and surrounding space', () => {
    const { addresses, invalid } = parseAddresses('  ,, ada@x.com ,  ')
    expect(addresses.map((a) => a.email)).toEqual(['ada@x.com'])
    expect(invalid).toEqual([])
  })

  it('deduplicates case-insensitively, keeping the first (named) form', () => {
    const { addresses } = parseAddresses('Ada <ada@x.com>, ADA@X.COM')
    expect(addresses).toEqual([{ name: 'Ada', email: 'ada@x.com' }])
  })
})

describe('formatAddress / dedupeAddresses', () => {
  it('round-trips a named address through parseAddress', () => {
    const address = A('ada@x.com', 'Ada Lovelace')
    expect(parseAddress(formatAddress(address))).toEqual(address)
  })

  it('prints a bare address without brackets', () => {
    expect(formatAddress(A('ada@x.com'))).toBe('ada@x.com')
  })

  it('keeps the first occurrence when deduplicating', () => {
    expect(dedupeAddresses([A('a@x.com', 'A'), A('A@X.com'), A('b@x.com')])).toEqual([
      { name: 'A', email: 'a@x.com' },
      { email: 'b@x.com' },
    ])
  })
})

const SELF = ['me@wren.test']

function source(over: Partial<ReplySource> = {}): ReplySource {
  return {
    from: A('sender@x.com', 'Sender'),
    to: [A('me@wren.test', 'Me'), A('other@x.com', 'Other')],
    cc: [A('cc@x.com')],
    replyTo: [],
    ...over,
  }
}

describe('deriveRecipients', () => {
  it('reply goes to the sender alone', () => {
    expect(deriveRecipients(source(), 'reply', SELF)).toEqual({
      to: [{ name: 'Sender', email: 'sender@x.com' }],
      cc: [],
    })
  })

  it('reply prefers Reply-To when the sender set one', () => {
    const message = source({ replyTo: [A('list@x.com', 'The List')] })
    expect(deriveRecipients(message, 'reply', SELF).to).toEqual([
      { name: 'The List', email: 'list@x.com' },
    ])
  })

  it('reply-all keeps the sender in To and everyone else in Cc, minus you', () => {
    const { to, cc } = deriveRecipients(source(), 'replyAll', SELF)
    expect(to.map((a) => a.email)).toEqual(['sender@x.com'])
    expect(cc.map((a) => a.email)).toEqual(['other@x.com', 'cc@x.com'])
  })

  it('reply-all never repeats the sender in Cc', () => {
    const message = source({ to: [A('sender@x.com'), A('me@wren.test')], cc: [A('sender@X.com')] })
    const { to, cc } = deriveRecipients(message, 'replyAll', SELF)
    expect(to.map((a) => a.email)).toEqual(['sender@x.com'])
    expect(cc).toEqual([])
  })

  it('strips every one of your addresses, not just the receiving one', () => {
    const message = source({ cc: [A('me@wren.test'), A('alias@wren.test'), A('cc@x.com')] })
    const { cc } = deriveRecipients(message, 'replyAll', ['me@wren.test', 'alias@wren.test'])
    expect(cc.map((a) => a.email)).toEqual(['other@x.com', 'cc@x.com'])
  })

  it('falls back to the original To when replying to your own message', () => {
    const message = source({ from: A('me@wren.test', 'Me'), to: [A('friend@x.com')], cc: [] })
    expect(deriveRecipients(message, 'reply', SELF).to.map((a) => a.email)).toEqual([
      'friend@x.com',
    ])
  })

  it('never returns an empty To for a reply, even talking to yourself', () => {
    const message = source({ from: A('me@wren.test'), to: [A('me@wren.test')], cc: [] })
    expect(deriveRecipients(message, 'reply', SELF).to.map((a) => a.email)).toEqual(['me@wren.test'])
  })

  it('forward starts with nobody addressed', () => {
    expect(deriveRecipients(source(), 'forward', SELF)).toEqual({ to: [], cc: [] })
  })
})

describe('replySubject', () => {
  it('adds one prefix', () => {
    expect(replySubject('Bike', 'reply')).toBe('Re: Bike')
    expect(replySubject('Bike', 'replyAll')).toBe('Re: Bike')
    expect(replySubject('Bike', 'forward')).toBe('Fwd: Bike')
  })

  it('does not stack prefixes', () => {
    expect(replySubject('Re: Bike', 'reply')).toBe('Re: Bike')
    expect(replySubject('re: Bike', 'replyAll')).toBe('re: Bike')
    expect(replySubject('Fwd: Bike', 'forward')).toBe('Fwd: Bike')
    expect(replySubject('FW: Bike', 'forward')).toBe('FW: Bike')
  })

  it('handles an empty subject', () => {
    expect(replySubject('   ', 'reply')).toBe('Re:')
  })
})

describe('quoteOriginal', () => {
  const at = () => 'Mon, 25 Aug 2026 06:30'
  const message = {
    from: A('sender@x.com', 'Sender'),
    to: [A('me@wren.test')],
    date: 0,
    subject: 'Bike',
    bodyHtml: '<p>Ready</p>',
    bodyText: 'Ready',
  }

  it('opens with two empty paragraphs so the caret has somewhere to land', () => {
    expect(quoteOriginal(message, 'reply', at).startsWith('<p></p><p></p>')).toBe(true)
  })

  it('quotes the original in a blockquote', () => {
    expect(quoteOriginal(message, 'reply', at)).toContain('<blockquote><p>Ready</p></blockquote>')
  })

  it('escapes the attribution line', () => {
    const html = quoteOriginal({ ...message, from: A('x@x.com', 'A <b>') }, 'reply', at)
    expect(html).toContain('A &lt;b&gt;')
    expect(html).not.toContain('<b>')
  })

  it('writes a forwarded-message header for forwards', () => {
    const html = quoteOriginal(message, 'forward', at)
    expect(html).toContain('Forwarded message')
    expect(html).toContain('Subject: Bike')
  })

  it('falls back to the plain-text body when there is no HTML', () => {
    const html = quoteOriginal({ ...message, bodyHtml: undefined }, 'reply', at)
    expect(html).toContain('<blockquote><p>Ready</p></blockquote>')
  })
})

describe('carriedAttachments', () => {
  const file = (over: Partial<Attachment> = {}): Attachment => ({
    id: 'att-1',
    messageId: 'm-9',
    filename: 'invoice-40812.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 88_000,
    inline: false,
    ...over,
  })

  const message = { id: 'm-9', attachments: [file()] }

  it('carries every attachment on a forward, by reference', () => {
    expect(carriedAttachments(message, 'forward', 'acct-1/t-7')).toEqual([
      {
        id: 'att-1',
        filename: 'invoice-40812.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 88_000,
        source: { threadKey: 'acct-1/t-7', messageId: 'm-9', attachmentId: 'att-1' },
      },
    ])
  })

  it('carries nothing on a reply or a reply-all', () => {
    expect(carriedAttachments(message, 'reply', 'acct-1/t-7')).toEqual([])
    expect(carriedAttachments(message, 'replyAll', 'acct-1/t-7')).toEqual([])
  })

  it('leaves inline parts behind — the quoted body already points at them', () => {
    const withLogo = {
      id: 'm-9',
      attachments: [file(), file({ id: 'att-2', filename: 'logo.png', inline: true })],
    }
    expect(carriedAttachments(withLogo, 'forward', 'acct-1/t-7').map((a) => a.id)).toEqual(['att-1'])
  })

  it('carries nothing when the message has no attachments', () => {
    expect(carriedAttachments({ id: 'm-9', attachments: [] }, 'forward', 'k')).toEqual([])
  })
})
