// The conversation lens — M8. Which way the messages run, and which are open.

import { describe, it, expect } from 'vitest'

import type { Message } from '../src/core/types'
import {
  displayMessages,
  expandedIds,
  normalizeExpansion,
  toggleExpanded,
} from '../src/features/reading/conversation'

function message(id: string, date: number): Message {
  return {
    id,
    threadKey: 't',
    accountId: 'acct',
    from: { name: id, email: `${id}@example.com` },
    to: [],
    cc: [],
    bcc: [],
    subject: id,
    snippet: '',
    date,
    bodyHtml: '',
    bodyState: 'full',
    labelIds: [],
    attachments: [],
    unread: false,
    starred: false,
  } as unknown as Message
}

const THREAD = [message('m1', 100), message('m2', 200), message('m3', 300)]

describe('displayMessages', () => {
  it('chronological is the identity — the store order passes through', () => {
    expect(displayMessages(THREAD, 'chronological')).toBe(THREAD)
  })

  it('newest-first is a reversed copy; the input is untouched', () => {
    const out = displayMessages(THREAD, 'newestFirst')
    expect(out.map((m) => m.id)).toEqual(['m3', 'm2', 'm1'])
    expect(THREAD.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })
})

describe('expandedIds', () => {
  it('default opens the newest message only, whichever way the display runs', () => {
    expect([...expandedIds(THREAD, 'default')]).toEqual(['m3'])
  })

  it('all and none are what they say', () => {
    expect([...expandedIds(THREAD, 'all')].sort()).toEqual(['m1', 'm2', 'm3'])
    expect(expandedIds(THREAD, 'none').size).toBe(0)
  })

  it('a set passes through as the state it is', () => {
    const manual = new Set(['m1'])
    expect(expandedIds(THREAD, manual)).toBe(manual)
  })

  it('an empty thread defaults to nothing open, not a crash', () => {
    expect(expandedIds([], 'default').size).toBe(0)
  })
})

describe('toggleExpanded', () => {
  it('adds, removes, and never mutates the input', () => {
    const start = new Set(['m3'])
    const opened = toggleExpanded(start, 'm1')
    expect([...opened].sort()).toEqual(['m1', 'm3'])
    const closed = toggleExpanded(opened, 'm3')
    expect([...closed]).toEqual(['m1'])
    expect([...start]).toEqual(['m3'])
  })
})

describe('normalizeExpansion', () => {
  it('a hand-built all-open set becomes the named state the keymap toggles on', () => {
    expect(normalizeExpansion(new Set(['m1', 'm2', 'm3']), THREAD)).toBe('all')
  })

  it('an emptied set becomes none', () => {
    expect(normalizeExpansion(new Set(), THREAD)).toBe('none')
  })

  it('a partial set stays itself', () => {
    const partial = new Set(['m2'])
    expect(normalizeExpansion(partial, THREAD)).toBe(partial)
  })
})
