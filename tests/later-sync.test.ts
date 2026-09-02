// A9 — Later across devices.
//
// Owner ruling, Nick 2026-09-02: yes, deferrals sync inside the encrypted
// vault. P21 chose local-only because a label-based snooze fails UNSAFE; that
// reasoning is untouched here and this file is careful to show it. What A9
// changes is only where the local predicate's INPUT comes from.
//
// Three things are worth a test, in the order they can hurt:
//
//  1. the merge rule (MARU-ACCOUNT.md §6) — get it wrong and a clear on the
//     phone is silently undone by the Mac's stale copy, which is mail hiding
//     itself with nothing on screen to explain it;
//  2. the round trip through the real store and the real port, with a Gmail
//     client that THROWS on every method — the fail-safe property, asserted
//     rather than described;
//  3. the push trigger, because a Later nobody pushes is a Later that did not
//     sync and looks exactly like a bug in the merge.

import { describe, expect, it } from 'vitest'

import {
  DEFERRAL_TTL_MS,
  applyVault,
  buildVault,
  mergeDeferrals,
  mergeVault,
  type VaultDeferral,
  type VaultDocument,
  type VaultLocal,
} from '../src/core/account/vault'
import { DemoMailService } from '../src/core/service/demo'
import { RealMailService, type MailGmailClient } from '../src/core/service/real'
import { Store } from '../src/core/store/db'
import type { Account, MailEvent, Settings } from '../src/core/types'
import { schedulesPush } from '../src/features/settings/account/account-store'
import { makeAccount, makeThread } from './fixtures/domain'
import { NodePlatform } from './helpers/node-platform'

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const EMAIL = 'nick@gmail.com'

const live = (until: number, setAt: number, threadId = 't-1'): VaultDeferral =>
  ({ accountEmail: EMAIL, threadId, until, setAt })
const tomb = (clearedAt: number, threadId = 't-1'): VaultDeferral =>
  ({ accountEmail: EMAIL, threadId, until: null, clearedAt })

// ---------------------------------------------------------------------------
// Risk 1: the merge rule — MARU-ACCOUNT.md §6
// ---------------------------------------------------------------------------

describe('mergeDeferrals', () => {
  it('unions by (accountEmail, threadId) and keeps both devices’ threads', () => {
    const merged = mergeDeferrals(
      [live(NOW + DAY, NOW, 't-1')],
      [{ accountEmail: 'other@gmail.com', threadId: 't-1', until: NOW + DAY, setAt: NOW }],
      NOW,
    )
    // Same thread id, different address: two different conversations.
    expect(merged).toHaveLength(2)
  })

  it('lets the later until win between two live deferrals', () => {
    const merged = mergeDeferrals([live(NOW + DAY, NOW)], [live(NOW + 3 * DAY, NOW - 1000)], NOW)
    expect(merged).toEqual([live(NOW + 3 * DAY, NOW - 1000)])
    // And the order of the arguments cannot change the answer.
    expect(mergeDeferrals([live(NOW + 3 * DAY, NOW - 1000)], [live(NOW + DAY, NOW)], NOW))
      .toEqual([live(NOW + 3 * DAY, NOW - 1000)])
  })

  it('lets a tombstone beat an older until, even one still in the future', () => {
    // The case the whole tombstone exists for. Saved for Monday on the Mac,
    // brought back by hand on Sunday from the phone. Comparing `clearedAt` to
    // `until` would re-hide it; comparing it to `setAt` does not.
    const merged = mergeDeferrals([live(NOW + 2 * DAY, NOW)], [tomb(NOW + DAY)], NOW)
    expect(merged).toEqual([tomb(NOW + DAY)])
    expect(mergeDeferrals([tomb(NOW + DAY)], [live(NOW + 2 * DAY, NOW)], NOW))
      .toEqual([tomb(NOW + DAY)])
  })

  it('lets a re-save made after the clear beat the tombstone', () => {
    const merged = mergeDeferrals([tomb(NOW)], [live(NOW + 2 * DAY, NOW + 1000)], NOW)
    expect(merged).toEqual([live(NOW + 2 * DAY, NOW + 1000)])
  })

  it('keeps the later clear between two tombstones', () => {
    expect(mergeDeferrals([tomb(NOW)], [tomb(NOW + 1000)], NOW)).toEqual([tomb(NOW + 1000)])
    expect(mergeDeferrals([tomb(NOW + 1000)], [tomb(NOW)], NOW)).toEqual([tomb(NOW + 1000)])
  })

  it('treats a payload with no stamp as stamped at zero, so the tombstone wins', () => {
    const stampless: VaultDeferral = { accountEmail: EMAIL, threadId: 't-1', until: NOW + DAY }
    expect(mergeDeferrals([stampless], [tomb(NOW)], NOW)).toEqual([tomb(NOW)])
  })

  it('drops tombstones older than the TTL, and keeps ones inside it', () => {
    expect(mergeDeferrals([tomb(NOW - DEFERRAL_TTL_MS - 1)], [], NOW)).toEqual([])
    expect(mergeDeferrals([tomb(NOW - DEFERRAL_TTL_MS + DAY)], [], NOW))
      .toEqual([tomb(NOW - DEFERRAL_TTL_MS + DAY)])
  })

  it('drops a live entry whose moment passed more than the TTL ago', () => {
    // Otherwise the union resurrects it from the other copy forever, and the
    // 256 KiB document cap is the thing that eventually notices.
    expect(mergeDeferrals([live(NOW - DEFERRAL_TTL_MS - 1, NOW - DEFERRAL_TTL_MS - 1)], [], NOW))
      .toEqual([])
  })

  it('prunes on the way out of mergeVault, using the document clock', () => {
    const doc = (updatedAt: number, deferrals: VaultDeferral[]): VaultDocument => ({
      v: 1,
      updatedAt,
      settings: { theme: 'dark', imagePolicy: 'allow', pollIntervalSec: 60, sounds: false, conversationOrder: 'chronological' },
      accounts: [],
      credentials: { desktop: {}, ios: {} },
      deferrals,
    })
    const merged = mergeVault(doc(NOW, [tomb(NOW - DEFERRAL_TTL_MS - 1)]), doc(NOW, [live(NOW + DAY, NOW)]))
    expect(merged.deferrals).toEqual([live(NOW + DAY, NOW)])
  })

  it('leaves deferrals absent when neither copy carries any', () => {
    // Absent means "this writer had nothing to say", which is not the same as
    // an empty list and must not overwrite a copy that does.
    const bare: VaultDocument = {
      v: 1,
      updatedAt: NOW,
      settings: { theme: 'dark', imagePolicy: 'allow', pollIntervalSec: 60, sounds: false, conversationOrder: 'chronological' },
      accounts: [],
      credentials: { desktop: {}, ios: {} },
    }
    expect(mergeVault(bare, bare).deferrals).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// build and apply, against a fake port
// ---------------------------------------------------------------------------

const settings: Settings = {
  theme: 'dark', imagePolicy: 'allow', pollIntervalSec: 60, sounds: false,
  conversationOrder: 'chronological',
}

class FakeLocal implements VaultLocal {
  accounts: Account[] = [makeAccount()]
  deferrals: VaultDeferral[] = []
  applied: VaultDeferral[][] = []
  getSettings = async () => settings
  setSettings = async () => {}
  listAccounts = async () => [...this.accounts]
  upsertAccount = async () => {}
  removeAccount = async () => {}
  loadCredential = async () => null
  saveCredential = async () => {}
  clearCredential = async () => {}
  listDeferrals = async () => [...this.deferrals]
  applyDeferrals = async (entries: VaultDeferral[]) => {
    this.applied.push(entries)
    return entries.length
  }
  now = () => NOW
}

describe('the vault document', () => {
  it('carries this device’s live deferrals and tombstones', async () => {
    const local = new FakeLocal()
    local.deferrals = [live(NOW + DAY, NOW, 't-1'), tomb(NOW, 't-2')]
    const doc = await buildVault(local, 'desktop', NOW)
    expect(doc.deferrals).toEqual([live(NOW + DAY, NOW, 't-1'), tomb(NOW, 't-2')])
  })

  it('prunes expired entries at build time', async () => {
    const local = new FakeLocal()
    local.deferrals = [tomb(NOW - DEFERRAL_TTL_MS - 1, 't-9'), live(NOW + DAY, NOW)]
    const doc = await buildVault(local, 'desktop', NOW)
    expect(doc.deferrals).toEqual([live(NOW + DAY, NOW)])
  })

  it('omits the field entirely when the port cannot list deferrals', async () => {
    const local = new FakeLocal()
    const bare = { ...local, listDeferrals: undefined } as unknown as VaultLocal
    expect((await buildVault(bare, 'desktop', NOW)).deferrals).toBeUndefined()
  })
})

describe('applyVault', () => {
  const doc = (deferrals?: VaultDeferral[]): VaultDocument => ({
    v: 1,
    updatedAt: NOW,
    settings,
    accounts: [{ email: EMAIL, label: 'Personal' }],
    credentials: { desktop: {}, ios: {} },
    ...(deferrals ? { deferrals } : {}),
  })

  it('writes an incoming deferral through the port', async () => {
    const local = new FakeLocal()
    const summary = await applyVault(doc([live(NOW + DAY, NOW)]), local, 'desktop')
    expect(local.applied).toEqual([[live(NOW + DAY, NOW)]])
    expect(summary.deferrals).toBe(1)
  })

  it('writes nothing when the incoming entry matches what this device holds', async () => {
    const local = new FakeLocal()
    local.deferrals = [live(NOW + DAY, NOW)]
    const summary = await applyVault(doc([live(NOW + DAY, NOW)]), local, 'desktop')
    expect(local.applied).toEqual([])
    expect(summary.deferrals).toBe(0)
  })

  it('does not let a stale pull undo a Later set here more recently', async () => {
    // The reason apply re-runs the merge instead of writing what it was given:
    // the server's copy can easily predate an action taken thirty seconds ago
    // on this very machine.
    const local = new FakeLocal()
    local.deferrals = [live(NOW + 5 * DAY, NOW)]
    const summary = await applyVault(doc([live(NOW + DAY, NOW - 10_000)]), local, 'desktop')
    expect(local.applied).toEqual([])
    expect(summary.deferrals).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Risk 2: the real store, the real port, and a Gmail client that throws
// ---------------------------------------------------------------------------

/**
 * Every Gmail method, replaced by one that fails the test if it is called.
 *
 * "Later touches no Gmail method" is P21's load-bearing claim and A9 must not
 * quietly break it. Asserting it this way costs one Proxy and catches a call
 * added anywhere under `defer`, the vault port, or the store.
 */
const noGmail = new Proxy({}, {
  get: (_target, method) => () => {
    throw new Error(`Later reached Gmail: ${String(method)}`)
  },
}) as MailGmailClient

async function device(name: string) {
  const platform = new NodePlatform()
  const store = await Store.open(platform)
  await store.upsertAccount(makeAccount({ id: `${name}-acct`, email: EMAIL }))
  await store.upsertThreads([
    makeThread({ accountId: `${name}-acct`, gmailThreadId: 't-1' }),
    makeThread({ accountId: `${name}-acct`, gmailThreadId: 't-2' }),
  ])
  const events: MailEvent[] = []
  const svc = await RealMailService.create({
    platform,
    store,
    family: 'desktop',
    autoStart: false,
    // A fixed clock, because the TTL prune is measured against the document's
    // own `updatedAt` and a wall clock would make this test age out.
    now: () => NOW,
    createClient: () => noGmail,
  })
  svc.onEvent((event) => events.push(event))
  return { store, svc, events, local: svc.accountVaultLocal() }
}

describe('two devices over one vault', () => {
  it('carries a Later from one device to the other, and a clear back again', async () => {
    const mac = await device('mac')
    const phone = await device('phone')

    await mac.svc.defer('mac-acct/t-1', NOW + 2 * DAY)
    const fromMac = await buildVault(mac.local, 'desktop', NOW)
    expect(fromMac.deferrals).toEqual([
      { accountEmail: EMAIL, threadId: 't-1', until: NOW + 2 * DAY, setAt: expect.any(Number) },
    ])

    await applyVault(fromMac, phone.local, 'desktop')
    expect((await phone.store.getThread('phone-acct/t-1'))?.deferredUntil).toBe(NOW + 2 * DAY)

    // Now the phone brings it back, and the Mac must not re-hide it.
    await phone.svc.defer('phone-acct/t-1', null)
    const fromPhone = await buildVault(phone.local, 'desktop', NOW)
    expect(fromPhone.deferrals).toEqual([
      { accountEmail: EMAIL, threadId: 't-1', until: null, clearedAt: expect.any(Number) },
    ])

    await applyVault(fromPhone, mac.local, 'desktop')
    expect((await mac.store.getThread('mac-acct/t-1'))?.deferredUntil).toBeUndefined()
  })

  it('ignores an entry for an address this device has not signed into', async () => {
    const mac = await device('mac')
    const written = await mac.local.applyDeferrals!([
      { accountEmail: 'someone-else@gmail.com', threadId: 't-1', until: NOW + DAY, setAt: NOW },
    ])
    expect(written).toBe(0)
    expect((await mac.store.getThread('mac-acct/t-1'))?.deferredUntil).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The store's half: the tombstone
// ---------------------------------------------------------------------------

describe('thread_defer_cleared', () => {
  async function seeded() {
    const platform = new NodePlatform()
    const store = await Store.open(platform)
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread(), makeThread({ gmailThreadId: 't-2' })])
    return store
  }

  it('writes a tombstone on a clear and reports how many rows moved', async () => {
    const store = await seeded()
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    expect(await store.clearDeferral(['acct-1/t-1', 'acct-1/t-2'], NOW)).toBe(1)
    expect(await store.deferralRecords()).toEqual([
      { threadKey: 'acct-1/t-1', accountId: 'acct-1', until: null, at: NOW },
    ])
  })

  it('writes no tombstone for a thread that was never saved', async () => {
    const store = await seeded()
    expect(await store.clearDeferral(['acct-1/t-2'], NOW)).toBe(0)
    expect(await store.deferralRecords()).toEqual([])
  })

  it('answers the tombstone when the thread is saved again', async () => {
    const store = await seeded()
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    await store.clearDeferral(['acct-1/t-1'], NOW)
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + 3 * DAY, NOW + 1000)
    expect(await store.deferralRecords()).toEqual([
      { threadKey: 'acct-1/t-1', accountId: 'acct-1', until: NOW + 3 * DAY, at: NOW + 1000 },
    ])
  })

  it('drops a tombstone on the lazy sweep once it is past the TTL', async () => {
    const store = await seeded()
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    await store.clearDeferral(['acct-1/t-1'], NOW)
    await store.sweepDeferrals(NOW + DEFERRAL_TTL_MS - DAY)
    expect(await store.deferralRecords()).toHaveLength(1)
    await store.sweepDeferrals(NOW + DEFERRAL_TTL_MS + DAY)
    expect(await store.deferralRecords()).toEqual([])
  })

  it('leaves nothing behind after "delete my data"', async () => {
    const platform = new NodePlatform()
    const store = await Store.open(platform)
    const db = (await platform.sqlOpen()) as unknown as { raw: import('better-sqlite3').Database }
    await store.upsertAccount(makeAccount())
    await store.upsertThreads([makeThread()])
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    await store.clearDeferral(['acct-1/t-1'], NOW)

    await store.deleteAccount('acct-1', NOW)
    expect(
      db.raw.prepare('SELECT COUNT(*) AS n FROM thread_defer_cleared').get() as { n: number },
    ).toEqual({ n: 0 })
  })

  it('does not orphan a tombstone when a thread falls out of the 90-day window', async () => {
    const store = await seeded()
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW + DAY, NOW)
    await store.clearDeferral(['acct-1/t-1'], NOW)
    await store.deleteThreads(['acct-1/t-1'])
    expect(await store.deferralRecords()).toEqual([])
  })

  it('omits a woken deferral, because wake_at > now is already true everywhere', async () => {
    const store = await seeded()
    await store.setDeferral('acct-1/t-1', 'acct-1', NOW - DAY, NOW - 2 * DAY)
    await store.sweepDeferrals(NOW)
    expect(await store.deferralRecords()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Risk 3: the push trigger
// ---------------------------------------------------------------------------

describe('the push trigger', () => {
  it('fires for a deferral change and not for a sync pass', () => {
    expect(schedulesPush({ type: 'deferralsChanged' })).toBe(true)
    expect(schedulesPush({ type: 'accountsChanged' })).toBe(true)
    expect(schedulesPush({ type: 'settingsChanged' })).toBe(true)
    expect(schedulesPush({ type: 'threadsChanged' })).toBe(false)
  })

  it('is announced on a Later commit and on a clear', async () => {
    const svc = new DemoMailService({ now: NOW })
    const events: MailEvent[] = []
    svc.onEvent((event) => events.push(event))
    const [thread] = await svc.listThreads({ kind: 'unified', folder: 'inbox' })

    await svc.defer(thread.key, NOW + DAY)
    expect(events.filter(schedulesPush)).toEqual([{ type: 'deferralsChanged' }])

    await svc.defer(thread.key, null)
    expect(events.filter(schedulesPush)).toHaveLength(2)
  })

  it('stays silent on a real service until a deferral actually moves', async () => {
    const mac = await device('mac')
    // The engine's reply-wake shape: offered a thread that was never deferred.
    expect(await mac.store.clearDeferral(['mac-acct/t-2'], NOW)).toBe(0)
    expect(mac.events.filter(schedulesPush)).toEqual([])

    await mac.svc.defer('mac-acct/t-1', NOW + DAY)
    expect(mac.events.filter(schedulesPush)).toEqual([{ type: 'deferralsChanged' }])
  })
})
