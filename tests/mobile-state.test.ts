import { describe, expect, it } from 'vitest'

import type { Thread } from '@/core/types'
import { wakeTime } from '@/lib/format'
import {
  MOBILE_TABS,
  MOBILE_TAB_CHROME,
  SHEET_DISMISS_THRESHOLD,
  SWIPE_ACTION_THRESHOLD,
  atRoot,
  buildMobileRowModel,
  inboxBadgeValue,
  indexOfTab,
  initialMobileRoute,
  mobileRouteReducer,
  mobileRowLabel,
  nativeTabs,
  hasListToSelect,
  resolveDragAxis,
  resolveSwipeIntent,
  sheetDismisses,
  sheetDragOffset,
  tabAtIndex,
  visibleScreen,
  type MobileRoute,
  type MobileStackEntry,
  type MobileTab,
} from '@/mobile/state'
import {
  REMOVE_ACTION_CHROME,
  batchActions,
  swipeRange,
  threadActions,
} from '@/mobile/thread-actions'
import {
  SCROLL_RESTORE_FRAMES,
  SCROLL_RESTORE_TOLERANCE_PX,
  shouldReassert,
} from '@/mobile/use-route-scroll'

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
      sheet: { kind: 'later', targets: [{ key: 'account/thread-1', deferredUntil: null }] },
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
    const withSheet = { ...route([{ kind: 'inbox' }, thread]), sheet: { kind: 'later' as const, targets: [{ key: 'account/thread-1', deferredUntil: null }] } }
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

// Coming back from a conversation lands where you left (issue 10). The hook
// asserts the offset and then checks its work, because a document that is
// still growing clamps the target and WebKit re-applies its own idea of the
// old offset — neither of which is reliably over in one frame.
describe('shouldReassert', () => {
  it('is settled once the page holds the offset', () => {
    expect(shouldReassert(1592, 1592, SCROLL_RESTORE_FRAMES)).toBe(false)
  })

  it('tolerates a sub-pixel resting place, which a 3x screen produces', () => {
    expect(shouldReassert(1592 + SCROLL_RESTORE_TOLERANCE_PX, 1592, 1)).toBe(false)
    expect(shouldReassert(1592 - SCROLL_RESTORE_TOLERANCE_PX, 1592, 1)).toBe(false)
  })

  it('re-asserts while the page is short of the target and frames remain', () => {
    // 660 against 1592: the reported landing, and what a page clamped to a
    // height it has not finished growing past looks like.
    expect(shouldReassert(660, 1592, SCROLL_RESTORE_FRAMES)).toBe(true)
    expect(shouldReassert(0, 1278, 1)).toBe(true)
  })

  it('gives the page back to the person once the budget is spent', () => {
    expect(shouldReassert(660, 1592, 0)).toBe(false)
  })
})

// The phone used to keep the bulk bar across the bottom of an empty inbox,
// offering Archive, Later and Done over nothing (issue 18).
describe('hasListToSelect', () => {
  it('ends the mode when the last conversation leaves the list', () => {
    expect(hasListToSelect(false, 0)).toBe(false)
  })

  it('leaves a batch alone while rows remain', () => {
    expect(hasListToSelect(false, 1)).toBe(true)
  })

  it('does not take the checkmarks away from a list that is still loading', () => {
    expect(hasListToSelect(true, 0)).toBe(true)
  })

  it('is the same answer the Edit control is drawn from', () => {
    // One predicate for both rules: the control that enters the mode and the
    // effect that ends it cannot disagree about what counts as a list.
    expect(hasListToSelect(false, 3)).toBe(true)
    expect(hasListToSelect(false, 0)).toBe(false)
  })
})

// A screen reader could not tell read from unread: the dot, the star and the
// message count are glyphs, correctly hidden, and nothing put the words back
// (issue 17).
describe('mobileRowLabel', () => {
  const model = {
    sender: 'Priya, Jules +1',
    subject: 'Book club: next pick',
    snippet: 'Two candidates for next month.',
    time: 'Yesterday',
    unread: false,
    starred: false,
    messageCount: 1,
    until: null,
  }

  it('announces the state as well as the content', () => {
    expect(mobileRowLabel({ ...model, unread: true, starred: true, messageCount: 3 })).toBe(
      'Unread, Priya, Jules +1, Yesterday, Book club: next pick, 3 messages, Starred',
    )
  })

  it('says nothing about a state the row is not in', () => {
    expect(mobileRowLabel(model)).toBe('Priya, Jules +1, Yesterday, Book club: next pick')
  })

  it('counts a conversation of more than one message', () => {
    expect(mobileRowLabel({ ...model, messageCount: 2 })).toContain('2 messages')
  })
})

/**
 * What the phone's three triage verbs mean, per conversation.
 *
 * Issue 48: every list sent `archive` whatever it was drawing, so Sent and
 * Trash reported "Archived" with an Undo and changed nothing anywhere, and
 * saving for later reported a wake time for a conversation that could never
 * appear in Later — `threadMatchesView` says a deferral is about the INBOX and
 * nothing else.
 */
describe('mobile thread actions', () => {
  const inboxed = thread({ labelIds: ['INBOX', 'UNREAD'] })
  const sent = thread({ key: 'account/sent-1', labelIds: ['SENT'] })
  const sentAndInboxed = thread({ key: 'account/sent-2', labelIds: ['SENT', 'INBOX'] })
  const trashed = thread({ key: 'account/trash-1', labelIds: ['TRASH'] })
  const trashedFromInbox = thread({ key: 'account/trash-2', labelIds: ['TRASH', 'INBOX'] })
  const archived = thread({ key: 'account/archived-1', labelIds: [] })

  it('archives a conversation that is in the inbox', () => {
    expect(threadActions(inboxed)).toEqual({ remove: 'archive', defer: true, trash: true })
  })

  it('restores a trashed conversation instead of archiving it', () => {
    expect(threadActions(trashed)).toEqual({ remove: 'untrash', defer: false, trash: false })
  })

  it('gives TRASH the precedence the view rules give it', () => {
    // A thread trashed out of the inbox keeps its INBOX label, and
    // `threadMatchesView` still shows it only in Trash. Archiving it would
    // strip a label nothing reads and leave it exactly where it was.
    expect(threadActions(trashedFromInbox)).toEqual({ remove: 'untrash', defer: false, trash: false })
  })

  it('offers nothing to put away on sent mail that is not in the inbox', () => {
    expect(threadActions(sent)).toEqual({ remove: null, defer: false, trash: true })
  })

  it('archives sent mail that IS in the inbox', () => {
    // A thread you replied to carries SENT and INBOX at once, which is why the
    // rule reads the conversation and not the mailbox on screen.
    expect(threadActions(sentAndInboxed)).toEqual({ remove: 'archive', defer: true, trash: true })
  })

  it('offers nothing to put away on mail that is already archived', () => {
    expect(threadActions(archived)).toEqual({ remove: null, defer: false, trash: true })
  })

  it('takes the intersection over a batch, never the majority', () => {
    // One batch is one action, one confirmation and one undo (bulk.ts). A
    // mixed selection has no single verb, so it is offered none.
    expect(batchActions([inboxed, trashed]).remove).toBeNull()
    expect(batchActions([inboxed, sent]).remove).toBeNull()
    expect(batchActions([inboxed, sent]).defer).toBe(false)
    expect(batchActions([inboxed, sentAndInboxed])).toEqual({
      remove: 'archive',
      defer: true,
      trash: true,
    })
    expect(batchActions([trashed, trashedFromInbox]).remove).toBe('untrash')
  })

  it('offers nothing over an empty batch', () => {
    expect(batchActions([])).toEqual({ remove: null, defer: false, trash: false })
  })

  it('names each removing verb once, for the control and for the strip', () => {
    expect(REMOVE_ACTION_CHROME.archive.label).toBe('Archive')
    expect(REMOVE_ACTION_CHROME.untrash.label).toBe('Move to Inbox')
    // Short enough for the strip behind a row, where the glyph takes the rest.
    expect(REMOVE_ACTION_CHROME.untrash.swipe.length).toBeLessThanOrEqual(8)
  })

  it('lets a row travel only where there is an action behind it', () => {
    // The strip under a row IS the promise. A row that slides open over an
    // action it will not take tells the same lie as the toast, one second
    // earlier.
    expect(swipeRange(threadActions(inboxed), 104)).toEqual({ min: -104, max: 104 })
    expect(swipeRange(threadActions(trashed), 104)).toEqual({ min: 0, max: 104 })
    expect(swipeRange(threadActions(sent), 104)).toEqual({ min: 0, max: 0 })
  })
})

/**
 * Coming back from a search result (issue 49).
 *
 * The query used to live in `SearchScreen`, which unmounts whenever anything
 * covers it — a conversation pushed over it, a tab change — so the field came
 * back empty and the results with it. It is shell state now, beside the
 * mailbox, for the reason these two assertions state: navigation returns to
 * exactly the route it left, and the route holds nothing about a screen but
 * its identity, so there is nothing here for `back` to pop a query out of.
 */
describe('search across a thread push and pop', () => {
  it('returns to the exact route the push was made from', () => {
    const searching: MobileRoute = { tab: 'search', stack: [{ kind: 'inbox' }], sheet: null }
    const reading = mobileRouteReducer(searching, {
      type: 'push',
      entry: { kind: 'thread', threadKey: 'account/thread-1' },
    })
    expect(visibleScreen(reading)).toBe('thread')
    expect(mobileRouteReducer(reading, { type: 'back' })).toEqual(searching)
  })

  it('keeps nothing about a screen in the route but its identity', () => {
    // The query is not here, and must not be: `back` pops the route, and a
    // query popped by a back gesture is the defect wearing a different cause.
    expect(Object.keys(initialMobileRoute).sort()).toEqual(['sheet', 'stack', 'tab'])
  })
})

/**
 * Putting a conversation away closes it (issue 50).
 *
 * The shell does this in two dispatches — close the sheet the action was
 * tapped in, then pop the screen it was reading — so the two facts about where
 * you are stay separate. These are the reducer's halves of that: a `back` over
 * an open sheet takes the sheet and stops there, and a `closeSheet` with no
 * sheet open costs nothing, which is what lets the pair be sent together from
 * a surface that has no sheet.
 */
describe('closing a conversation after an action that removed it', () => {
  const reading: MobileRoute = {
    tab: 'inbox',
    stack: [{ kind: 'inbox' }, { kind: 'thread', threadKey: 'account/thread-1' }],
    sheet: null,
  }

  it('takes the sheet first and the screen second', () => {
    const withSheet = mobileRouteReducer(reading, {
      type: 'openSheet',
      sheet: { kind: 'move', thread: thread() },
    })
    const closed = mobileRouteReducer(withSheet, { type: 'closeSheet' })
    expect(closed).toEqual(reading)
    expect(mobileRouteReducer(closed, { type: 'back' })).toEqual(initialMobileRoute)
  })

  it('hands the same state back when there is no sheet to close', () => {
    // The shell sends `closeSheet` then `back` from every removing action,
    // including the ones tapped on a screen with no sheet over it.
    expect(mobileRouteReducer(reading, { type: 'closeSheet' })).toBe(reading)
  })

  it('leaves a list where it is', () => {
    // The same pair sent from a swipe over the inbox: nothing to close, and
    // nothing above the root to pop.
    const closed = mobileRouteReducer(initialMobileRoute, { type: 'closeSheet' })
    expect(mobileRouteReducer(closed, { type: 'back' })).toBe(initialMobileRoute)
  })
})

/**
 * Getting out of a sheet (issue 53).
 *
 * Every sheet drew the grab handle iOS uses to say "drag me down to close" and
 * dragging it did nothing. The two rules below are the whole of what the
 * handle now does, as pure functions, so the gesture can be checked without a
 * finger — the same bargain `resolveSwipeIntent` makes for a row.
 */
describe('sheet drag to dismiss', () => {
  it('follows a finger downwards', () => {
    expect(sheetDragOffset(0)).toBe(0)
    expect(sheetDragOffset(40)).toBe(40)
    expect(sheetDragOffset(400)).toBe(400)
  })

  it('does not follow one upwards', () => {
    // A bottom sheet is already at the bottom of the screen. There is nothing
    // above its resting place to drag it to, and a rubber band there would be
    // the one gesture on the phone with no possible outcome.
    expect(sheetDragOffset(-60)).toBe(0)
  })

  it('closes past the threshold and springs back below it', () => {
    expect(sheetDismisses(SHEET_DISMISS_THRESHOLD - 1)).toBe(false)
    expect(sheetDismisses(SHEET_DISMISS_THRESHOLD)).toBe(true)
  })

  it('asks more of a sheet than of a row', () => {
    // A row's swipe is a deliberate flick at a target the finger is on. A
    // sheet is dismissed by a hand on its way somewhere else, and a sheet that
    // left under 72 px would also leave under the first half of a scroll.
    expect(SHEET_DISMISS_THRESHOLD).toBeGreaterThan(SWIPE_ACTION_THRESHOLD)
  })

  it('is a vertical gesture, so a sideways drag is not one', () => {
    // The sheet's dismissal and the edge back share one screen and one finger.
    // The axis lock is what keeps them apart: each is locked to its own axis
    // for the life of a gesture, so neither can be running while the other is.
    expect(resolveDragAxis(0, 120)).toBe('vertical')
    expect(resolveDragAxis(120, 0)).toBe('horizontal')
  })
})
