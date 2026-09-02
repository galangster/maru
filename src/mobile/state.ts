import type { IconName } from '@/components/ui/icon'
import type { VaultHistoryEntry } from '@/core/account'
import type { Thread } from '@/core/types'
import { correspondents, participantLine, relativeTime } from '@/lib/format'
import type { NativeTab } from '@/platform/shell'

export type MobileTab = 'inbox' | 'search' | 'settings'

/**
 * Tab order, and the only place it is written down. The native tab bar
 * addresses its items by position, so this array is the contract between the
 * Swift `UITabBarItem`s and the reducer's `tab`.
 */
export const MOBILE_TABS: readonly MobileTab[] = ['inbox', 'search', 'settings']

export function tabAtIndex(index: number): MobileTab | null {
  return MOBILE_TABS[index] ?? null
}

export function indexOfTab(tab: MobileTab): number {
  return MOBILE_TABS.indexOf(tab)
}

/**
 * What each tab is called and what draws it: an SF Symbol for the native bar,
 * a Maru icon for the web fallback.
 *
 * One record, because there is one bar. Swift writes no tab list of its own —
 * it is handed these descriptors when the web layer subscribes — so the labels
 * the phone shows and the labels the browser preview shows cannot drift.
 */
export const MOBILE_TAB_CHROME: Record<MobileTab, { label: string; icon: IconName; symbol: string }> = {
  inbox: { label: 'Inbox', icon: 'inbox', symbol: 'tray' },
  search: { label: 'Search', icon: 'search', symbol: 'magnifyingglass' },
  settings: { label: 'Settings', icon: 'settings', symbol: 'gearshape' },
}

/** The bar's items, in the order the native side addresses them by. */
export function nativeTabs(): NativeTab[] {
  return MOBILE_TABS.map((tab) => ({
    title: MOBILE_TAB_CHROME[tab].label,
    symbol: MOBILE_TAB_CHROME[tab].symbol,
  }))
}

/** Above this the badge stops counting and starts saying "a lot". */
const MOBILE_BADGE_LIMIT = 99

/**
 * What the Inbox tab's badge should read, or `null` for no badge at all.
 *
 * A UITabBarItem badge is a string, and an empty one draws an empty red pill,
 * so zero has to become `null` rather than `'0'`. Past 99 the pill grows wide
 * enough to crowd the neighbouring tab's label, which is why iOS caps it.
 */
export function inboxBadgeValue(unread: number): string | null {
  if (!Number.isFinite(unread) || unread <= 0) return null
  const count = Math.floor(unread)
  return count > MOBILE_BADGE_LIMIT ? `${MOBILE_BADGE_LIMIT}+` : String(count)
}
export type MobileStackEntry =
  | { kind: 'inbox' }
  | { kind: 'thread'; threadKey: string }
  | { kind: 'account' }
export type MobileSheet =
  | { kind: 'later'; threadKeys: string[] }
  | { kind: 'threadActions'; thread: Thread }
  | { kind: 'move'; thread: Thread }
  | { kind: 'accountRestore'; entry: VaultHistoryEntry }
  | { kind: 'accountPassword' }
  | { kind: 'accountDelete' }

export interface MobileRoute {
  tab: MobileTab
  stack: MobileStackEntry[]
  sheet: MobileSheet | null
}

export const initialMobileRoute: MobileRoute = {
  tab: 'inbox',
  stack: [{ kind: 'inbox' }],
  sheet: null,
}

export type MobileRouteAction =
  | { type: 'changeTab'; tab: MobileTab }
  | { type: 'push'; entry: MobileStackEntry }
  | { type: 'openSheet'; sheet: MobileSheet }
  | { type: 'closeSheet' }
  | { type: 'back' }

export function mobileRouteReducer(state: MobileRoute, action: MobileRouteAction): MobileRoute {
  switch (action.type) {
    case 'changeTab':
      return { tab: action.tab, stack: [{ kind: 'inbox' }], sheet: null }
    case 'push':
      return { ...state, stack: [...state.stack, action.entry], sheet: null }
    case 'openSheet':
      return { ...state, sheet: action.sheet }
    case 'closeSheet':
      return { ...state, sheet: null }
    case 'back':
      if (state.sheet) return { ...state, sheet: null }
      if (state.stack.length > 1) return { ...state, stack: state.stack.slice(0, -1) }
      if (state.tab !== 'inbox') return { ...state, tab: 'inbox' }
      return state
  }
}

/**
 * Which screen the stage shows on top.
 *
 * The stage keeps exactly one screen mounted for the life of the shell — the
 * inbox — and mounts every other screen only while it is on top. So this one
 * answer does two jobs: it names the screen to draw over the inbox, and, by
 * not being `'inbox'`, it is the reason the inbox is hidden.
 *
 * A tab is only the visible screen while the stack is at its root, because
 * `changeTab` resets the stack and a push covers whichever tab it started from.
 */
export type MobileScreen = MobileTab | Exclude<MobileStackEntry['kind'], 'inbox'>

export function visibleScreen(route: MobileRoute): MobileScreen {
  const top = topEntry(route)
  return top.kind === 'inbox' ? route.tab : top.kind
}

/**
 * Whether the stack is at its root, which is the other question the stage
 * asks: the tab bar belongs to the root, and only the root.
 */
export function atRoot(route: MobileRoute): boolean {
  return topEntry(route).kind === 'inbox'
}

function topEntry(route: MobileRoute): MobileStackEntry {
  return route.stack[route.stack.length - 1]
}

export const SWIPE_ACTION_THRESHOLD = 72
export const SWIPE_AXIS_RATIO = 0.72
export const SWIPE_OFFSET_LIMIT = 104
export const LONG_PRESS_DELAY_MS = 480
/**
 * How far a finger travels before a gesture commits to an axis.
 *
 * Ten points is UIKit's own pan threshold, and it is deliberately short. A
 * lock that waits any longer lets the row lurch sideways during what turns out
 * to be a scroll, which is the tell that a swipe is a web page pretending.
 */
export const AXIS_LOCK_THRESHOLD = 10
export const EDGE_BACK_START_PX = 28
export const EDGE_BACK_THRESHOLD = 72
export const PULL_MAX_OFFSET = 92
export const PULL_DISTANCE_FACTOR = 0.52
export const PULL_REFRESH_THRESHOLD = 64
export const PULL_REFRESH_OFFSET = 52

export type SwipeIntent = 'archive' | 'later' | null

/** The two ways a one-finger drag can go once it has made up its mind. */
export type DragAxis = 'horizontal' | 'vertical'

/**
 * Which way a gesture is going, or `null` while it is still too short to say.
 *
 * This is the whole of the axis lock, and it is a pure function so the rule
 * can be tested without a finger — tests/mobile-state.test.ts. Two properties
 * matter and neither is obvious from the arithmetic:
 *
 * - It answers `null` below `AXIS_LOCK_THRESHOLD` on *both* axes, so the
 *   caller reports nothing at all until the gesture has declared itself. A
 *   lock taken on the first pointermove would follow the noise in a fingertip
 *   landing and send half of every tap somewhere.
 * - The tie goes to horizontal, but only just: `SWIPE_AXIS_RATIO` means a
 *   drag has to stay inside about 36 degrees of the horizontal to count as a
 *   swipe. Everything shallower is a scroll, because on a mail list a scroll
 *   is what a finger is nearly always doing.
 */
export function resolveDragAxis(deltaX: number, deltaY: number): DragAxis | null {
  if (Math.abs(deltaX) < AXIS_LOCK_THRESHOLD && Math.abs(deltaY) < AXIS_LOCK_THRESHOLD) return null
  return Math.abs(deltaY) > Math.abs(deltaX) * SWIPE_AXIS_RATIO ? 'vertical' : 'horizontal'
}

/**
 * What a finished horizontal drag asked for, if anything.
 *
 * The axis test is `resolveDragAxis` rather than a second copy of the ratio:
 * the gesture that moved the row and the gesture that commits an action have
 * to be the same gesture, or a row can follow a finger and then refuse the
 * action it was clearly promising.
 */
export function resolveSwipeIntent(deltaX: number, deltaY: number): SwipeIntent {
  if (resolveDragAxis(deltaX, deltaY) !== 'horizontal') return null
  if (deltaX >= SWIPE_ACTION_THRESHOLD) return 'archive'
  if (deltaX <= -SWIPE_ACTION_THRESHOLD) return 'later'
  return null
}

export interface MobileRowModel {
  sender: string
  subject: string
  snippet: string
  time: string
  unread: boolean
  starred: boolean
  messageCount: number
}

export function buildMobileRowModel(
  thread: Thread,
  selfEmails: string[],
  now: number,
): MobileRowModel {
  const self = selfEmails.map((email) => email.toLowerCase())
  return {
    sender: participantLine(correspondents(thread.participants, self)),
    subject: thread.subject || '(No subject)',
    snippet: thread.snippet,
    time: relativeTime(thread.lastMessageAt, now),
    unread: thread.unread,
    starred: thread.starred,
    messageCount: thread.messageCount,
  }
}
