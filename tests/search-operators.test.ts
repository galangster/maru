import { describe, it, expect } from 'vitest'
import { ThreadSearchIndex } from '../src/core/search/index'
import {
  parseSearchQuery,
  matchesFilters,
  searchWithOperators,
} from '../src/core/search/operators'
import { makeThread } from './fixtures/domain'

describe('parseSearchQuery', () => {
  it('passes an operator-free query through as text', () => {
    const { text, filters } = parseSearchQuery('flight confirmation')
    expect(text).toBe('flight confirmation')
    expect(filters).toEqual({ people: [], labels: [] })
  })

  it('lifts each operator out of the text', () => {
    const { text, filters } = parseSearchQuery(
      'from:maya is:unread has:attachment label:receipts site visit',
    )
    expect(text).toBe('site visit')
    expect(filters.people).toEqual(['maya'])
    expect(filters.unread).toBe(true)
    expect(filters.attachment).toBe(true)
    expect(filters.labels).toEqual(['receipts'])
  })

  it('treats from: and to: both as participants, case-insensitively', () => {
    const { filters } = parseSearchQuery('FROM:Maya TO:orders@harlowsupply.example')
    expect(filters.people).toEqual(['maya', 'orders@harlowsupply.example'])
  })

  it('reads quoted values and is:read / is:starred', () => {
    const { text, filters } = parseSearchQuery('label:"Big Deals" is:read is:starred')
    expect(text).toBe('')
    expect(filters.labels).toEqual(['big deals'])
    expect(filters.unread).toBe(false)
    expect(filters.starred).toBe(true)
  })

  it('drops an unknown is:/has: value instead of inventing a filter', () => {
    const { text, filters } = parseSearchQuery('is:snoozed has:video hello')
    expect(text).toBe('hello')
    expect(filters).toEqual({ people: [], labels: [] })
  })
})

describe('matchesFilters', () => {
  const thread = makeThread({
    unread: true,
    starred: false,
    hasAttachments: true,
    labelIds: ['INBOX', 'Label_7'],
    participants: [{ name: 'Maya Ellison', email: 'maya@fernwood.dev' }],
  })

  it('matches on flags and participants together', () => {
    const { filters } = parseSearchQuery('from:fernwood is:unread has:attachment')
    expect(matchesFilters(thread, filters, [])).toBe(true)
  })

  it('refuses when any one filter misses', () => {
    expect(matchesFilters(thread, parseSearchQuery('is:starred').filters, [])).toBe(false)
    expect(matchesFilters(thread, parseSearchQuery('from:harlow').filters, [])).toBe(false)
    expect(matchesFilters(thread, parseSearchQuery('is:read').filters, [])).toBe(false)
  })

  it('matches labels by resolved id, and a typo (unresolved name) matches nothing', () => {
    const { filters } = parseSearchQuery('label:receipts')
    expect(matchesFilters(thread, filters, ['Label_7'])).toBe(true)
    expect(matchesFilters(thread, filters, [])).toBe(false)
  })
})

describe('searchWithOperators', () => {
  const idx = new ThreadSearchIndex()
  idx.replaceAll([
    makeThread({
      gmailThreadId: 'a',
      subject: 'Tuesday walkthrough',
      participants: [{ name: 'Maya Ellison', email: 'maya@fernwood.dev' }],
      unread: true,
      lastMessageAt: 300,
    }),
    makeThread({
      gmailThreadId: 'b',
      subject: 'Order shipped',
      participants: [{ name: 'Harlow Supply', email: 'orders@harlowsupply.example' }],
      hasAttachments: true,
      labelIds: ['INBOX', 'Label_9'],
      lastMessageAt: 200,
    }),
    makeThread({
      gmailThreadId: 'c',
      subject: 'Walkthrough notes',
      participants: [{ name: 'Harlow Supply', email: 'orders@harlowsupply.example' }],
      lastMessageAt: 100,
    }),
  ])
  const labels = [
    { id: 'Label_9', accountId: 'acct-1', name: 'Receipts', type: 'user' as const },
    { id: 'INBOX', accountId: 'acct-1', name: 'Inbox', type: 'system' as const },
  ]

  it('filters text results by operator', () => {
    const hits = searchWithOperators(idx, 'walkthrough from:harlow', labels)
    expect(hits.map((t) => t.gmailThreadId)).toEqual(['c'])
  })

  it('answers operator-only queries over the whole index, newest first', () => {
    expect(searchWithOperators(idx, 'from:harlow', labels).map((t) => t.gmailThreadId)).toEqual([
      'b',
      'c',
    ])
    expect(searchWithOperators(idx, 'is:unread', labels).map((t) => t.gmailThreadId)).toEqual(['a'])
    expect(
      searchWithOperators(idx, 'label:Receipts has:attachment', labels).map(
        (t) => t.gmailThreadId,
      ),
    ).toEqual(['b'])
  })

  it('returns nothing for an empty query or an unknown label', () => {
    expect(searchWithOperators(idx, '   ', labels)).toEqual([])
    expect(searchWithOperators(idx, 'label:nope', labels)).toEqual([])
  })
})
