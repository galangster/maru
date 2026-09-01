import { describe, expect, it } from 'vitest'

import type { Thread } from '@/core/types'
import {
  buildMobileRowModel,
  initialMobileRoute,
  mobileRouteReducer,
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

describe('mobile route reducer', () => {
  it('changes tabs and resets the stack and sheet', () => {
    const state = mobileRouteReducer(initialMobileRoute, {
      type: 'openSheet',
      sheet: { kind: 'later', threadKeys: ['account/thread-1'] },
    })
    expect(mobileRouteReducer(state, { type: 'changeTab', tab: 'search' })).toEqual({
      tab: 'search',
      stack: [{ kind: 'inbox' }],
      sheet: null,
    })
  })

  it('pushes a thread and pops back to the root', () => {
    const pushed = mobileRouteReducer(initialMobileRoute, {
      type: 'push',
      entry: { kind: 'thread', threadKey: 'account/thread-1' },
    })
    expect(pushed.stack).toEqual([
      { kind: 'inbox' },
      { kind: 'thread', threadKey: 'account/thread-1' },
    ])
    expect(mobileRouteReducer(pushed, { type: 'back' }).stack).toEqual([{ kind: 'inbox' }])
  })

  it('pushes the account screen from Settings and pops back', () => {
    const settings = mobileRouteReducer(initialMobileRoute, { type: 'changeTab', tab: 'settings' })
    const account = mobileRouteReducer(settings, { type: 'push', entry: { kind: 'account' } })
    expect(account.stack).toEqual([{ kind: 'inbox' }, { kind: 'account' }])
    expect(mobileRouteReducer(account, { type: 'back' })).toEqual(settings)
  })

  it('backs out through sheet, stack, then tab', () => {
    const threadState = mobileRouteReducer(
      mobileRouteReducer(initialMobileRoute, { type: 'changeTab', tab: 'search' }),
      { type: 'push', entry: { kind: 'thread', threadKey: 'account/thread-1' } },
    )
    const sheetState = mobileRouteReducer(threadState, {
      type: 'openSheet',
      sheet: { kind: 'threadActions', thread: thread() },
    })
    const withoutSheet = mobileRouteReducer(sheetState, { type: 'back' })
    expect(withoutSheet.sheet).toBeNull()
    const withoutThread = mobileRouteReducer(withoutSheet, { type: 'back' })
    expect(withoutThread.stack).toEqual([{ kind: 'inbox' }])
    expect(mobileRouteReducer(withoutThread, { type: 'back' }).tab).toBe('inbox')
  })

  it('backs out of an account sheet before the account screen', () => {
    const settings = mobileRouteReducer(initialMobileRoute, { type: 'changeTab', tab: 'settings' })
    const account = mobileRouteReducer(settings, { type: 'push', entry: { kind: 'account' } })
    const sheet = mobileRouteReducer(account, { type: 'openSheet', sheet: { kind: 'accountPassword' } })

    expect(mobileRouteReducer(sheet, { type: 'back' })).toEqual(account)
    expect(mobileRouteReducer(account, { type: 'back' })).toEqual(settings)
  })
})

describe('mobile swipe intent', () => {
  it('maps a right swipe to archive and a left swipe to Later', () => {
    expect(resolveSwipeIntent(72, 4)).toBe('archive')
    expect(resolveSwipeIntent(-90, 8)).toBe('later')
  })

  it('uses the real vertical delta to reject diagonal gestures', () => {
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
    expect(model).not.toHaveProperty('key')
    expect(model).not.toHaveProperty('hasAttachments')
  })
})
