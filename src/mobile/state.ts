import type { VaultHistoryEntry } from '@/core/account'
import type { Thread } from '@/core/types'
import { correspondents, participantLine, relativeTime } from '@/lib/format'

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

/** Above this the badge stops counting and starts saying "a lot". */
export const MOBILE_BADGE_LIMIT = 99

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

export const SWIPE_ACTION_THRESHOLD = 72
export const SWIPE_AXIS_RATIO = 0.72
export const SWIPE_OFFSET_LIMIT = 104
export const LONG_PRESS_MOVE_THRESHOLD = 8
export const LONG_PRESS_DELAY_MS = 480
export const EDGE_BACK_START_PX = 28
export const EDGE_BACK_THRESHOLD = 72
export const PULL_MAX_OFFSET = 92
export const PULL_DISTANCE_FACTOR = 0.52
export const PULL_REFRESH_THRESHOLD = 64
export const PULL_REFRESH_OFFSET = 52

export type SwipeIntent = 'archive' | 'later' | null

export function resolveSwipeIntent(deltaX: number, deltaY: number): SwipeIntent {
  if (Math.abs(deltaY) > Math.abs(deltaX) * SWIPE_AXIS_RATIO) return null
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
