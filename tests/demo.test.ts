import { describe, it, expect, beforeEach } from 'vitest'
import { DemoMailService } from '../src/core/service/demo'
import { THREAD_SPECS } from '../src/core/demo/fixtures'
import type { MailEvent } from '../src/core/types'

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0)

function service() {
  const svc = new DemoMailService({ now: NOW })
  const events: MailEvent[] = []
  svc.onEvent((e) => events.push(e))
  return { svc, events }
}

describe('fixtures', () => {
  it('ships roughly 45 threads across two accounts', async () => {
    const { svc } = service()
    expect(THREAD_SPECS.length).toBeGreaterThanOrEqual(43)
    expect(THREAD_SPECS.length).toBeLessThanOrEqual(50)
    const accounts = await svc.listAccounts()
    expect(accounts.map((a) => a.email)).toEqual(['nick@gmail.com', 'nick.galang@gmail.com'])
    expect(accounts.map((a) => a.displayName)).toEqual(['Personal', 'Work'])
    expect(accounts[0].color).not.toBe(accounts[1].color)
  })

  it('spreads every message inside the last 90 days', async () => {
    const { svc } = service()
    const threads = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    const ninetyDaysAgo = NOW - 90 * 24 * 3_600_000
    for (const t of threads) {
      expect(t.lastMessageAt).toBeGreaterThan(ninetyDaysAgo)
      expect(t.lastMessageAt).toBeLessThanOrEqual(NOW)
    }
    const spread = new Set(threads.map((t) => Math.floor((NOW - t.lastMessageAt) / (7 * 24 * 3_600_000))))
    expect(spread.size).toBeGreaterThan(4)
  })

  it('has multi-message conversations, unread mail, starred mail, sent and trash', async () => {
    const { svc } = service()
    const inbox = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    expect(inbox.filter((t) => t.messageCount >= 2).length).toBeGreaterThanOrEqual(8)
    expect(inbox.filter((t) => t.messageCount >= 4).length).toBeGreaterThanOrEqual(2)
    expect(inbox.filter((t) => t.unread).length).toBeGreaterThanOrEqual(6)
    expect(await svc.listThreads({ kind: 'unified', folder: 'starred' }, { limit: 500 })).not.toHaveLength(0)
    expect((await svc.listThreads({ kind: 'unified', folder: 'sent' }, { limit: 500 })).length).toBeGreaterThanOrEqual(5)
    expect(await svc.listThreads({ kind: 'unified', folder: 'trash' }, { limit: 500 })).toHaveLength(2)
  })

  it('carries exactly two threads that reference a remote image, for the blocker to block', async () => {
    const { svc } = service()
    const threads = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    let remote = 0
    for (const t of threads) {
      const messages = await svc.ensureBodies(t.key)
      if (messages.some((m) => /<img[^>]+src="https:\/\//.test(m.bodyHtml ?? ''))) remote++
    }
    expect(remote).toBe(2)
  })

  it('has attachment threads including a pdf invoice', async () => {
    const { svc } = service()
    const threads = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    const withAttachments = threads.filter((t) => t.hasAttachments)
    expect(withAttachments.length).toBeGreaterThanOrEqual(3)

    const order = threads.find((t) => t.subject.includes('HS-40812'))!
    const messages = await svc.ensureBodies(order.key)
    expect(messages[0].attachments[0]).toMatchObject({ filename: 'invoice-40812.pdf', mimeType: 'application/pdf' })
  })

  it('uses inline styles in newsletter bodies and never a style or script tag', async () => {
    const { svc } = service()
    const threads = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    for (const t of threads) {
      for (const m of await svc.ensureBodies(t.key)) {
        expect(m.bodyHtml).not.toMatch(/<script/i)
        expect(m.bodyHtml).not.toMatch(/<style/i)
      }
    }
  })
})

describe('views', () => {
  it('unifies the inbox across accounts, newest first, excluding sent and trash', async () => {
    const { svc } = service()
    const threads = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    const accounts = new Set(threads.map((t) => t.accountId))
    expect(accounts.size).toBe(2)
    for (let i = 1; i < threads.length; i++) {
      expect(threads[i - 1].lastMessageAt).toBeGreaterThanOrEqual(threads[i].lastMessageAt)
    }
    expect(threads.some((t) => t.labelIds.includes('TRASH'))).toBe(false)
    expect(threads.some((t) => t.labelIds.includes('SENT'))).toBe(false)
  })

  it('scopes an account view to one account and label', async () => {
    const { svc } = service()
    const [personal] = await svc.listAccounts()
    const threads = await svc.listThreads(
      { kind: 'account', accountId: personal.id, labelId: 'INBOX' },
      { limit: 500 },
    )
    expect(threads.length).toBeGreaterThan(0)
    expect(threads.every((t) => t.accountId === personal.id)).toBe(true)
  })

  it('pages with limit and before', async () => {
    const { svc } = service()
    const page1 = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 5 })
    expect(page1).toHaveLength(5)
    const page2 = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 5, before: page1[4].lastMessageAt })
    expect(page2[0].lastMessageAt).toBeLessThan(page1[4].lastMessageAt)
  })

  it('counts unread per view', async () => {
    const { svc } = service()
    const count = await svc.unreadCount({ kind: 'unified', folder: 'inbox' })
    const threads = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    expect(count).toBe(threads.filter((t) => t.unread).length)
  })

  it('lists system and user labels per account', async () => {
    const { svc } = service()
    const [personal] = await svc.listAccounts()
    const labels = await svc.listLabels(personal.id)
    expect(labels.some((l) => l.id === 'INBOX' && l.type === 'system')).toBe(true)
    expect(labels.some((l) => l.type === 'user')).toBe(true)
  })
})

describe('reading', () => {
  it('returns a thread with its messages oldest first', async () => {
    const { svc } = service()
    const threads = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    const conversation = threads.find((t) => t.messageCount >= 3)!
    const { thread, messages } = await svc.getThread(conversation.key)
    expect(thread.key).toBe(conversation.key)
    expect(messages.length).toBe(conversation.messageCount)
    for (let i = 1; i < messages.length; i++) expect(messages[i].date).toBeGreaterThanOrEqual(messages[i - 1].date)
  })

  it('resolves ensureBodies immediately with full bodies', async () => {
    const { svc } = service()
    const [first] = await svc.listThreads({ kind: 'unified', folder: 'inbox' })
    const messages = await svc.ensureBodies(first.key)
    expect(messages.every((m) => m.bodyState === 'full')).toBe(true)
    expect(messages[0].bodyHtml).toBeTruthy()
  })

  it('returns bytes for an attachment', async () => {
    const { svc } = service()
    const threads = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    const withAttachment = threads.find((t) => t.hasAttachments)!
    const messages = await svc.ensureBodies(withAttachment.key)
    const message = messages.find((m) => m.attachments.length > 0)!
    const bytes = await svc.getAttachment(withAttachment.key, message.id, message.attachments[0].id)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  it('rejects an unknown thread key', async () => {
    const { svc } = service()
    await expect(svc.getThread('nope/nope')).rejects.toThrow()
  })
})

describe('actions', () => {
  let ctx: ReturnType<typeof service>
  beforeEach(() => {
    ctx = service()
  })

  async function firstInbox() {
    const [t] = await ctx.svc.listThreads({ kind: 'unified', folder: 'inbox' })
    return t
  }

  it('stars and unstars, and emits threadsChanged each time', async () => {
    const t = await firstInbox()
    await ctx.svc.performAction({ type: 'star', threadKey: t.key })
    expect((await ctx.svc.getThread(t.key)).thread.starred).toBe(true)
    expect((await ctx.svc.listThreads({ kind: 'unified', folder: 'starred' }, { limit: 500 })).some((x) => x.key === t.key)).toBe(true)

    await ctx.svc.performAction({ type: 'unstar', threadKey: t.key })
    expect((await ctx.svc.getThread(t.key)).thread.starred).toBe(false)
    expect(ctx.events.filter((e) => e.type === 'threadsChanged')).toHaveLength(2)
  })

  it('marks read and unread on the thread and its messages', async () => {
    const inbox = await ctx.svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    const unread = inbox.find((t) => t.unread)!
    await ctx.svc.performAction({ type: 'markRead', threadKey: unread.key })
    const read = await ctx.svc.getThread(unread.key)
    expect(read.thread.unread).toBe(false)
    expect(read.messages.every((m) => !m.unread)).toBe(true)

    await ctx.svc.performAction({ type: 'markUnread', threadKey: unread.key })
    expect((await ctx.svc.getThread(unread.key)).thread.unread).toBe(true)
  })

  it('archives a thread out of the inbox but keeps it readable', async () => {
    const t = await firstInbox()
    await ctx.svc.performAction({ type: 'archive', threadKey: t.key })
    const inbox = await ctx.svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    expect(inbox.some((x) => x.key === t.key)).toBe(false)
    expect((await ctx.svc.getThread(t.key)).thread.key).toBe(t.key)
  })

  it('trashes and untrashes', async () => {
    const t = await firstInbox()
    await ctx.svc.performAction({ type: 'trash', threadKey: t.key })
    expect((await ctx.svc.listThreads({ kind: 'unified', folder: 'trash' }, { limit: 500 })).some((x) => x.key === t.key)).toBe(true)

    await ctx.svc.performAction({ type: 'untrash', threadKey: t.key })
    expect((await ctx.svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })).some((x) => x.key === t.key)).toBe(true)
  })

  it('rejects an action on a thread that does not exist', async () => {
    await expect(ctx.svc.performAction({ type: 'star', threadKey: 'nope/nope' })).rejects.toThrow()
  })
})

describe('send', () => {
  it('appends a new thread to sent', async () => {
    const { svc, events } = service()
    const [account] = await svc.listAccounts()
    const before = await svc.listThreads({ kind: 'unified', folder: 'sent' }, { limit: 500 })

    await svc.send({
      accountId: account.id,
      to: [{ name: 'Maya Ellison', email: 'maya@fernwood.dev' }],
      cc: [],
      bcc: [],
      subject: 'A brand new note',
      bodyHtml: '<p>Hello there</p>',
      attachments: [],
    })

    const after = await svc.listThreads({ kind: 'unified', folder: 'sent' }, { limit: 500 })
    expect(after.length).toBe(before.length + 1)
    expect(after[0].subject).toBe('A brand new note')
    expect(after[0].accountId).toBe(account.id)
    expect(events.some((e) => e.type === 'threadsChanged')).toBe(true)
  })

  it('fetches a carried attachment by reference and sends it with the mail', async () => {
    const { svc } = service()
    const [account] = await svc.listAccounts()
    const inbox = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    const withFile = inbox.find((t) => t.accountId === account.id && t.hasAttachments)!
    const { messages } = await svc.getThread(withFile.key)
    const carrier = messages.find((m) => m.attachments.some((a) => !a.inline))!
    const attachment = carrier.attachments.find((a) => !a.inline)!

    // What the composer hands over on a forward: a reference, no bytes.
    await svc.send({
      accountId: account.id,
      to: [{ email: 'maya@fernwood.dev' }],
      cc: [],
      bcc: [],
      subject: `Fwd: ${withFile.subject}`,
      bodyHtml: '<p>Passing this on.</p>',
      attachments: [
        {
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          source: {
            threadKey: withFile.key,
            messageId: carrier.id,
            attachmentId: attachment.id,
          },
        },
      ],
    })

    const sent = await svc.listThreads({ kind: 'unified', folder: 'sent' }, { limit: 500 })
    const forwarded = sent.find((t) => t.subject === `Fwd: ${withFile.subject}`)!
    expect(forwarded.hasAttachments).toBe(true)
    const rows = (await svc.getThread(forwarded.key)).messages
    const carried = rows[rows.length - 1].attachments
    expect(carried.map((a) => a.filename)).toEqual([attachment.filename])
    // The bytes were really fetched: the size comes from what came back, not
    // from the zero a dropped attachment would have measured.
    expect(carried[0].sizeBytes).toBeGreaterThan(0)
  })

  it('refuses a draft whose attachment has neither bytes nor a source', async () => {
    const { svc } = service()
    const [account] = await svc.listAccounts()
    await expect(
      svc.send({
        accountId: account.id,
        to: [{ email: 'maya@fernwood.dev' }],
        cc: [],
        bcc: [],
        subject: 'Nothing behind it',
        bodyHtml: '<p>.</p>',
        attachments: [{ filename: 'ghost.pdf', mimeType: 'application/pdf' }],
      }),
    ).rejects.toThrow(/ghost.pdf/)
  })

  it('appends a reply to the thread it answers', async () => {
    const { svc } = service()
    const inbox = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    const target = inbox.find((t) => t.messageCount >= 2)!
    const { messages } = await svc.getThread(target.key)

    await svc.send({
      accountId: target.accountId,
      to: [messages[messages.length - 1].from],
      cc: [],
      bcc: [],
      subject: `Re: ${target.subject}`,
      bodyHtml: '<p>Sounds good.</p>',
      attachments: [],
      reply: { threadKey: target.key, messageId: messages[messages.length - 1].id, mode: 'reply' },
    })

    const after = await svc.getThread(target.key)
    expect(after.messages).toHaveLength(target.messageCount + 1)
    expect(after.messages[after.messages.length - 1].bodyHtml).toBe('<p>Sounds good.</p>')
    expect(after.thread.messageCount).toBe(target.messageCount + 1)
  })

  it('makes a sent message findable by search', async () => {
    const { svc } = service()
    const [account] = await svc.listAccounts()
    await svc.send({
      accountId: account.id,
      to: [{ email: 'someone@example.org' }],
      cc: [],
      bcc: [],
      subject: 'Zephyrhills paperwork',
      bodyHtml: '<p>Attached.</p>',
      attachments: [],
    })
    expect((await svc.search('Zephyrhills')).map((t) => t.subject)).toEqual(['Zephyrhills paperwork'])
  })
})

describe('search', () => {
  it('finds a thread by subject and by sender', async () => {
    const { svc } = service()
    expect((await svc.search('walkthrough')).length).toBeGreaterThan(0)
    expect((await svc.search('Alderfly')).length).toBeGreaterThan(0)
  })

  it('returns nothing for a blank query', async () => {
    const { svc } = service()
    expect(await svc.search('  ')).toEqual([])
  })
})

describe('accounts', () => {
  it('adds a third fixture account with its own mail and emits accountsChanged', async () => {
    const { svc, events } = service()
    const added = await svc.addAccount()
    expect((await svc.listAccounts()).map((a) => a.id)).toHaveLength(3)
    expect(added.email).toBe('nick@fernwood.dev')

    const threads = await svc.listThreads({ kind: 'account', accountId: added.id, labelId: 'INBOX' }, { limit: 500 })
    expect(threads.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'accountsChanged')).toBe(true)
  })

  it('removes an account and its threads', async () => {
    const { svc } = service()
    const [personal] = await svc.listAccounts()
    await svc.removeAccount(personal.id)
    expect((await svc.listAccounts()).map((a) => a.id)).not.toContain(personal.id)
    const inbox = await svc.listThreads({ kind: 'unified', folder: 'inbox' }, { limit: 500 })
    expect(inbox.every((t) => t.accountId !== personal.id)).toBe(true)
  })
})

describe('settings and events', () => {
  it('returns defaults and merges a patch', async () => {
    const { svc } = service()
    expect(await svc.getSettings()).toMatchObject({ theme: 'system', imagePolicy: 'allow', pollIntervalSec: 60 })
    await svc.setSettings({ theme: 'dark' })
    expect((await svc.getSettings()).theme).toBe('dark')
  })

  it('stops delivering after unsubscribe', async () => {
    const { svc } = service()
    const seen: MailEvent[] = []
    const off = svc.onEvent((e) => seen.push(e))
    await svc.setSettings({ theme: 'light' })
    off()
    const [t] = await svc.listThreads({ kind: 'unified', folder: 'inbox' })
    await svc.performAction({ type: 'star', threadKey: t.key })
    expect(seen.filter((e) => e.type === 'threadsChanged')).toHaveLength(0)
  })

  it('emits a sync status on refresh so the UI can settle', async () => {
    const { svc, events } = service()
    await svc.refresh()
    expect(events.some((e) => e.type === 'syncStatus' && e.status.state === 'idle')).toBe(true)
  })
})
