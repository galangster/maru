// The sidebar's status sentence, tested as data.
//
// Every case here is a sentence the app printed wrongly on 2026-08-31, when
// the owner reported: "none of the emails are syncing (or at least some
// aren't, I can't tell via the UI which ones aren't syncing)." The app knew
// which ones and why; the footer collapsed four accounts into one word.

import { describe, expect, it } from 'vitest'

import type { Account, SyncStatus } from '@/core/types'
import { DEVICE_NOUNS, describeSync, deviceNounFor, isUrgent } from '@/features/sidebar/sync-summary'

const NOW = 1_788_200_000_000
// The device noun is required rather than defaulted, so every case names one.
// The Mac is what the cases below are written against; the ones that are about
// the noun itself pass their own.
const MAC = DEVICE_NOUNS.mac

function account(id: string, email: string): Account {
  return { id, email, displayName: email, color: 'red', addedAt: 0 } as Account
}

const FOUR = [
  account('a', 'nick@metadao.fi'),
  account('b', 'nicholasgalang@gmail.com'),
  account('c', 'galangsterr@gmail.com'),
  account('d', 'nick@thecreative.company'),
]

function statuses(...list: SyncStatus[]): Record<string, SyncStatus> {
  return Object.fromEntries(list.map((s) => [s.accountId, s]))
}

const ok = (id: string, lastSyncAt = NOW - 60_000): SyncStatus => ({
  accountId: id,
  state: 'idle',
  lastSyncAt,
})

describe('describeSync', () => {
  it('never claims accounts it has not heard from are up to date', () => {
    // THE OWNER'S BUG. useSyncStatus is a partial record filled only by
    // events, so `.some(s => s.state === 'error')` was false and the footer
    // printed "Up to date" — a positive claim about three accounts the app
    // had heard nothing about.
    const sync = describeSync(FOUR, statuses(ok('a')), false, NOW, NOW, MAC)
    expect(sync.short).toBe('Starting…')
    expect(sync.detail).toBe('Maru is starting up. 3 of 4 accounts have not reported.')
    expect(isUrgent(sync)).toBe(false)
  })

  it('says nothing has reported when nothing has', () => {
    const sync = describeSync(FOUR, {}, false, NOW, NOW, MAC)
    expect(sync.detail).toBe('Maru is starting up. No account has reported yet.')
  })

  it('ignores statuses whose account is gone', () => {
    // useSyncStatus never deletes, so a removed account leaves a status behind
    // and would otherwise hold the whole app in a failure state forever.
    const ghost: SyncStatus = { accountId: 'deleted', state: 'error', needsReauth: true }
    const all = statuses(ok('a'), ok('b'), ok('c'), ok('d'), ghost)
    expect(describeSync(FOUR, all, false, NOW, NOW, MAC).short).toBe('Up to date')
  })

  it('names the one signed-out account and leaves the others alone', () => {
    const dead: SyncStatus = {
      accountId: 'a',
      state: 'error',
      needsReauth: true,
      error: 'invalid_grant',
    }
    const sync = describeSync(FOUR, statuses(dead, ok('b'), ok('c'), ok('d')), false, NOW, NOW, MAC)
    expect(sync.short).toBe('Sign in')
    expect(sync.full).toBe('Sign in again')
    expect(sync.address).toBe('nick@metadao.fi')
    expect(sync.detail).toBe(
      'nick@metadao.fi is signed out and its mail has stopped arriving. ' +
        'The other 3 accounts are up to date. Open Settings to sign in again.',
    )
    expect(isUrgent(sync)).toBe(true)
    expect(sync.action).toBe('accounts')
  })

  it('does not blame Google when the credentials are simply not on this Mac', () => {
    // Dev and release builds use different keychain services on purpose and
    // share one database, so a dev build reads four real accounts out of a
    // keychain holding none of their tokens. "Signed out by Google" is false
    // there — and equally false after a restored backup or on a new Mac.
    const local = (id: string): SyncStatus => ({
      accountId: id,
      state: 'error',
      needsReauth: true,
      noCredentials: true,
    })
    const sync = describeSync(
      FOUR,
      statuses(local('a'), local('b'), local('c'), local('d')),
      false,
      NOW,
      NOW,
      MAC,
    )
    expect(sync.full).toBe('4 accounts signed out')
    expect(sync.detail).toBe(
      'Maru has no saved sign-in for any account on this Mac, ' +
        'so no mail is arriving. Open Settings to sign in.',
    )
    expect(sync.detail).not.toContain('signed out by Google')
  })

  it('keeps a transient failure calm and uncoloured', () => {
    // A dropped connection is not an alarm. If this ever goes urgent, the app
    // starts shouting at people over Wi-Fi blips and they learn to ignore it.
    const blip = (id: string): SyncStatus => ({
      accountId: id,
      state: 'error',
      error: 'network timeout',
      lastSyncAt: NOW - 120_000,
    })
    const sync = describeSync(FOUR, statuses(blip('a'), blip('b'), blip('c'), blip('d')), false, NOW, NOW, MAC)
    expect(sync.short).toBe('Retrying')
    expect(isUrgent(sync)).toBe(false)
    expect(sync.detail).toBe(
      "Maru can't reach Google. It keeps trying; nothing is lost. Last synced 2m ago.",
    )
  })

  it('ranks a dead grant above a spinner', () => {
    // One needs a person, the other needs a moment.
    const dead: SyncStatus = { accountId: 'a', state: 'error', needsReauth: true }
    const busy: SyncStatus = { accountId: 'b', state: 'syncing' }
    const sync = describeSync(FOUR, statuses(dead, busy, ok('c'), ok('d')), false, NOW, NOW, MAC)
    expect(sync.short).toBe('Sign in')
  })

  it('blames the client, not the accounts, when Google rejects the client', () => {
    const rejected = (id: string): SyncStatus => ({
      accountId: id,
      state: 'error',
      clientFailure: true,
      needsReauth: true,
    })
    const sync = describeSync(FOUR, statuses(rejected('a'), rejected('b')), false, NOW, NOW, MAC)
    expect(sync.action).toBe('google')
    expect(sync.detail).toContain('not your accounts')
    // Counting accounts here would mislead: it is one fault, not two.
    expect(sync.detail).not.toContain('2 accounts')
  })

  it('does not blame Google when no OAuth client is configured at all', () => {
    // MissingOAuthClientError sets clientFailure so the remedy routes to
    // Settings → Google — but it is thrown before any network call, so Google
    // has never seen the request. Saying it "rejected" one is the same lie as
    // "signed out by Google" for an empty keychain.
    const none: SyncStatus = {
      accountId: 'a',
      state: 'error',
      clientFailure: true,
      noClientConfigured: true,
    }
    const sync = describeSync(FOUR, statuses(none), false, NOW, NOW, MAC)
    expect(sync.action).toBe('google')
    expect(isUrgent(sync)).toBe(true)
    expect(sync.detail).toContain('Nothing at Google is wrong')
    expect(sync.detail).not.toContain('rejected')
  })

  it('never counts an unheard account as up to date in the sentence', () => {
    // `accounts.length - errored.length` silently called two never-reported
    // accounts healthy — reintroducing the exact false claim this whole change
    // exists to delete, inside the one sentence a person actually reads.
    const dead: SyncStatus = { accountId: 'a', state: 'error', needsReauth: true }
    const sync = describeSync(FOUR, statuses(dead, ok('b')), false, NOW, NOW, MAC)
    expect(sync.detail).toContain('The other account is up to date.')
    expect(sync.detail).not.toContain('3 accounts are up to date')
  })

  it('does not count a syncing account as up to date either', () => {
    const dead: SyncStatus = { accountId: 'a', state: 'error', needsReauth: true }
    const busy: SyncStatus = { accountId: 'b', state: 'syncing' }
    const sync = describeSync(FOUR, statuses(dead, busy, ok('c'), ok('d')), false, NOW, NOW, MAC)
    expect(sync.detail).toContain('The other 2 accounts are up to date.')
  })

  it('says Starting… inside the grace period', () => {
    const sync = describeSync(FOUR, statuses(ok('a')), false, NOW, NOW - 5_000, MAC)
    expect(sync.short).toBe('Starting…')
    expect(sync.action).toBeNull()
  })

  it('stops saying Starting… once it is plainly not starting', () => {
    // "Starting…" is a promise that something is about to happen. After the
    // grace period the app cannot keep it, so it becomes a statement of fact
    // that offers somewhere to go, rather than standing forever.
    const sync = describeSync(FOUR, statuses(ok('a')), false, NOW, NOW - 45_000, MAC)
    expect(sync.short).toBe('Not synced')
    expect(sync.full).toBe('Not synced yet')
    expect(sync.detail).toContain('Mail is not arriving')
    expect(sync.action, 'and it now leads somewhere').toBe('accounts')
    // Still not an alarm: nothing is known to be broken, only silent.
    expect(isUrgent(sync)).toBe(false)
  })

  it('the escalation never fires while every account has reported', () => {
    // A long-running window must not decay into "Not synced yet" just because
    // it has been open a while.
    const all = statuses(ok('a'), ok('b'), ok('c'), ok('d'))
    const sync = describeSync(FOUR, all, false, NOW, NOW - 86_400_000, MAC)
    expect(sync.short).toBe('Up to date')
  })

  it('does not congratulate you on syncing zero accounts', () => {
    // `ages.length === total` was true for 0 === 0, and Math.min() of nothing
    // is Infinity, which elapsedTime clamps to "just now" — so an app with no
    // accounts reported "0 accounts · last synced just now". Reachable on
    // first run and after removing the last account.
    const sync = describeSync([], {}, false, NOW, NOW, MAC)
    expect(sync.detail).not.toContain('just now')
    expect(sync.detail).not.toContain('up to date')
    expect(sync.short).toBe('No account')
    expect(sync.action).toBe('accounts')
  })

  it('reports the OLDEST last-sync, not the luckiest account', () => {
    const all = statuses(
      ok('a', NOW - 60_000),
      ok('b', NOW - 7_200_000),
      ok('c', NOW - 60_000),
      ok('d', NOW - 60_000),
    )
    // "last synced 1m ago" would be true of one account and false of the view.
    expect(describeSync(FOUR, all, false, NOW, NOW, MAC).detail).toBe('4 accounts · last synced 2h ago')
  })

  it('counts only the accounts actually syncing', () => {
    const sync = describeSync(
      FOUR,
      statuses({ accountId: 'a', state: 'syncing' }, ok('b'), ok('c'), ok('d')),
      false,
      NOW,
      NOW,
      MAC,
    )
    expect(sync.detail).toBe('Syncing 1 of 4 accounts.')
    expect(sync.kind).toBe('syncing')
  })

  it('demo mode outranks everything and is never a control', () => {
    const dead: SyncStatus = { accountId: 'a', state: 'error', needsReauth: true }
    const sync = describeSync(FOUR, statuses(dead), true, NOW, NOW, MAC)
    expect(sync.short).toBe('Demo data')
    expect(sync.action).toBeNull()
    expect(isUrgent(sync)).toBe(false)
  })

  it('keeps the short string inside the pixel budget', () => {
    // ~76px is left at the @[13rem] gate after the three 18px buttons. Longer
    // than this truncates mid-word, which is the N7 failure the gate was
    // bought to close.
    const cases: Record<string, SyncStatus>[] = [
      {},
      statuses(ok('a')),
      statuses({ accountId: 'a', state: 'error', needsReauth: true }),
      statuses({ accountId: 'a', state: 'error', clientFailure: true }),
      statuses({ accountId: 'a', state: 'error', clientFailure: true, noClientConfigured: true }),
      statuses({ accountId: 'a', state: 'error', needsReauth: true, noCredentials: true }),
      statuses({ accountId: 'a', state: 'error' }),
      statuses({ accountId: 'a', state: 'syncing' }),
      statuses(ok('a'), ok('b'), ok('c'), ok('d')),
    ]
    for (const s of cases) {
      expect(describeSync(FOUR, s, false, NOW, NOW, MAC).short.length).toBeLessThanOrEqual(11)
    }
  })
})

/**
 * The machine the two local-state sentences are about (issue 52).
 *
 * Four of the six failure messages say nothing about a device and read
 * correctly everywhere. Two are about THIS machine — an OAuth client that was
 * never configured here, and a keychain that holds no sign-in here — and both
 * said "on this Mac" on an iPhone, and on a PC.
 */
describe('the device the sentence names', () => {
  const local = (id: string): SyncStatus => ({
    accountId: id,
    state: 'error',
    needsReauth: true,
    noCredentials: true,
  })

  it('names each platform once', () => {
    expect(deviceNounFor('ios')).toBe('this phone')
    expect(deviceNounFor('mac')).toBe('this Mac')
    expect(deviceNounFor('windows')).toBe('this PC')
    // Linux and anything else. Named rather than left out: a sentence with a
    // hole in it is worse than one that is merely unspecific.
    expect(deviceNounFor('other')).toBe('this computer')
  })

  it('says "this phone" on the phone, for the missing client', () => {
    const missing: SyncStatus = {
      accountId: 'a',
      state: 'error',
      needsReauth: true,
      clientFailure: true,
      noClientConfigured: true,
    }
    const sync = describeSync(FOUR, statuses(missing), false, NOW, NOW, DEVICE_NOUNS.ios)
    expect(sync.detail).toBe(
      'Maru has no Google OAuth client configured on this phone, so no mail is ' +
        'arriving. Nothing at Google is wrong. Open Settings to add a client ID.',
    )
    expect(sync.detail).not.toContain('Mac')
  })

  it('says "this phone" on the phone, for the empty keychain', () => {
    const all = describeSync(
      FOUR,
      statuses(local('a'), local('b'), local('c'), local('d')),
      false,
      NOW,
      NOW,
      DEVICE_NOUNS.ios,
    )
    expect(all.detail).toBe(
      'Maru has no saved sign-in for any account on this phone, ' +
        'so no mail is arriving. Open Settings to sign in.',
    )

    const some = describeSync(FOUR, statuses(local('a')), false, NOW, NOW, DEVICE_NOUNS.ios)
    expect(some.detail).toContain('for nick@metadao.fi on this phone,')
  })

  it('leaves the four device-neutral sentences alone', () => {
    // The noun reaches two messages and no others. A summary that started
    // naming the device in every state would be four regressions for one fix.
    const blip = (id: string): SyncStatus => ({
      accountId: id,
      state: 'error',
      error: 'network timeout',
      lastSyncAt: NOW - 120_000,
    })
    for (const device of Object.values(DEVICE_NOUNS)) {
      const stalled = describeSync(FOUR, statuses(blip('a'), blip('b'), blip('c'), blip('d')), false, NOW, NOW, device)
      expect(stalled.detail).not.toContain(device)
    }
  })
})
