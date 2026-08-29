// The list lens — M7. Pure: the service's order comes in, a per-view sort and
// filter go on top, and nothing about the mailbox itself changes.

import { describe, it, expect } from 'vitest'

import type { Thread } from '../src/core/types'
import { applyListPrefs, filterEmptyCopy } from '../src/features/list/list-prefs'
import { DEFAULT_LIST_PREFS } from '../src/features/mail/ui-store'

function thread(key: string, at: number, flags: Partial<Thread> = {}): Thread {
  return {
    key,
    gmailThreadId: key,
    accountId: 'acct',
    subject: key,
    snippet: '',
    lastMessageAt: at,
    participants: [],
    labelIds: [],
    unread: false,
    starred: false,
    messageCount: 1,
    hasAttachments: false,
    ...flags,
  }
}

const MAILBOX = [
  thread('a', 400, { unread: true }),
  thread('b', 300, { starred: true }),
  thread('c', 200, { unread: true, hasAttachments: true }),
  thread('d', 100),
]

describe('applyListPrefs', () => {
  it('the default lens is the identity: the service order passes through untouched', () => {
    expect(applyListPrefs(MAILBOX, DEFAULT_LIST_PREFS)).toBe(MAILBOX)
  })

  it('a filtered lens re-proves newest-first even over shuffled input', () => {
    const shuffled = [MAILBOX[2], MAILBOX[0]]
    expect(
      applyListPrefs(shuffled, { sort: 'newest', filter: 'unread' }).map((t) => t.key),
    ).toEqual(['a', 'c'])
  })

  it('oldest-first reverses the order without touching membership', () => {
    const out = applyListPrefs(MAILBOX, { sort: 'oldest', filter: 'all' })
    expect(out.map((t) => t.key)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('ties break by key, the same rule the service uses', () => {
    const tied = [thread('z', 500), thread('y', 500)]
    expect(
      applyListPrefs(tied, { sort: 'newest', filter: 'unread' }).map((t) => t.key),
    ).toEqual([])
    expect(
      applyListPrefs(tied, { sort: 'oldest', filter: 'all' }).map((t) => t.key),
    ).toEqual(['y', 'z'])
    expect(
      applyListPrefs([thread('z', 500, { unread: true }), thread('y', 500, { unread: true })], {
        sort: 'newest',
        filter: 'unread',
      }).map((t) => t.key),
    ).toEqual(['y', 'z'])
  })

  it.each([
    ['unread', ['a', 'c']],
    ['starred', ['b']],
    ['attachments', ['c']],
  ] as const)('filter %s keeps only matching threads, in sort order', (filter, keys) => {
    expect(applyListPrefs(MAILBOX, { sort: 'newest', filter }).map((t) => t.key)).toEqual([
      ...keys,
    ])
  })

  it('does not mutate the input array', () => {
    const input = [...MAILBOX]
    applyListPrefs(input, { sort: 'oldest', filter: 'all' })
    expect(input.map((t) => t.key)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('filterEmptyCopy', () => {
  it('never borrows the folder empty states', () => {
    for (const filter of ['unread', 'starred', 'attachments'] as const) {
      const copy = filterEmptyCopy(filter)
      expect(copy.title).not.toBe('Inbox zero')
      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.subtitle.length).toBeGreaterThan(0)
    }
  })
})
