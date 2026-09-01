import { describe, expect, it } from 'vitest'

import type { Thread } from '@/core/types'
import {
  buildMobileRowModel,
  mobileNavigationReducer,
  resolveSwipeIntent,
} from '@/mobile/state'

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    key: 'account/thread-1',
    gmailThreadId: 'thread-1',
    accountId: 'account',
    subject: 'Plans for Friday',
    snippet: 'I will bring the revised copy.',
    lastMessageAt: new Date(2026, 8, 1, 10, 30).getTime(),
    participants: [
      { name: 'Nick Galang', email: 'nick@example.com' },
      { name: 'Maya Ellison', email: 'maya@example.com' },
    ],
    labelIds: ['INBOX', 'UNREAD'],
    unread: true,
    starred: false,
    messageCount: 2,
    hasAttachments: true,
    ...overrides,
  }
}

describe('mobile navigation reducer', () => {
  it('pushes a thread and pops back to the inbox', () => {
    const pushed = mobileNavigationReducer(
      [{ kind: 'inbox' }],
      { type: 'pushThread', threadKey: 'account/thread-1' },
    )
    expect(pushed).toEqual([
      { kind: 'inbox' },
      { kind: 'thread', threadKey: 'account/thread-1' },
    ])
    expect(mobileNavigationReducer(pushed, { type: 'pop' })).toEqual([{ kind: 'inbox' }])
  })

  it('never pops the root route', () => {
    const root = [{ kind: 'inbox' }] as const
    expect(mobileNavigationReducer([...root], { type: 'pop' })).toEqual(root)
  })
})

describe('mobile swipe intent', () => {
  it('maps a right swipe to archive and a left swipe to Later', () => {
    expect(resolveSwipeIntent(72, 4)).toBe('archive')
    expect(resolveSwipeIntent(-90, 8)).toBe('later')
  })

  it('ignores short and mostly vertical gestures', () => {
    expect(resolveSwipeIntent(60, 2)).toBeNull()
    expect(resolveSwipeIntent(90, 80)).toBeNull()
  })
})

describe('mobile row model', () => {
  it('removes the signed-in account from the sender line', () => {
    const now = new Date(2026, 8, 1, 12, 0).getTime()
    const model = buildMobileRowModel(thread(), ['NICK@example.com'], now)
    expect(model.sender).toBe('Maya Ellison')
    expect(model.subject).toBe('Plans for Friday')
    expect(model.unread).toBe(true)
    expect(model.messageCount).toBe(2)
    expect(model.hasAttachments).toBe(true)
  })
})
