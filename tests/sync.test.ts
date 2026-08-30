import { OAuthClientError, OAuthError } from '../src/core/auth/oauth'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SyncEngine, WINDOW_QUERY, type SyncGmailClient } from '../src/core/sync/engine'
import { Store } from '../src/core/store/db'
import { HttpError } from '../src/core/gmail/limiter'
import { NodePlatform } from './helpers/node-platform'
import type { MailEvent } from '../src/core/types'
import type {
  GmailHistoryResponse,
  GmailLabel,
  GmailListThreadsResponse,
  GmailMessage,
  GmailProfile,
  GmailThread,
} from '../src/core/gmail/types'

// --- test double for the Gmail client seam ---------------------------------

function gmessage(id: string, threadId: string, patch: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id,
    threadId,
    labelIds: ['INBOX'],
    snippet: `snippet ${id}`,
    internalDate: '1755000000000',
    payload: {
      mimeType: 'text/plain',
      filename: '',
      headers: [
        { name: 'From', value: 'Maya Ellison <maya@fernwood.dev>' },
        { name: 'To', value: 'nick@gmail.com' },
        { name: 'Subject', value: `Subject ${threadId}` },
      ],
      body: { size: 0 },
    },
    ...patch,
  }
}

function gfull(id: string, threadId: string): GmailMessage {
  const base = gmessage(id, threadId)
  return {
    ...base,
    payload: {
      ...base.payload!,
      mimeType: 'text/html',
      body: { size: 20, data: Buffer.from(`<p>body ${id}</p>`).toString('base64url') },
    },
  }
}

function gthread(id: string, messages: GmailMessage[]): GmailThread {
  return { id, historyId: '900', messages }
}

class FakeGmail implements SyncGmailClient {
  profileHistoryId = '1000'
  labels: GmailLabel[] = [{ id: 'INBOX', name: 'INBOX', type: 'system' }]
  /** thread id -> thread JSON. Absent means "gone from Gmail". */
  threads = new Map<string, GmailThread>()
  /** query key -> ordered pages of thread ids */
  pages = new Map<string, string[][]>()
  historyResponses: (GmailHistoryResponse | Error)[] = []
  fullMessages = new Map<string, GmailMessage>()

  calls: string[] = []
  listThreadsArgs: { q?: string; labelIds?: string[]; pageToken?: string }[] = []

  async profile(): Promise<GmailProfile> {
    this.calls.push('profile')
    return { emailAddress: 'nick@gmail.com', historyId: this.profileHistoryId }
  }

  async listLabels(): Promise<GmailLabel[]> {
    this.calls.push('listLabels')
    return this.labels
  }

  async listThreads(p: { q?: string; labelIds?: string[]; pageToken?: string }): Promise<GmailListThreadsResponse> {
    this.calls.push('listThreads')
    this.listThreadsArgs.push(p)
    const key = (p.labelIds ?? []).join(',')
    const pages = this.pages.get(key) ?? []
    const index = p.pageToken ? Number(p.pageToken) : 0
    const ids = pages[index] ?? []
    return {
      threads: ids.map((id) => ({ id })),
      nextPageToken: index + 1 < pages.length ? String(index + 1) : undefined,
    }
  }

  async batchGetThreads(ids: string[]): Promise<GmailThread[]> {
    this.calls.push(`batchGetThreads:${ids.length}`)
    return ids.map((id) => this.threads.get(id)).filter((t): t is GmailThread => !!t)
  }

  async batchGetMessages(ids: string[]): Promise<GmailMessage[]> {
    this.calls.push(`batchGetMessages:${ids.length}`)
    return ids.map((id) => this.fullMessages.get(id)).filter((m): m is GmailMessage => !!m)
  }

  async listHistory(): Promise<GmailHistoryResponse> {
    this.calls.push('listHistory')
    const next = this.historyResponses.shift()
    if (!next) return { historyId: this.profileHistoryId }
    if (next instanceof Error) throw next
    return next
  }
}

// --- harness ---------------------------------------------------------------

async function harness() {
  const platform = new NodePlatform()
  const store = await Store.open(platform)
  const api = new FakeGmail()
  const events: MailEvent[] = []
  const engine = new SyncEngine({
    api,
    store,
    accountId: 'acct-1',
    emit: (e) => events.push(e),
    now: () => 1_800_000_000_000,
  })
  return { store, api, engine, events }
}

function seedWindow(api: FakeGmail, ids: string[], trashIds: string[] = []) {
  api.pages.set('', [ids])
  api.pages.set('TRASH', [trashIds])
  for (const id of [...ids, ...trashIds]) {
    api.threads.set(id, gthread(id, [gmessage(`m-${id}`, id, { labelIds: trashIds.includes(id) ? ['TRASH'] : ['INBOX'] })]))
  }
}

// --- tests -----------------------------------------------------------------

describe('fullBackfill', () => {
  it('pages the 90-day window and stores threads plus messages as metadata', async () => {
    const { store, api, engine } = await harness()
    api.pages.set('', [['t1', 't2'], ['t3']])
    api.pages.set('TRASH', [[]])
    for (const id of ['t1', 't2', 't3']) api.threads.set(id, gthread(id, [gmessage(`m-${id}`, id)]))

    await engine.fullBackfill()

    expect(api.listThreadsArgs[0].q).toBe(WINDOW_QUERY)
    const threads = await store.allThreads()
    expect(threads.map((t) => t.gmailThreadId).sort()).toEqual(['t1', 't2', 't3'])
    const messages = await store.listMessages('acct-1/t1')
    expect(messages).toHaveLength(1)
    expect(messages[0].bodyState).toBe('metadata')
  })

  it('fetches the trash window separately, since threads.list hides it', async () => {
    const { store, api, engine } = await harness()
    seedWindow(api, ['t1'], ['t9'])
    await engine.fullBackfill()

    expect(api.listThreadsArgs.some((a) => a.labelIds?.includes('TRASH'))).toBe(true)
    expect((await store.listThreads({ kind: 'unified', folder: 'trash' })).map((t) => t.gmailThreadId)).toEqual(['t9'])
  })

  it('records the historyId captured before the listing, and the labels', async () => {
    const { store, api, engine } = await harness()
    seedWindow(api, ['t1'])
    api.labels = [
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'Label_9', name: 'Receipts', type: 'user' },
    ]
    await engine.fullBackfill()

    expect(api.calls.indexOf('profile')).toBeLessThan(api.calls.indexOf('listThreads'))
    expect(await store.getSyncState('acct-1')).toEqual({
      accountId: 'acct-1',
      historyId: '1000',
      lastFullSync: 1_800_000_000_000,
    })
    expect((await store.listLabels('acct-1')).map((l) => l.id).sort()).toEqual(['INBOX', 'Label_9'])
  })

  it('reports syncing then idle, and never leaves the status in syncing', async () => {
    const { api, engine, events } = await harness()
    seedWindow(api, ['t1'])
    await engine.fullBackfill()
    const states = events.filter((e) => e.type === 'syncStatus').map((e) => e.status.state)
    expect(states[0]).toBe('syncing')
    expect(states[states.length - 1]).toBe('idle')
    expect(events.some((e) => e.type === 'threadsChanged')).toBe(true)
  })

  it('reports an error status when the listing fails', async () => {
    const { api, engine, events } = await harness()
    api.listThreads = async () => {
      throw new HttpError(500, 'Server Error', '', 'https://x')
    }
    await expect(engine.fullBackfill()).rejects.toBeInstanceOf(HttpError)
    const last = events.filter((e) => e.type === 'syncStatus').at(-1)
    expect(last).toMatchObject({ status: { state: 'error', needsReauth: false } })
  })

  it('types a dead grant as needsReauth so no UI has to regex the message', async () => {
    const { api, engine, events } = await harness()
    api.listThreads = async () => {
      throw new OAuthError('invalid_grant', 'Google rejected the token request', true)
    }
    await expect(engine.fullBackfill()).rejects.toBeInstanceOf(OAuthError)
    const last = events.filter((e) => e.type === 'syncStatus').at(-1)
    expect(last).toMatchObject({ status: { state: 'error', needsReauth: true } })
  })

  it('types a rejected refresh client separately from a dead grant', async () => {
    const { api, engine, events } = await harness()
    api.listThreads = async () => {
      throw new OAuthClientError('invalid_client')
    }
    await expect(engine.fullBackfill()).rejects.toBeInstanceOf(OAuthClientError)
    const last = events.filter((e) => e.type === 'syncStatus').at(-1)
    expect(last).toMatchObject({
      status: { state: 'error', clientFailure: true, needsReauth: false },
    })
  })
})

describe('incrementalSync', () => {
  let ctx: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => {
    ctx = await harness()
    seedWindow(ctx.api, ['t1'])
    await ctx.engine.fullBackfill()
    ctx.events.length = 0
    ctx.api.calls.length = 0
  })

  it('falls back to a full backfill when no history cursor is stored', async () => {
    const fresh = await harness()
    seedWindow(fresh.api, ['t1'])
    await fresh.engine.incrementalSync()
    expect(fresh.api.calls).toContain('listThreads')
    expect(await fresh.store.allThreads()).toHaveLength(1)
  })

  it('applies messageAdded by refetching the affected thread', async () => {
    const { store, api, engine } = ctx
    api.threads.set('t2', gthread('t2', [gmessage('m-t2', 't2', { labelIds: ['INBOX', 'UNREAD'] })]))
    api.historyResponses = [
      {
        history: [{ id: '1001', messagesAdded: [{ message: gmessage('m-t2', 't2', { labelIds: ['INBOX', 'UNREAD'] }) }] }],
        historyId: '1100',
      },
    ]

    await engine.incrementalSync()

    const t2 = await store.getThread('acct-1/t2')
    expect(t2).toMatchObject({ gmailThreadId: 't2', unread: true })
    expect((await store.getSyncState('acct-1'))?.historyId).toBe('1100')
  })

  it('emits newMail once for an inbox message on a thread that was not unread', async () => {
    const { api, engine, events } = ctx
    api.threads.set('t2', gthread('t2', [gmessage('m-t2', 't2', { labelIds: ['INBOX', 'UNREAD'] })]))
    api.historyResponses = [
      {
        history: [
          { id: '1001', messagesAdded: [{ message: gmessage('m-t2', 't2', { labelIds: ['INBOX', 'UNREAD'] }) }] },
          { id: '1002', messagesAdded: [{ message: gmessage('m-t2b', 't2', { labelIds: ['INBOX', 'UNREAD'] }) }] },
        ],
        historyId: '1100',
      },
    ]

    await engine.incrementalSync()

    const newMail = events.filter((e) => e.type === 'newMail')
    expect(newMail).toHaveLength(1)
    expect(newMail[0]).toMatchObject({
      accountId: 'acct-1',
      threadKey: 'acct-1/t2',
      subject: 'Subject t2',
      threads: 1,
    })
  })

  it('coalesces a multi-thread pass into one newMail carrying the count', async () => {
    const { api, engine, events } = ctx
    for (const id of ['t2', 't3', 't4']) {
      api.threads.set(id, gthread(id, [gmessage(`m-${id}`, id, { labelIds: ['INBOX', 'UNREAD'] })]))
    }
    api.historyResponses = [
      {
        history: ['t2', 't3', 't4'].map((id, i) => ({
          id: `100${i + 1}`,
          messagesAdded: [{ message: gmessage(`m-${id}`, id, { labelIds: ['INBOX', 'UNREAD'] }) }],
        })),
        historyId: '1100',
      },
    ]

    await engine.incrementalSync()

    const newMail = events.filter((e) => e.type === 'newMail')
    // One pass, one event — the sound and the OS notification each fire once.
    expect(newMail).toHaveLength(1)
    expect(newMail[0]).toMatchObject({ threads: 3 })
    // It names the newest arrival, which is the last one history reported.
    expect(newMail[0]).toMatchObject({ threadKey: 'acct-1/t4', subject: 'Subject t4' })
  })

  it('does not emit newMail for a thread that was already unread', async () => {
    const { store, api, engine, events } = ctx
    const existing = (await store.getThread('acct-1/t1'))!
    await store.upsertThreads([{ ...existing, unread: true, labelIds: ['INBOX', 'UNREAD'] }])
    api.threads.set('t1', gthread('t1', [gmessage('m-t1', 't1', { labelIds: ['INBOX', 'UNREAD'] })]))
    api.historyResponses = [
      {
        history: [{ id: '1001', messagesAdded: [{ message: gmessage('m-t1b', 't1', { labelIds: ['INBOX', 'UNREAD'] }) }] }],
        historyId: '1100',
      },
    ]

    await engine.incrementalSync()
    expect(events.filter((e) => e.type === 'newMail')).toHaveLength(0)
  })

  it('does not emit newMail for a message that is not in the inbox', async () => {
    const { api, engine, events } = ctx
    api.threads.set('t3', gthread('t3', [gmessage('m-t3', 't3', { labelIds: ['SENT'] })]))
    api.historyResponses = [
      {
        history: [{ id: '1001', messagesAdded: [{ message: gmessage('m-t3', 't3', { labelIds: ['SENT'] }) }] }],
        historyId: '1100',
      },
    ]
    await engine.incrementalSync()
    expect(events.filter((e) => e.type === 'newMail')).toHaveLength(0)
  })

  it('applies labelAdded and labelRemoved through the refetch', async () => {
    const { store, api, engine } = ctx
    api.threads.set('t1', gthread('t1', [gmessage('m-t1', 't1', { labelIds: ['INBOX', 'STARRED'] })]))
    api.historyResponses = [
      {
        history: [{ id: '1001', labelsAdded: [{ message: gmessage('m-t1', 't1'), labelIds: ['STARRED'] }] }],
        historyId: '1100',
      },
    ]

    await engine.incrementalSync()

    expect(await store.getThread('acct-1/t1')).toMatchObject({ starred: true })
    expect((await store.listThreads({ kind: 'unified', folder: 'starred' })).map((t) => t.key)).toEqual(['acct-1/t1'])
  })

  it('deletes a thread whose messages are all gone from Gmail', async () => {
    const { store, api, engine } = ctx
    api.threads.delete('t1')
    api.historyResponses = [
      { history: [{ id: '1001', messagesDeleted: [{ message: gmessage('m-t1', 't1') }] }], historyId: '1100' },
    ]

    await engine.incrementalSync()

    expect(await store.getThread('acct-1/t1')).toBeNull()
    expect(await store.listMessages('acct-1/t1')).toEqual([])
  })

  it('follows history pagination before storing the new cursor', async () => {
    const { api, engine, store } = ctx
    api.threads.set('t2', gthread('t2', [gmessage('m-t2', 't2')]))
    api.threads.set('t3', gthread('t3', [gmessage('m-t3', 't3')]))
    api.historyResponses = [
      { history: [{ id: '1001', messagesAdded: [{ message: gmessage('m-t2', 't2') }] }], nextPageToken: 'p2' },
      { history: [{ id: '1002', messagesAdded: [{ message: gmessage('m-t3', 't3') }] }], historyId: '1200' },
    ]

    await engine.incrementalSync()

    expect(api.calls.filter((c) => c === 'listHistory')).toHaveLength(2)
    expect(await store.getThread('acct-1/t2')).not.toBeNull()
    expect(await store.getThread('acct-1/t3')).not.toBeNull()
    expect((await store.getSyncState('acct-1'))?.historyId).toBe('1200')
  })
})

describe('expired historyId', () => {
  it('resyncs the window on a 404 and diffs local against remote by thread id', async () => {
    const { store, api, engine, events } = await harness()
    seedWindow(api, ['t1', 't2'])
    await engine.fullBackfill()
    events.length = 0

    // Gmail forgot our cursor; the window now holds t2 and t3, not t1.
    api.historyResponses = [new HttpError(404, 'Not Found', 'historyId expired', 'https://x')]
    api.profileHistoryId = '2000'
    seedWindow(api, ['t2', 't3'])

    await engine.incrementalSync()

    const keys = (await store.allThreads()).map((t) => t.gmailThreadId).sort()
    expect(keys).toEqual(['t2', 't3'])
    expect(await store.listMessages('acct-1/t1')).toEqual([])
    expect((await store.getSyncState('acct-1'))?.historyId).toBe('2000')
    expect(events.filter((e) => e.type === 'syncStatus').at(-1)).toMatchObject({ status: { state: 'idle' } })
  })
})

describe('ensureBodies', () => {
  it('fetches full bodies for one thread and upgrades the stored messages', async () => {
    const { store, api, engine } = await harness()
    seedWindow(api, ['t1'])
    api.threads.set('t1', gthread('t1', [gmessage('a', 't1'), gmessage('b', 't1')]))
    await engine.fullBackfill()
    api.fullMessages.set('a', gfull('a', 't1'))
    api.fullMessages.set('b', gfull('b', 't1'))
    api.calls.length = 0

    const messages = await engine.ensureBodies('acct-1/t1')

    expect(api.calls).toEqual(['batchGetMessages:2'])
    expect(messages.map((m) => m.bodyState)).toEqual(['full', 'full'])
    expect((await store.listMessages('acct-1/t1'))[0].bodyHtml).toBe('<p>body a</p>')
  })

  it('is a no-op when every message is already hydrated', async () => {
    const { api, engine } = await harness()
    seedWindow(api, ['t1'])
    await engine.fullBackfill()
    api.fullMessages.set('m-t1', gfull('m-t1', 't1'))
    await engine.ensureBodies('acct-1/t1')
    api.calls.length = 0
    await engine.ensureBodies('acct-1/t1')
    expect(api.calls).toEqual([])
  })
})

describe('prefetchBodies', () => {
  it('hydrates the newest threads up to the limit and stops there', async () => {
    const { api, engine, store } = await harness()
    seedWindow(api, ['t1', 't2', 't3'])
    for (const [i, id] of ['t1', 't2', 't3'].entries()) {
      api.threads.set(id, gthread(id, [gmessage(`m-${id}`, id, { internalDate: String(1_755_000_000_000 + i) })]))
      api.fullMessages.set(`m-${id}`, gfull(`m-${id}`, id))
    }
    await engine.fullBackfill()
    api.calls.length = 0

    await engine.prefetchBodies(2)

    expect(api.calls.filter((c) => c.startsWith('batchGetMessages'))).toHaveLength(2)
    // Newest first: t3 then t2.
    expect((await store.listMessages('acct-1/t3'))[0].bodyState).toBe('full')
    expect((await store.listMessages('acct-1/t1'))[0].bodyState).toBe('metadata')
  })
})

describe('startPolling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs on the interval and never overlaps two runs', async () => {
    const { api, engine, store } = await harness()
    await store.setSyncState({ accountId: 'acct-1', historyId: '1000' })

    let release: () => void = () => {}
    let started = 0
    api.listHistory = async () => {
      started++
      await new Promise<void>((r) => {
        release = r
      })
      return { historyId: '1100' }
    }

    engine.startPolling(60)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(started).toBe(1)

    // A second and third tick land while the first run is still in flight.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(started).toBe(1)

    release()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(started).toBe(2)

    engine.stop()
    release()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(started).toBe(2)
  })
})
