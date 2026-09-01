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
  const clientBindings: { accountId: string; clientId: string; clientSecret?: string }[] = []

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
    createClient: (accountId, clientId, clientSecret) => {
      clientBindings.push({ accountId, clientId, clientSecret })
      return client
    },
    runAuthFlow: async () => ({
      email: 'new@gmail.com',
      historyId: '2000',
      tokens: { accessToken: 'at-new', refreshToken: 'rt-new', expiresAt: Date.now() + 3_600_000 },
    }),
  })
  svc.onEvent((e) => events.push(e))
  return { platform, store, client, svc, events, clientBindings }
}

describe('addAccount', () => {
  it('refuses to start without a Google client id', async () => {
    const { store, svc } = await harness({ seed: false })
    await store.setSettings({ googleClientId: undefined, googleClientSecret: undefined })
    await expect(svc.addAccount()).rejects.toBeInstanceOf(MissingOAuthClientError)
  })

  it('accepts a custom desktop client without a secret', async () => {
    const { store, svc } = await harness({ seed: false })
    await store.setSettings({ googleClientId: 'public-client', googleClientSecret: undefined })
    await expect(svc.addAccount()).resolves.toMatchObject({ email: 'new@gmail.com' })
  })

  it('stores the account, persists the refresh token and announces the change', async () => {
    const { platform, store, svc, events } = await harness()
    const account = await svc.addAccount()

    expect(account.email).toBe('new@gmail.com')
    expect(account.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect((await store.listAccounts()).map((a) => a.email)).toContain('new@gmail.com')

    const saved = JSON.parse(platform.secrets.get(`wren:account:${account.id}`)!)
    expect(saved).toMatchObject({ refreshToken: 'rt-new', clientId: 'cid', source: 'custom' })
    expect(events.some((e) => e.type === 'accountsChanged')).toBe(true)
  })

  it('attaches an existing account with its issuing client instead of current settings', async () => {
    const { clientBindings } = await harness()
    expect(clientBindings[0]).toEqual({
      accountId: 'acct-1',
      clientId: 'cid',
      clientSecret: 'csecret',
    })
  })

  it('gives the second account a different palette colour', async () => {
    const { svc } = await harness()
    const added = await svc.addAccount()
    const existing = (await svc.listAccounts()).find((a) => a.id !== added.id)!
    expect(added.color).not.toBe(existing.color)
  })

  it('replays the last sync status to a late subscriber', async () => {
    // Startup failures fire before the UI can subscribe; the service retains
    // the last status per account and replays it on onEvent.
    const { svc } = await harness()
    await svc.addAccount()
    ;(svc as unknown as { emit: (e: unknown) => void }).emit({
      type: 'syncStatus',
      status: { accountId: 'late', state: 'error', error: 'boom' },
    })
    const seen: unknown[] = []
    svc.onEvent((e) => {
      if (e.type === 'syncStatus') seen.push(e.status)
    })
    expect(seen).toContainEqual({ accountId: 'late', state: 'error', error: 'boom' })
  })

  it('re-links instead of duplicating when the same address signs in again', async () => {
    // The recovery path for an expired grant (P4): same email, fresh tokens,
    // same account — never a duplicate, never an error.
    const { svc } = await harness()
    const first = await svc.addAccount()
    const again = await svc.addAccount()
    expect(again.id).toBe(first.id)
    expect((await svc.listAccounts()).filter((a) => a.email === first.email)).toHaveLength(1)
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
    // WebCrypto completes on an event-loop task. The Gmail write stays parked,
    // so the assertion still proves that the local change happens first.
    for (let i = 0; i < 50 && events.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

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
    // And NOT a syncStatus. A refused archive is not a verdict on the
    // account's sync: the rollback above is the recovery, and this rethrows so
    // the caller can say so. Emitting `error` here — untyped, so every reader
    // took it for a network problem — painted the whole account failed until
    // the next poll tick, and put "Sign in again" under a healthy account.
    expect(events.filter((e) => e.type === 'syncStatus')).toHaveLength(0)
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

  it('modifyLabels applies user labels through the same modify endpoint', async () => {
    const { client, store, svc } = ctx
    await svc.modifyLabels('acct-1/t-1', {
      addLabelIds: ['Label_receipts'],
      removeLabelIds: [],
    })
    expect(client.modifyCalls).toEqual([{ id: 't-1', add: ['Label_receipts'], remove: [] }])
    expect((await store.getThread('acct-1/t-1'))?.labelIds).toContain('Label_receipts')
  })

  it('modifyLabels reverts the thread verbatim when Gmail rejects it', async () => {
    const { client, store, svc, events } = ctx
    client.failWith = new HttpError(403, 'Forbidden', 'insufficientPermissions', 'https://x')
    await expect(
      svc.modifyLabels('acct-1/t-1', { addLabelIds: ['Label_receipts'], removeLabelIds: [] }),
    ).rejects.toBeInstanceOf(HttpError)
    const thread = await store.getThread('acct-1/t-1')
    expect(thread?.labelIds.sort()).toEqual(['INBOX', 'UNREAD'])
    // See performAction above: the rollback is the recovery, not a sync verdict.
    expect(events.filter((e) => e.type === 'syncStatus')).toHaveLength(0)
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

describe('startup order', () => {
  it('does not read every thread before bringing accounts up', async () => {
    // P19. `allThreads()` shared a Promise.all with the two reads the account
    // loop needs, so NO account began syncing until every thread had been read
    // and decrypted — measured at 1.5s and 6.2s on a real 3607-thread mailbox,
    // on every launch, before Maru asked Google for anything.
    //
    // The gate is ordering, not duration: assert that attach happens without
    // allThreads having been called. A timing assertion would be flaky on CI
    // and would not say what broke.
    const platform = new NodePlatform()
    const store = await Store.open(platform)
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread({})])
    await platform.secretSet(
      'wren:account:acct-1',
      JSON.stringify({ refreshToken: 'rt-1', accessToken: 'at-1', expiresAt: Date.now() + 3_600_000, clientId: 'cid' }),
    )
    await store.setSettings({ googleClientId: 'cid', googleClientSecret: 'csecret' })

    const order: string[] = []
    const realAllThreads = store.allThreads.bind(store)
    store.allThreads = async () => {
      order.push('allThreads')
      return realAllThreads()
    }

    await RealMailService.create({
      platform,
      store,
      // autoStart true is the production path — the one that used to block.
      // The fake client keeps the engine from touching a network.
      autoStart: true,
      createClient: () => {
        order.push('attach')
        return new FakeClient()
      },
      runAuthFlow: async () => {
        throw new Error('not used')
      },
    })

    expect(order[0], `expected attach before allThreads, got ${order.join(' → ')}`).toBe('attach')
  })
})

describe('sync status', () => {
  it('keeps lastSyncAt across a failure so the UI can say how stale mail is', async () => {
    // The engine writes lastSyncAt only on success. Merging it at the emitter
    // rather than in each subscriber is what lets a component that mounts
    // AFTER the failure — and gets a replay — see the same value the sidebar
    // has held since boot. "Stopped a minute ago" and "stopped six days ago"
    // are the whole difference between waiting and acting.
    const { svc, events } = await harness()
    const emit = (svc as unknown as { emit: (e: MailEvent) => void }).emit.bind(svc)

    emit({ type: 'syncStatus', status: { accountId: 'acct-1', state: 'idle', lastSyncAt: 1000 } })
    emit({ type: 'syncStatus', status: { accountId: 'acct-1', state: 'error', error: 'timeout' } })

    const last = events.filter((e) => e.type === 'syncStatus').at(-1)
    expect(last).toMatchObject({ status: { state: 'error', lastSyncAt: 1000 } })

    // And a late subscriber agrees, rather than seeing lastSyncAt undefined.
    const replayed: MailEvent[] = []
    svc.onEvent((e) => replayed.push(e))
    expect(replayed.filter((e) => e.type === 'syncStatus').at(-1)).toMatchObject({
      status: { state: 'error', lastSyncAt: 1000 },
    })
  })

  it('an explicit lastSyncAt still wins over the carried one', async () => {
    const { svc, events } = await harness()
    const emit = (svc as unknown as { emit: (e: MailEvent) => void }).emit.bind(svc)
    emit({ type: 'syncStatus', status: { accountId: 'acct-1', state: 'idle', lastSyncAt: 1000 } })
    emit({ type: 'syncStatus', status: { accountId: 'acct-1', state: 'idle', lastSyncAt: 2000 } })
    expect(events.filter((e) => e.type === 'syncStatus').at(-1)).toMatchObject({
      status: { lastSyncAt: 2000 },
    })
  })

  it('refresh brings up an account that has no runtime', async () => {
    // `runtimes` is populated only by attach(), so an account the service
    // never attached was skipped by refresh() entirely — which made the
    // "Try again" button beside its own error row a control that did nothing:
    // it disabled, it re-enabled, and no request was made.
    const { store, svc, events } = await harness()
    const runtimes = (svc as unknown as { runtimes: Map<string, unknown> }).runtimes
    await store.upsertAccount(makeAccount({ id: 'acct-2', email: 'second@gmail.com' }))
    expect(runtimes.has('acct-2'), 'precondition: not attached yet').toBe(false)

    await svc.refresh()

    expect(runtimes.has('acct-2'), 'refresh must attach it, not skip it').toBe(true)
    expect(
      events.filter((e) => e.type === 'syncStatus').some((e) => e.status.accountId === 'acct-2'),
      'and it must report a status, so the row stops saying nothing',
    ).toBe(true)
  })

  it('reports the account it cannot bring up, rather than failing silently', async () => {
    // With no Google client configured, attach() throws before any network
    // call. That has to surface as this account's own status — and as the
    // `noClient` kind, so the copy does not blame Google for a local gap.
    const { store, svc, events } = await harness()
    await store.setSettings({ googleClientId: '', googleClientSecret: '' })
    await store.upsertAccount(makeAccount({ id: 'acct-3', email: 'third@gmail.com' }))

    await svc.refresh()

    const status = events
      .filter((e) => e.type === 'syncStatus')
      .filter((e) => e.status.accountId === 'acct-3')
      .at(-1)
    expect(status).toMatchObject({
      status: { state: 'error', accountId: 'acct-3', noClientConfigured: true },
    })
  })
})
