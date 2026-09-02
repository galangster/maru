// Later — P21 lane 1.
//
// The three riskiest parts of this lane, in the order the ticket ranked them,
// get the most attention here:
//
//  1. the sort key, applied identically in SQL, in `applyListPrefs` and in the
//     list's grouping — because getting it wrong means a thread that comes back
//     lands at list position ninety and the feature has eaten the mail;
//  2. the DST-safe calendar arithmetic, which cannot be checked by looking at
//     it and needs a test that actually runs across a transition;
//  3. `thread_defer` reaching `deleteAccount` and `deleteThreads` — both
//     one-word additions, and both data-leak bugs if missed.

// @ts-expect-error -- jsdom is a devDependency of vite and ships no types.
import { JSDOM } from 'jsdom'
import { describe, it, expect, afterEach } from 'vitest'

import { Store } from '../src/core/store/db'
import { SyncEngine, type SyncGmailClient } from '../src/core/sync/engine'
import { DemoMailService } from '../src/core/service/demo'
import {
  MAX_DEFER_DAYS,
  WOKE_RETENTION_MS,
  clampedDeferDay,
  deferPresets,
  deferSortKey,
  isoDay,
  maxDeferAt,
  minDeferAt,
  threadMatchesView,
  viewLabel,
} from '../src/core/defaults'
import { applyListPrefs } from '../src/features/list/list-prefs'
import { wakeTime } from '../src/lib/format'
import { presetForKey } from '../src/features/list/later-picker'
import { isTyping } from '../src/lib/typing'
import type { GmailHistoryResponse, GmailMessage, GmailProfile, GmailThread } from '../src/core/gmail/types'
import type { MailEvent, MailView } from '../src/core/types'
import { NodePlatform } from './helpers/node-platform'
import { makeAccount, makeMessage, makeThread } from './fixtures/domain'

const LATER: MailView = { kind: 'later' }
const INBOX: MailView = { kind: 'unified', folder: 'inbox' }
const STARRED: MailView = { kind: 'unified', folder: 'starred' }

const NOW = 1_800_000_000_000
const HOUR = 3_600_000
const DAY = 86_400_000

async function openStore(): Promise<Store> {
  return Store.open(new NodePlatform())
}

// ---------------------------------------------------------------------------
// The table, and the invariant it exists to enforce
// ---------------------------------------------------------------------------

describe('migration 6', () => {
  it('creates thread_defer with its two indexes', async () => {
    const platform = new NodePlatform()
    const db = (await platform.sqlOpen()) as unknown as { raw: import('better-sqlite3').Database }
    await Store.open(platform)
    const names = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(names).toContain('thread_defer')
    expect(names).toContain('idx_thread_defer_wake')
    expect(names).toContain('idx_thread_defer_account')
  })

  it('is idempotent — unlike migration 5, it may be re-run', async () => {
    const platform = new NodePlatform()
    const store = await Store.open(platform)
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    await Store.open(platform)
    expect((await store.getThread('acct-1/t-1'))?.deferredUntil).toBe(NOW + DAY)
  })

  /**
   * The invariant, as a test: a sync pass must not be able to erase a deferral.
   * `upsertThreads` names `threads` and `thread_labels` and nothing else, and
   * this is what makes that a guarantee rather than a comment.
   */
  it('survives a full upsertThreads round trip, labels intact', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)

    // The stalest possible write: the Thread as it was BEFORE the deferral,
    // which is exactly what a sync pass holding an old object would send.
    await store.upsertThreads([makeThread()])

    const after = await store.getThread('acct-1/t-1')
    expect(after?.deferredUntil).toBe(NOW + DAY)
    // And Gmail's own truth is untouched: the thread still carries INBOX.
    expect(after?.labelIds).toContain('INBOX')
  })
})

// ---------------------------------------------------------------------------
// What each view contains
// ---------------------------------------------------------------------------

describe('the view rules', () => {
  it('hides a deferred thread from the inbox and shows it in Later', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread(), makeThread({ gmailThreadId: 't-2' })])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)

    expect((await store.listThreads(INBOX, { now: NOW })).map((t) => t.key)).toEqual([
      'acct-1/t-2',
    ])
    expect((await store.listThreads(LATER, { now: NOW })).map((t) => t.key)).toEqual([
      'acct-1/t-1',
    ])
  })

  it('puts the thread back with no write once its time has passed', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)

    // Nothing ran in between. The laptop was shut; the predicate is simply
    // false now, which is the whole reason this design fails safe.
    expect(await store.listThreads(INBOX, { now: NOW + DAY + 1 })).toHaveLength(1)
    expect(await store.listThreads(LATER, { now: NOW + DAY + 1 })).toHaveLength(0)
  })

  it('leaves a deferred thread in Starred — deferral is about the inbox', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread({ labelIds: ['INBOX', 'STARRED'], starred: true })])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)

    expect(await store.listThreads(INBOX, { now: NOW })).toHaveLength(0)
    expect(await store.listThreads(STARRED, { now: NOW })).toHaveLength(1)
  })

  it('drops an archived thread out of Later for free, with no reconciliation', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    // Archived from the phone: INBOX is gone, and Later is defined as
    // INBOX ∧ ¬TRASH ∧ deferred.
    await store.upsertThreads([makeThread({ labelIds: [] })])

    expect(await store.listThreads(LATER, { now: NOW })).toHaveLength(0)
  })

  it('keeps the sidebar badge honest, because countUnread shares viewClause', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([
      makeThread({ unread: true }),
      makeThread({ gmailThreadId: 't-2', unread: true }),
    ])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)

    expect(await store.countUnread(INBOX, NOW)).toBe(1)
    expect(await store.countDeferred(NOW)).toBe(1)
  })

  it('viewLabel stays total and says INBOX for Later', () => {
    expect(viewLabel(LATER)).toBe('INBOX')
  })

  it('threadMatchesView agrees with the SQL on all four cases', () => {
    const deferred = makeThread({ deferredUntil: NOW + DAY })
    const plain = makeThread()
    expect(threadMatchesView(deferred, INBOX, NOW)).toBe(false)
    expect(threadMatchesView(deferred, LATER, NOW)).toBe(true)
    expect(threadMatchesView(plain, INBOX, NOW)).toBe(true)
    expect(threadMatchesView(plain, LATER, NOW)).toBe(false)
    // Past its time, the predicate is simply false again.
    expect(threadMatchesView(deferred, INBOX, NOW + DAY + 1)).toBe(true)
    expect(threadMatchesView(deferred, LATER, NOW + DAY + 1)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Risk 1: the sort key, in all three places it is spelled
// ---------------------------------------------------------------------------

describe('the sort key', () => {
  it('brings a woken thread back to the TOP, not to where its age would put it', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    // The case the ticket names: a thread three weeks old, saved until now.
    await store.upsertThreads([
      makeThread({ gmailThreadId: 'old', lastMessageAt: NOW - 21 * DAY }),
      makeThread({ gmailThreadId: 'fresh', lastMessageAt: NOW - HOUR }),
    ])
    await store.setDeferral('acct-1/old', 'acct-1', NOW - 1, NOW - 21 * DAY)
    await store.sweepDeferrals(NOW)

    const keys = (await store.listThreads(INBOX, { now: NOW })).map((t) => t.key)
    expect(keys[0]).toBe('acct-1/old')
  })

  it('is the same expression in memory as in SQL', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([
      makeThread({ gmailThreadId: 'old', lastMessageAt: NOW - 21 * DAY }),
      makeThread({ gmailThreadId: 'fresh', lastMessageAt: NOW - HOUR }),
    ])
    await store.setDeferral('acct-1/old', 'acct-1', NOW - 1, NOW - 21 * DAY)
    await store.sweepDeferrals(NOW)

    const rows = await store.listThreads(INBOX, { now: NOW })
    // The lens re-sorts; it must reach the order the query already produced.
    const lensed = applyListPrefs(rows, { sort: 'newest', filter: 'unread' })
    expect(applyListPrefs(rows, { sort: 'newest', filter: 'all' }).map((t) => t.key)).toEqual(
      rows.map((t) => t.key),
    )
    expect(lensed).toEqual([])
    expect(deferSortKey(rows[0])).toBeGreaterThan(deferSortKey(rows[1]))
  })

  it('stops treating the return as fresh once the row is collected', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([
      makeThread({ gmailThreadId: 'old', lastMessageAt: NOW - 21 * DAY }),
      makeThread({ gmailThreadId: 'fresh', lastMessageAt: NOW - HOUR }),
    ])
    await store.setDeferral('acct-1/old', 'acct-1', NOW - 1, NOW - 21 * DAY)
    await store.sweepDeferrals(NOW)
    // A day later the row is collected, and the thread sorts by its own age
    // again — which is what ENDS the back-at-the-top treatment.
    await store.sweepDeferrals(NOW + WOKE_RETENTION_MS + 1)

    const keys = (await store.listThreads(INBOX, { now: NOW + WOKE_RETENTION_MS + 1 })).map(
      (t) => t.key,
    )
    expect(keys[0]).toBe('acct-1/fresh')
  })

  it('orders Later by when each thread comes back, soonest first', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([
      makeThread({ gmailThreadId: 'a', lastMessageAt: NOW - HOUR }),
      makeThread({ gmailThreadId: 'b', lastMessageAt: NOW - 10 * DAY }),
    ])
    await store.setDeferral('acct-1/a', 'acct-1', NOW + 7 * DAY, NOW)
    await store.setDeferral('acct-1/b', 'acct-1', NOW + DAY, NOW)

    expect((await store.listThreads(LATER, { now: NOW })).map((t) => t.key)).toEqual([
      'acct-1/b',
      'acct-1/a',
    ])
  })

  it('pages against the same expression it sorts by', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([
      makeThread({ gmailThreadId: 'old', lastMessageAt: NOW - 21 * DAY }),
      makeThread({ gmailThreadId: 'fresh', lastMessageAt: NOW - HOUR }),
    ])
    await store.setDeferral('acct-1/old', 'acct-1', NOW - 1, NOW - 21 * DAY)
    await store.sweepDeferrals(NOW)

    // A cursor at the woken thread's SORT key must skip it, not sail past it
    // because its `last_message_at` is three weeks old.
    const page = await store.listThreads(INBOX, { now: NOW, before: NOW })
    expect(page.map((t) => t.key)).toEqual(['acct-1/fresh'])
  })
})

// ---------------------------------------------------------------------------
// The lazy sweep
// ---------------------------------------------------------------------------

describe('sweepDeferrals', () => {
  it('reports only what actually moved, so nothing invalidates on a quiet tick', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)

    expect(await store.sweepDeferrals(NOW)).toEqual({ woken: 0 })
    expect(await store.sweepDeferrals(NOW + DAY)).toEqual({ woken: 1 })
    // Already stamped. A second sweep must not re-report it, or a list would
    // refetch every minute forever.
    expect(await store.sweepDeferrals(NOW + DAY + 1)).toEqual({ woken: 0 })
  })

  it('wakes a week of deferrals in one pass after a week of being shut', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    for (let i = 0; i < 5; i++) {
      await store.upsertThreads([makeThread({ gmailThreadId: `t-${i}` })])
      await store.setDeferral(`acct-1/t-${i}`, 'acct-1', NOW + i * DAY, NOW)
    }
    expect(await store.sweepDeferrals(NOW + 7 * DAY)).toEqual({ woken: 5 })
  })

  it('clears woke_at on a re-save, so a re-scheduled thread starts fresh', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW, NOW)
    await store.sweepDeferrals(NOW)
    expect((await store.getThread('acct-1/t-1'))?.wokeAt).toBe(NOW)

    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    expect((await store.getThread('acct-1/t-1'))?.wokeAt).toBeUndefined()
  })

  it('deferredKeys names live deferrals only', async () => {
    const store = await openStore()
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread(), makeThread({ gmailThreadId: 't-2' })])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    await store.setDeferral('acct-1/t-2', 'acct-1', NOW - DAY, NOW)
    await store.sweepDeferrals(NOW)

    expect(await store.deferredKeys()).toEqual(['acct-1/t-1'])
  })
})

// ---------------------------------------------------------------------------
// Risk 3: the two deletes
// ---------------------------------------------------------------------------

describe('deletion reaches thread_defer', () => {
  it('leaves nothing behind after "delete my data"', async () => {
    const platform = new NodePlatform()
    const store = await Store.open(platform)
    const db = (await platform.sqlOpen()) as unknown as { raw: import('better-sqlite3').Database }
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)

    await store.deleteAccount('acct-1', NOW)
    expect(
      db.raw.prepare('SELECT COUNT(*) AS n FROM thread_defer').get() as { n: number },
    ).toEqual({ n: 0 })
  })

  it('does not orphan a row when a thread falls out of the 90-day window', async () => {
    const platform = new NodePlatform()
    const store = await Store.open(platform)
    const db = (await platform.sqlOpen()) as unknown as { raw: import('better-sqlite3').Database }
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)

    await store.deleteThreads(['acct-1/t-1'])
    expect(
      db.raw.prepare('SELECT COUNT(*) AS n FROM thread_defer').get() as { n: number },
    ).toEqual({ n: 0 })
  })
})

// ---------------------------------------------------------------------------
// Risk 2: DST-safe calendar arithmetic
// ---------------------------------------------------------------------------

describe('the presets', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    // DELETE rather than assign when there was no TZ to begin with: assigning
    // `undefined` stores the literal string "undefined", which Node cannot
    // resolve and silently treats as UTC — so every later test in this file
    // would run in a different zone than the one its module-level
    // `Intl.DateTimeFormat`s were constructed in.
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  // Note for anyone extending this: swapping TZ mid-process reaches `Date`'s
  // local methods and NOT a cached `Intl.DateTimeFormat`, which resolves its
  // zone once at construction. That is why these tests exercise
  // `deferPresets` (pure Date arithmetic) and `wakeTime` is pinned below
  // without a zone override.

  /**
   * The one that cannot be checked by reading the code. A US DST transition
   * lands on Sunday 1 November 2026; "tomorrow, 9:00" asked on the Saturday
   * must be 09:00 local, and `now + 86_400_000` gives 08:00.
   */
  it('lands on the hour across a DST transition', () => {
    process.env.TZ = 'America/New_York'
    // Saturday 31 October 2026, 09:00 EDT.
    const saturday = Date.parse('2026-10-31T13:00:00Z')
    const tomorrow = deferPresets(saturday).find((p) => p.id === 'tomorrow')!
    const landed = new Date(tomorrow.wakeAt)
    expect(landed.getHours()).toBe(9)
    expect(landed.getDate()).toBe(1)
    // And the naive arithmetic this replaced is genuinely wrong here, so the
    // test is pinning a real difference rather than restating the code.
    expect(new Date(saturday + DAY).getHours()).toBe(8)
  })

  it('lands on the hour across a spring transition too', () => {
    process.env.TZ = 'America/New_York'
    // Saturday 7 March 2026, 09:00 EST; the clocks go forward on the 8th.
    const saturday = Date.parse('2026-03-07T14:00:00Z')
    const tomorrow = deferPresets(saturday).find((p) => p.id === 'tomorrow')!
    expect(new Date(tomorrow.wakeAt).getHours()).toBe(9)
    expect(new Date(saturday + DAY).getHours()).toBe(10)
  })

  it('stops offering this evening once the evening is close enough to be now', () => {
    process.env.TZ = 'America/New_York'
    const morning = Date.parse('2026-09-02T13:00:00Z') // 09:00 local, a Wednesday
    const late = Date.parse('2026-09-02T21:00:00Z') // 17:00 local
    expect(deferPresets(morning).map((p) => p.id)).toContain('evening')
    expect(deferPresets(late).map((p) => p.id)).not.toContain('evening')
  })

  it('offers this weekend Monday to Thursday and not on Friday', () => {
    process.env.TZ = 'America/New_York'
    const wednesday = Date.parse('2026-09-02T13:00:00Z')
    const friday = Date.parse('2026-09-04T13:00:00Z')
    const saturday = Date.parse('2026-09-05T13:00:00Z')
    expect(deferPresets(wednesday).map((p) => p.id)).toContain('weekend')
    // On Friday "this weekend" is tomorrow, and on Saturday it is now. Both
    // would be shortcuts that lie.
    expect(deferPresets(friday).map((p) => p.id)).not.toContain('weekend')
    expect(deferPresets(saturday).map((p) => p.id)).not.toContain('weekend')
  })

  it('always lands the weekend on a Saturday and next week on a Monday', () => {
    process.env.TZ = 'Europe/London'
    for (let day = 0; day < 7; day++) {
      const at = Date.parse('2026-09-07T08:00:00Z') + day * DAY
      const presets = deferPresets(at)
      const weekend = presets.find((p) => p.id === 'weekend')
      if (weekend) expect(new Date(weekend.wakeAt).getDay()).toBe(6)
      const week = presets.find((p) => p.id === 'nextweek')!
      expect(new Date(week.wakeAt).getDay()).toBe(1)
      // Never today, and never in the past.
      expect(week.wakeAt).toBeGreaterThan(at)
    }
  })

  it('caps the custom date at the sync window, which is why there is no Someday', () => {
    const cap = maxDeferAt(NOW)
    expect(cap).toBeGreaterThan(NOW + (MAX_DEFER_DAYS - 1) * DAY)
    expect(cap).toBeLessThan(NOW + (MAX_DEFER_DAYS + 1) * DAY)
  })
})

describe('wakeTime', () => {
  /**
   * Built from local Date parts rather than a UTC string, and with no TZ
   * override: `wakeTime` formats through a module-level `Intl.DateTimeFormat`,
   * which caches the zone it was constructed in and never sees a later
   * `process.env.TZ`. Local parts make the expected digits the same in every
   * zone, which is the honest way to pin this.
   */
  const localAt = (year: number, month: number, day: number, hour: number) =>
    new Date(year, month, day, hour, 0, 0, 0).getTime()

  it('says what Maru will do, in the words the toast uses', () => {
    const wednesday = localAt(2026, 8, 2, 9) // Wed 2 September 2026, 09:00
    expect(wakeTime(localAt(2026, 8, 2, 18), wednesday)).toBe('this evening, 18:00')
    expect(wakeTime(localAt(2026, 8, 3, 9), wednesday)).toBe('tomorrow, 9:00')
    expect(wakeTime(localAt(2026, 8, 7, 9), wednesday)).toBe('Mon, 9:00')
    // Past the coming week a weekday is a word nobody can place, so it dates.
    expect(wakeTime(localAt(2026, 8, 30, 9), wednesday)).toMatch(/^Sep 30, 9:00$/)
  })
})

// ---------------------------------------------------------------------------
// The sync engine: the two places a deferral must not be lost
// ---------------------------------------------------------------------------

class StubGmail {
  threads = new Map<string, GmailThread>()
  pages = new Map<string, string[][]>()
  historyPages: GmailHistoryResponse[] = []

  async profile(): Promise<GmailProfile> {
    return { emailAddress: 'nick@gmail.com', historyId: '1000' }
  }
  async listLabels() {
    return [{ id: 'INBOX', name: 'INBOX', type: 'system' as const }]
  }
  async listThreads(args: { q?: string; labelIds?: string[]; pageToken?: string }) {
    const key = args.labelIds?.includes('TRASH') ? 'TRASH' : ''
    const pages = this.pages.get(key) ?? [[]]
    const index = args.pageToken ? Number(args.pageToken) : 0
    return {
      threads: (pages[index] ?? []).map((id) => ({ id })),
      nextPageToken: index + 1 < pages.length ? String(index + 1) : undefined,
    }
  }
  async getThread(id: string) {
    const thread = this.threads.get(id)
    if (!thread) throw new Error(`no thread ${id}`)
    return thread
  }
  async batchGetThreads(ids: string[]) {
    return ids.map((id) => this.threads.get(id)).filter(Boolean) as GmailThread[]
  }
  async batchGetMessages(): Promise<GmailMessage[]> {
    return []
  }
  async listHistory(): Promise<GmailHistoryResponse> {
    return this.historyPages.shift() ?? { historyId: '1000' }
  }
}

function gmsg(id: string, threadId: string, labelIds: string[]): GmailMessage {
  return {
    id,
    threadId,
    labelIds,
    snippet: `snippet ${id}`,
    internalDate: String(NOW),
    payload: {
      mimeType: 'text/plain',
      filename: '',
      headers: [
        { name: 'From', value: 'Maya Ellison <maya@fernwood.dev>' },
        { name: 'To', value: 'nick@gmail.com' },
        { name: 'Subject', value: 'Tuesday walkthrough' },
      ],
      body: { size: 0 },
    },
  }
}

async function engineHarness() {
  const store = await openStore()
  const api = new StubGmail()
  const events: MailEvent[] = []
  const engine = new SyncEngine({
    api: api as unknown as SyncGmailClient,
    store,
    accountId: 'acct-1',
    emit: (e) => events.push(e),
    now: () => NOW,
  })
  await store.upsertAccount(makeAccount())
  return { store, api, engine, events }
}

describe('the sync engine', () => {
  /**
   * The owner's open decision, built as YES and easy to reverse: deleting the
   * one `clearDeferral` line in `applyHistory` restores "Monday means Monday".
   * This test is what tells the next reader which way it is currently set.
   */
  it('wakes a deferred thread when a reply lands', async () => {
    const { store, api, engine } = await engineHarness()
    await store.upsertThreads([makeThread()])
    await store.upsertMessages([makeMessage()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + 7 * DAY, NOW)

    api.threads.set('t-1', {
      id: 't-1',
      historyId: '1001',
      messages: [gmsg('m-1', 't-1', ['INBOX']), gmsg('m-2', 't-1', ['INBOX', 'UNREAD'])],
    })
    api.historyPages = [
      {
        historyId: '1001',
        history: [{ id: '1', messagesAdded: [{ message: gmsg('m-2', 't-1', ['INBOX', 'UNREAD']) }] }],
      },
    ]
    await store.setSyncState({ accountId: 'acct-1', historyId: '1000' })

    await engine.incrementalSync()
    expect((await store.getThread('acct-1/t-1'))?.deferredUntil).toBeUndefined()
    expect(await store.listThreads(INBOX, { now: NOW })).toHaveLength(1)
  })

  it('does not evict a deferred thread that has fallen out of the window', async () => {
    const { store, engine } = await engineHarness()
    await store.upsertThreads([
      makeThread({ gmailThreadId: 'kept', lastMessageAt: NOW - 60 * DAY }),
      makeThread({ gmailThreadId: 'gone', lastMessageAt: NOW - 60 * DAY }),
    ])
    await store.setDeferral('acct-1/kept', 'acct-1', NOW + 30 * DAY, NOW)

    // The window comes back empty: both threads are outside it at Gmail.
    await engine.resyncWindow()

    expect(await store.getThread('acct-1/kept')).not.toBeNull()
    expect(await store.getThread('acct-1/gone')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The demo service — every capture and the website run on it
// ---------------------------------------------------------------------------

describe('the demo service', () => {
  it('implements the same three rules the store does', async () => {
    const demo = new DemoMailService({ now: NOW })
    const inbox = await demo.listThreads(INBOX)
    const target = inbox[0]

    await demo.defer(target.key, Date.now() + DAY)
    expect((await demo.listThreads(INBOX)).map((t) => t.key)).not.toContain(target.key)
    expect((await demo.listThreads(LATER)).map((t) => t.key)).toEqual([target.key])
    expect(await demo.deferredCount()).toBe(1)

    await demo.defer(target.key, null)
    expect((await demo.listThreads(INBOX)).map((t) => t.key)).toContain(target.key)
    expect(await demo.deferredCount()).toBe(0)
  })

  it('ends the deferral when the thread leaves the inbox', async () => {
    const demo = new DemoMailService({ now: NOW })
    const target = (await demo.listThreads(INBOX))[0]
    await demo.defer(target.key, Date.now() + DAY)
    await demo.performAction({ type: 'archive', threadKey: target.key })
    expect(await demo.deferredCount()).toBe(0)
  })

  it('wakes on the same lazy sweep, and reports only what moved', async () => {
    const demo = new DemoMailService({ now: NOW })
    const target = (await demo.listThreads(INBOX))[0]
    const at = Date.now()
    await demo.defer(target.key, at + DAY)

    expect(await demo.wakeDeferred(at)).toBe(0)
    expect(await demo.wakeDeferred(at + DAY)).toBe(1)
    expect(await demo.wakeDeferred(at + DAY + 1)).toBe(0)
    // Read against the clock it was swept at: the predicate is evaluated at
    // query time, so a sweep in the future does not change what "now" shows.
    expect((await demo.listThreads(INBOX, { now: at + DAY })).map((t) => t.key)).toContain(
      target.key,
    )
  })
})


describe('clampedDeferDay', () => {
  // The field's own bounds are what the calendar popup obeys. Typing into it
  // reaches past them, which is the whole of issue 43.
  it('brings a date that has already gone up to the picker\u2019s earliest day', () => {
    expect(clampedDeferDay('2020-01-01', NOW)).toBe(minDeferAt(NOW))
  })

  it('confirms a time that is still coming', () => {
    // The defect was not only the wrong day: "Back this evening, 9:00" named a
    // moment in the past, so nothing ever came back.
    const at = clampedDeferDay('2020-01-01', NOW)
    expect(at).not.toBeNull()
    expect(at as number).toBeGreaterThan(NOW)
  })

  it('still clamps the far end at 30 days, unchanged', () => {
    expect(clampedDeferDay('2030-01-01', NOW)).toBe(maxDeferAt(NOW))
  })

  it('leaves a date inside the window exactly where it was typed', () => {
    const inside = isoDay(minDeferAt(NOW) + 3 * 86_400_000)
    expect(clampedDeferDay(inside, NOW)).toBe(minDeferAt(NOW) + 3 * 86_400_000)
  })

  it('takes today as tomorrow, which is what the field already offered', () => {
    expect(clampedDeferDay(isoDay(NOW), NOW)).toBe(minDeferAt(NOW))
  })

  it('rejects an empty or half-typed field rather than clamping it to a day', () => {
    expect(clampedDeferDay('', NOW)).toBeNull()
    expect(clampedDeferDay('2026-09', NOW)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The digit accelerators, and the field that replaces the rows they name
// ---------------------------------------------------------------------------

describe('the preset digits stand down inside the date field — issue #54', () => {
  // The picker's `1`..`4` are accelerators for the four preset ROWS. "Pick a
  // date…" swaps those rows for a date input, and the digits kept firing into
  // the list that was no longer on screen: typing `09/10/2026` fired `1`,
  // closed the menu and saved the thread for this evening, with a toast
  // confirming a time nobody chose. Almost every date carries a 1, 2, 3 or 4,
  // so almost every typed date did it.
  //
  // The guard is `isTyping`, which is the *keymap's* guard — one definition of
  // "takes typed text" for the whole app. These cases are the ones the picker
  // actually presents.
  const dom = new JSDOM(`<!doctype html><body>
    <div id="menu">
      <button id="preset" type="button">This evening</button>
      <span id="wrap"><input id="date" type="date" aria-label="Bring it back on"></span>
      <p id="disclosure">Later follows your Maru account…</p>
    </div>
  </body>`)
  // `isTyping` narrows with `instanceof HTMLElement`, exactly as it does in the
  // browser, so the constructor under test has to be the one this document's
  // nodes were built by.
  Object.assign(globalThis, { HTMLElement: dom.window.HTMLElement })
  const at = (id: string) => dom.window.document.getElementById(id)

  it('suspends them while the date field has the caret', () => {
    expect(isTyping(at('date'))).toBe(true)
  })

  it('leaves them live on a preset row, which is what they are for', () => {
    expect(isTyping(at('preset'))).toBe(false)
    expect(isTyping(at('disclosure'))).toBe(false)
    expect(isTyping(null)).toBe(false)
  })

  it('reaches a field through whatever wrapper a surface put around it', () => {
    // The picker wraps its input in a column with the range sentence under it,
    // and Base UI adds its own nodes; the target of a keystroke is not always
    // the input element itself.
    const nested = at('date')!.parentElement
    expect(isTyping(nested)).toBe(false)
    expect(isTyping(at('date')!)).toBe(true)
  })

  it('is the guard the picker actually calls, before it reads the key', () => {
    // The regression is not the predicate — it is a surface binding digits
    // without asking it, so the rule under test is the picker's own, run
    // against the same fixture rather than read out of the file.
    const presets = deferPresets(NOW)

    // A digit on a preset row is the accelerator it looks like.
    expect(presetForKey('1', at('preset'), presets)).toBe(presets[0])
    expect(presetForKey(String(presets.length), at('preset'), presets)).toBe(
      presets[presets.length - 1],
    )

    // The same digit with the caret in the date field is a digit. This is the
    // ordering that was the defect: the guard runs before the key is read.
    expect(presetForKey('1', at('date'), presets)).toBeNull()

    // And nothing outside the list of rows is ever a row.
    expect(presetForKey('0', at('preset'), presets)).toBeNull()
    expect(presetForKey(String(presets.length + 1), at('preset'), presets)).toBeNull()
    expect(presetForKey('x', at('preset'), presets)).toBeNull()
  })
})

describe('a half-typed year is not a date — issue #54', () => {
  // A date field reports a complete value after the FIRST digit of the year,
  // so `12/24/2026` is typed through `0002-`, `0020-` and `0202-`. Every one
  // of those is in the past, every one clamps to tomorrow, and the picker
  // committed the first — the menu closed on the third keystroke of the year
  // and the toast said "Back tomorrow, 9:00". Scoping the digit shortcuts got
  // the keystrokes to the field; this is what stops the field answering before
  // the person has finished.
  it('refuses the years a date field reports while the year is being typed', () => {
    expect(clampedDeferDay('0002-12-24', NOW)).toBeNull()
    expect(clampedDeferDay('0020-12-24', NOW)).toBeNull()
    expect(clampedDeferDay('0202-12-24', NOW)).toBeNull()
  })

  it('answers the moment the fourth digit lands, clamped as issue 43 ruled', () => {
    expect(clampedDeferDay('2027-12-24', NOW)).toBe(maxDeferAt(NOW))
  })

  it('still clamps a real past date to tomorrow rather than refusing it', () => {
    // The near-end clamp is a ruling, not a side effect of the guard above:
    // a four-digit year that has gone is a date somebody meant.
    expect(clampedDeferDay('1999-01-01', NOW)).toBe(minDeferAt(NOW))
  })
})
