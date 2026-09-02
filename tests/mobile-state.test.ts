import { describe, expect, it } from 'vitest'

import type { Thread } from '@/core/types'
import { wakeTime } from '@/lib/format'
import {
  MOBILE_TABS,
  MOBILE_TAB_CHROME,
  atRoot,
  buildMobileRowModel,
  inboxBadgeValue,
  indexOfTab,
  initialMobileRoute,
  mobileRouteReducer,
  nativeTabs,
  resolveDragAxis,
  resolveSwipeIntent,
  tabAtIndex,
  visibleScreen,
  type MobileRoute,
  type MobileStackEntry,
  type MobileTab,
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

describe('visible screen', () => {
  const route = (stack: MobileStackEntry[], tab: MobileTab = 'inbox'): MobileRoute => ({ tab, stack, sheet: null })
  const thread: MobileStackEntry = { kind: 'thread', threadKey: 'account/thread-1' }

  it('is the tab while the stack is at its root', () => {
    for (const tab of MOBILE_TABS) {
      expect(visibleScreen(route([{ kind: 'inbox' }], tab))).toBe(tab)
    }
  })

  it('is the pushed screen, whichever tab it was pushed from', () => {
    expect(visibleScreen(route([{ kind: 'inbox' }, thread], 'search'))).toBe('thread')
    expect(visibleScreen(route([{ kind: 'inbox' }, { kind: 'account' }], 'settings'))).toBe('account')
  })

  it('is unchanged by a sheet', () => {
    const withSheet = { ...route([{ kind: 'inbox' }, thread]), sheet: { kind: 'later' as const, threadKeys: ['account/thread-1'] } }
    expect(visibleScreen(withSheet)).toBe('thread')
  })

  it('reads the root separately, because the tab bar belongs to the root', () => {
    expect(atRoot(route([{ kind: 'inbox' }], 'settings'))).toBe(true)
    expect(atRoot(route([{ kind: 'inbox' }, thread]))).toBe(false)
  })
})

describe('mobile drag axis lock', () => {
  it('refuses to guess until the finger has travelled', () => {
    // The first pointermove of every gesture, including every tap, lands
    // here. Answering it would send half the taps in the inbox sideways.
    expect(resolveDragAxis(0, 0)).toBeNull()
    expect(resolveDragAxis(4, 3)).toBeNull()
    expect(resolveDragAxis(9, 9)).toBeNull()
  })

  it('locks on the axis the finger is actually using', () => {
    expect(resolveDragAxis(12, 1)).toBe('horizontal')
    expect(resolveDragAxis(-12, 1)).toBe('horizontal')
    expect(resolveDragAxis(1, 12)).toBe('vertical')
    expect(resolveDragAxis(0, -40)).toBe('vertical')
  })

  it('gives a shallow drag to the scroller', () => {
    // A mail list is scrolled far more often than it is swiped, so anything
    // outside roughly 36 degrees of the horizontal belongs to the page.
    expect(resolveDragAxis(40, 40)).toBe('vertical')
    expect(resolveDragAxis(40, 20)).toBe('horizontal')
  })

  it('locks vertical for a scroll that starts with a sideways twitch', () => {
    // Nine points across is under the threshold, so the gesture is still
    // undecided when the finger turns down the page. This is the shape of a
    // thumb scrolling a list, and it must never move a row.
    expect(resolveDragAxis(9, 4)).toBeNull()
    expect(resolveDragAxis(9, 60)).toBe('vertical')
  })
})

describe('mobile sheets', () => {
  const thread1 = thread()

  it('opens the mailbox picker and the label picker over the current screen', () => {
    const pushed = mobileRouteReducer(initialMobileRoute, {
      type: 'push',
      entry: { kind: 'thread', threadKey: thread1.key },
    })
    const labels = mobileRouteReducer(pushed, {
      type: 'openSheet',
      sheet: { kind: 'labels', thread: thread1 },
    })
    // The sheet is over the thread, not instead of it: the screen underneath
    // has to keep drawing, because the picker is about the mail on it.
    expect(labels.sheet).toEqual({ kind: 'labels', thread: thread1 })
    expect(visibleScreen(labels)).toBe('thread')

    const mailboxes = mobileRouteReducer(initialMobileRoute, {
      type: 'openSheet',
      sheet: { kind: 'mailboxes' },
    })
    expect(mailboxes.sheet).toEqual({ kind: 'mailboxes' })
    expect(visibleScreen(mailboxes)).toBe('inbox')
  })

  it('closes a picker before it pops a screen', () => {
    const pushed = mobileRouteReducer(initialMobileRoute, {
      type: 'push',
      entry: { kind: 'thread', threadKey: thread1.key },
    })
    const open = mobileRouteReducer(pushed, {
      type: 'openSheet',
      sheet: { kind: 'labels', thread: thread1 },
    })
    const back = mobileRouteReducer(open, { type: 'back' })
    expect(back.sheet).toBeNull()
    expect(visibleScreen(back)).toBe('thread')
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

  it('agrees with the axis lock, so a moved row always commits', () => {
    // The gesture that moved the row and the gesture that fires the action
    // are the same gesture. A row cannot follow a finger 100 points and then
    // refuse the archive it was plainly promising.
    const swipe = { dx: 100, dy: 30 }
    expect(resolveDragAxis(swipe.dx, swipe.dy)).toBe('horizontal')
    expect(resolveSwipeIntent(swipe.dx, swipe.dy)).toBe('archive')
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

  it('says when a thread saved for later comes back', () => {
    const now = new Date(2026, 8, 1, 12, 0).getTime()
    const model = buildMobileRowModel(
      thread({ deferredUntil: new Date(2026, 8, 2, 9, 0).getTime() }),
      [],
      now,
    )
    // The engine's own wording, not a second phrasing of the same moment.
    expect(model.until).toBe(wakeTime(new Date(2026, 8, 2, 9, 0).getTime(), now))
    expect(model.until).toContain('tomorrow')
  })

  it('says nothing about a thread that was never saved, or has already woken', () => {
    const now = new Date(2026, 8, 1, 12, 0).getTime()
    expect(buildMobileRowModel(thread(), [], now).until).toBeNull()
    // A deferral whose moment has passed is not a promise any more, so the
    // row must stop making one. This is `isDeferred`'s boundary, not a
    // second `> now` written here.
    const woken = thread({ deferredUntil: new Date(2026, 8, 1, 9, 0).getTime() })
    expect(buildMobileRowModel(woken, [], now).until).toBeNull()
  })
})

describe('native tab bar positions', () => {
  it('agrees with the order the Swift plugin declares its items in', () => {
    expect(MOBILE_TABS).toEqual(['inbox', 'search', 'settings'])
  })

  it('hands the plugin one descriptor per tab, in MOBILE_TABS order', () => {
    // Swift writes no tab list. This array is what the bar is built from, so
    // the mapping is the contract and belongs under test.
    expect(nativeTabs()).toEqual([
      { title: 'Inbox', symbol: 'tray' },
      { title: 'Search', symbol: 'magnifyingglass' },
      { title: 'Settings', symbol: 'gearshape' },
    ])
  })

  it('draws every tab on the web bar', () => {
    // The label and the SF Symbol are already asserted, exactly, by the
    // descriptor test above. The web icon is the half only this bar uses.
    for (const tab of MOBILE_TABS) {
      expect(MOBILE_TAB_CHROME[tab].icon).toBeTruthy()
    }
  })

  it('round-trips a tab through its index', () => {
    for (const tab of MOBILE_TABS) {
      expect(tabAtIndex(indexOfTab(tab))).toBe(tab)
    }
  })

  it('has no tab outside the bar', () => {
    expect(tabAtIndex(-1)).toBeNull()
    expect(tabAtIndex(MOBILE_TABS.length)).toBeNull()
  })
})

describe('inbox badge', () => {
  it('clears the badge rather than drawing a zero', () => {
    expect(inboxBadgeValue(0)).toBeNull()
    expect(inboxBadgeValue(-3)).toBeNull()
    expect(inboxBadgeValue(Number.NaN)).toBeNull()
  })

  it('counts up to ninety-nine', () => {
    expect(inboxBadgeValue(1)).toBe('1')
    expect(inboxBadgeValue(12)).toBe('12')
    expect(inboxBadgeValue(99)).toBe('99')
  })

  it('rolls over past the cap instead of widening the pill', () => {
    expect(inboxBadgeValue(100)).toBe('99+')
    expect(inboxBadgeValue(3607)).toBe('99+')
  })
})
