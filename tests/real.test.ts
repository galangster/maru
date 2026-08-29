import { describe, it, expect, beforeEach } from 'vitest'
import { RealMailService, MissingOAuthClientError, type MailGmailClient } from '../src/core/service/real'
import { Store } from '../src/core/store/db'
import { HttpError } from '../src/core/gmail/limiter'
import { NodePlatform } from './helpers/node-platform'
import { makeAccount, makeMessage, makeThread } from './fixtures/domain'
import type { MailEvent } from '../src/core/types'
import type { GmailMessage, GmailThread } from '../src/core/gmail/types'

class FakeClient implements MailGmailClient {
  modifyCalls: { id: string; add: string[]; remove: string[] }[] = []
  trashed: string[] = []
  untrashed: string[] = []
  sent: { raw: string; threadId?: string }[] = []
  failWith: Error | null = null

  private gate: Promise<void> | null = null
  private releaseGate: () => void = () => {}

  /** Parks every write until releaseWrites() is called. */
  holdWrites(): void {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve
    })
  }

  releaseWrites(): void {
    this.gate = null
    this.releaseGate()
  }

  private async guard<T>(value: T): Promise<T> {
    if (this.gate) await this.gate
    if (this.failWith) throw this.failWith
    return value
  }

  async profile() {
    return { emailAddress: 'nick@gmail.com', historyId: '1000' }
  }
  async listLabels() {
    return [{ id: 'INBOX', name: 'INBOX', type: 'system' as const }]
  }
  async listThreads() {
    return { threads: [] }
  }
  async batchGetThreads(): Promise<GmailThread[]> {
    return []
  }
  async batchGetMessages(ids: string[]): Promise<GmailMessage[]> {
    return ids.map((id) => ({
      id,
      threadId: 't-1',
      labelIds: ['INBOX'],
      internalDate: '1755000000000',
      payload: {
        mimeType: 'text/html',
        headers: [{ name: 'Subject', value: 'Tuesday walkthrough' }],
        body: { size: 10, data: Buffer.from('<p>hydrated</p>').toString('base64url') },
      },
    }))
  }
  async listHistory() {
    return { historyId: '1000' }
  }

  async modifyThread(id: string, labels: { addLabelIds?: string[]; removeLabelIds?: string[] }) {
    this.modifyCalls.push({ id, add: labels.addLabelIds ?? [], remove: labels.removeLabelIds ?? [] })
    return this.guard<GmailThread>({ id })
  }
  async trashThread(id: string) {
    this.trashed.push(id)
    return this.guard<GmailThread>({ id })
  }
  async untrashThread(id: string) {
    this.untrashed.push(id)
    return this.guard<GmailThread>({ id })
  }
  async sendMessage(raw: string, threadId?: string) {
    this.sent.push({ raw, threadId })
    return this.guard<GmailMessage>({ id: 'sent-1', threadId: threadId ?? 'sent-thread-1', labelIds: ['SENT'] })
  }
  async getAttachment() {
    return new Uint8Array([9, 9, 9])
  }
}

function decodeRaw(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64').toString('utf8')
}

async function harness(opts: { seed?: boolean } = {}) {
  const platform = new NodePlatform()
  const store = await Store.open(platform)
  const client = new FakeClient()
  const events: MailEvent[] = []

  if (opts.seed !== false) {
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread({ labelIds: ['INBOX', 'UNREAD'], unread: true })])
    await store.upsertMessages([makeMessage({ labelIds: ['INBOX', 'UNREAD'], unread: true, rfcMessageId: '<root@x>' })])
    await platform.secretSet(
      'wren:account:acct-1',
      JSON.stringify({ refreshToken: 'rt-1', accessToken: 'at-1', expiresAt: Date.now() + 3_600_000, clientId: 'cid' }),
    )
    await store.setSettings({ googleClientId: 'cid', googleClientSecret: 'csecret' })
  }

  const svc = await RealMailService.create({
    platform,
    store,
    autoStart: false,
    createClient: () => client,
    runAuthFlow: async () => ({
      email: 'new@gmail.com',
      historyId: '2000',
      tokens: { accessToken: 'at-new', refreshToken: 'rt-new', expiresAt: Date.now() + 3_600_000 },
    }),
  })
  svc.onEvent((e) => events.push(e))
  return { platform, store, client, svc, events }
}

describe('addAccount', () => {
  it('refuses to start without a Google client id and secret', async () => {
    const { store, svc } = await harness({ seed: false })
    await store.setSettings({ googleClientId: undefined, googleClientSecret: undefined })
    await expect(svc.addAccount()).rejects.toBeInstanceOf(MissingOAuthClientError)
  })

  it('stores the account, persists the refresh token and announces the change', async () => {
    const { platform, store, svc, events } = await harness()
    const account = await svc.addAccount()

    expect(account.email).toBe('new@gmail.com')
    expect(account.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect((await store.listAccounts()).map((a) => a.email)).toContain('new@gmail.com')

    const saved = JSON.parse(platform.secrets.get(`wren:account:${account.id}`)!)
    expect(saved).toMatchObject({ refreshToken: 'rt-new', clientId: 'cid' })
    expect(events.some((e) => e.type === 'accountsChanged')).toBe(true)
  })

  it('gives the second account a different palette colour', async () => {
    const { svc } = await harness()
    const added = await svc.addAccount()
    const existing = (await svc.listAccounts()).find((a) => a.id !== added.id)!
    expect(added.color).not.toBe(existing.color)
  })

  it('refuses to add the same address twice', async () => {
    const { svc } = await harness()
    await svc.addAccount()
    await expect(svc.addAccount()).rejects.toThrow(/already/i)
  })
})

describe('optimistic actions', () => {
  let ctx: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => {
    ctx = await harness()
  })

  it('applies the change locally and emits before Gmail answers', async () => {
    const { client, store, svc, events } = ctx
    client.holdWrites()

    const pending = svc.performAction({ type: 'star', threadKey: 'acct-1/t-1' })
    // The optimistic half is several awaits deep — a transaction and a flag
    // write — so drain the queue until the announcement lands instead of
    // guessing a tick count. The Gmail write is still parked, which is what
    // makes this a test of "local first" rather than of timing.
    for (let i = 0; i < 500 && events.length === 0; i++) await Promise.resolve()

    expect((await store.getThread('acct-1/t-1'))?.starred).toBe(true)
    expect(events.filter((e) => e.type === 'threadsChanged')).toHaveLength(1)

    client.releaseWrites()
    await pending
    expect(client.modifyCalls).toEqual([{ id: 't-1', add: ['STARRED'], remove: [] }])
  })

  it('reverts the thread and surfaces the error when Gmail rejects the change', async () => {
    const { client, store, svc, events } = ctx
    client.failWith = new HttpError(403, 'Forbidden', 'insufficientPermissions', 'https://x')

    await expect(svc.performAction({ type: 'archive', threadKey: 'acct-1/t-1' })).rejects.toBeInstanceOf(HttpError)

    const thread = await store.getThread('acct-1/t-1')
    expect(thread?.labelIds.sort()).toEqual(['INBOX', 'UNREAD'])
    expect(thread?.unread).toBe(true)
    expect(events.filter((e) => e.type === 'threadsChanged')).toHaveLength(2)
    expect(events.filter((e) => e.type === 'syncStatus').at(-1)).toMatchObject({
      status: { state: 'error', accountId: 'acct-1' },
    })
  })

  it('reverts the messages as well as the thread', async () => {
    const { client, store, svc } = ctx
    client.failWith = new HttpError(500, 'Server Error', '', 'https://x')
    await expect(svc.performAction({ type: 'markRead', threadKey: 'acct-1/t-1' })).rejects.toThrow()
    expect((await store.listMessages('acct-1/t-1'))[0].unread).toBe(true)
  })

  it('uses the dedicated trash and untrash endpoints', async () => {
    const { client, svc } = ctx
    await svc.performAction({ type: 'trash', threadKey: 'acct-1/t-1' })
    await svc.performAction({ type: 'untrash', threadKey: 'acct-1/t-1' })
    expect(client.trashed).toEqual(['t-1'])
    expect(client.untrashed).toEqual(['t-1'])
    expect(client.modifyCalls).toHaveLength(0)
  })

  it('archives by removing INBOX', async () => {
    const { client, store, svc } = ctx
    await svc.performAction({ type: 'archive', threadKey: 'acct-1/t-1' })
    expect(client.modifyCalls).toEqual([{ id: 't-1', add: [], remove: ['INBOX'] }])
    expect((await store.listThreads({ kind: 'unified', folder: 'inbox' }))).toEqual([])
  })

  it('rejects an action on an unknown thread', async () => {
    await expect(ctx.svc.performAction({ type: 'star', threadKey: 'acct-1/nope' })).rejects.toThrow()
  })
})

describe('send', () => {
  it('builds MIME, sends it, and inserts the message locally under SENT', async () => {
    const { client, store, svc, events } = await harness()
    await svc.send({
      accountId: 'acct-1',
      to: [{ name: 'Maya Ellison', email: 'maya@fernwood.dev' }],
      cc: [],
      bcc: [],
      subject: 'A brand new note',
      bodyHtml: '<p>Hello there</p>',
      attachments: [],
    })

    expect(client.sent).toHaveLength(1)
    const raw = decodeRaw(client.sent[0].raw)
    expect(raw).toContain('From: Personal <nick@gmail.com>')
    expect(raw).toContain('Subject: A brand new note')

    const sentThreads = await store.listThreads({ kind: 'unified', folder: 'sent' })
    expect(sentThreads).toHaveLength(1)
    expect(sentThreads[0].subject).toBe('A brand new note')
    expect(events.some((e) => e.type === 'threadsChanged')).toBe(true)
  })

  it('sets threadId and the reply headers when answering a thread', async () => {
    const { client, store, svc } = await harness()
    await svc.send({
      accountId: 'acct-1',
      to: [{ email: 'maya@fernwood.dev' }],
      cc: [],
      bcc: [],
      subject: 'Re: Tuesday walkthrough',
      bodyHtml: '<p>Sounds good.</p>',
      attachments: [],
      reply: { threadKey: 'acct-1/t-1', messageId: 'm-1', mode: 'reply' },
    })

    expect(client.sent[0].threadId).toBe('t-1')
    const raw = decodeRaw(client.sent[0].raw)
    expect(raw).toContain('In-Reply-To: <root@x>')
    expect(raw).toContain('References: <root@x>')

    const messages = await store.listMessages('acct-1/t-1')
    expect(messages).toHaveLength(2)
    expect(messages[1].labelIds).toContain('SENT')
  })

  it('propagates a send failure without inserting anything locally', async () => {
    const { client, store, svc } = await harness()
    client.failWith = new HttpError(400, 'Bad Request', 'invalidArgument', 'https://x')
    await expect(
      svc.send({
        accountId: 'acct-1',
        to: [{ email: 'maya@fernwood.dev' }],
        cc: [],
        bcc: [],
        subject: 'Doomed',
        bodyHtml: '<p>x</p>',
        attachments: [],
      }),
    ).rejects.toBeInstanceOf(HttpError)
    expect(await store.listThreads({ kind: 'unified', folder: 'sent' })).toEqual([])
  })
})

describe('reads', () => {
  it('serves views, labels, unread counts and threads from the store', async () => {
    const { svc } = await harness()
    expect((await svc.listThreads({ kind: 'unified', folder: 'inbox' })).map((t) => t.key)).toEqual(['acct-1/t-1'])
    expect(await svc.unreadCount({ kind: 'unified', folder: 'inbox' })).toBe(1)
    const { thread, messages } = await svc.getThread('acct-1/t-1')
    expect(thread.key).toBe('acct-1/t-1')
    expect(messages).toHaveLength(1)
  })

  it('hydrates bodies through the sync engine', async () => {
    const { svc } = await harness()
    const messages = await svc.ensureBodies('acct-1/t-1')
    expect(messages[0].bodyState).toBe('full')
    expect(messages[0].bodyHtml).toBe('<p>hydrated</p>')
  })

  it('fetches attachment bytes', async () => {
    const { svc } = await harness()
    expect(Array.from(await svc.getAttachment('acct-1/t-1', 'm-1', 'att-1'))).toEqual([9, 9, 9])
  })

  it('searches the local index, which is built from the store on startup', async () => {
    const { svc } = await harness()
    expect((await svc.search('walkthrough')).map((t) => t.key)).toEqual(['acct-1/t-1'])
    expect(await svc.search('  ')).toEqual([])
  })

  it('keeps the index in step with an action', async () => {
    const { svc } = await harness()
    await svc.performAction({ type: 'trash', threadKey: 'acct-1/t-1' })
    const hits = await svc.search('walkthrough')
    expect(hits[0].labelIds).toContain('TRASH')
  })
})

describe('removeAccount', () => {
  it('drops the stored rows and the keychain entry', async () => {
    const { platform, store, svc } = await harness()
    await svc.removeAccount('acct-1')
    expect(await store.listAccounts()).toEqual([])
    expect(platform.secrets.has('wren:account:acct-1')).toBe(false)
    expect(await svc.listThreads({ kind: 'unified', folder: 'inbox' })).toEqual([])
    expect(await svc.search('walkthrough')).toEqual([])
  })
})

describe('settings', () => {
  it('reads and patches settings through the store', async () => {
    const { svc } = await harness()
    await svc.setSettings({ theme: 'dark', pollIntervalSec: 30 })
    expect(await svc.getSettings()).toMatchObject({ theme: 'dark', pollIntervalSec: 30, googleClientId: 'cid' })
  })
})
