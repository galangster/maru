import type { IconName } from '@/components/ui/icon'
import type { VaultHistoryEntry } from '@/core/account'
import { isDeferred } from '@/core/defaults'
import type { Thread } from '@/core/types'
import { clip, correspondents, participantLine, relativeTime, wakeTime } from '@/lib/format'
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
/**
 * What a Later batch needs to know about one conversation: which one, and the
 * wake time it is coming off.
 *
 * The prior time travels WITH the key rather than being looked up later. Undo
 * has to put each conversation back on its own schedule, and the surfaces that
 * open the sheet — a row, a batch of rows, the thread screen, the actions
 * sheet — all hold the `Thread` at the moment they ask. A sheet handed only
 * keys had to go and scrape the query cache for what its own caller already
 * had in hand.
 */
export interface DeferTarget {
  key: string
  deferredUntil: number | null
}

/** One, off the thread the surface already has in hand. */
export function deferTarget(thread: Thread): DeferTarget {
  return { key: thread.key, deferredUntil: thread.deferredUntil ?? null }
}

export type MobileSheet =
  | { kind: 'later'; targets: DeferTarget[] }
  /** The mailbox picker behind the inbox title — every place mail can be. */
  | { kind: 'mailboxes' }
  | { kind: 'threadActions'; thread: Thread }
  /** The label picker behind `+ Label` on an open conversation. */
  | { kind: 'labels'; thread: Thread }
  | { kind: 'move'; thread: Thread }
  | { kind: 'pushAccount' }
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
  /**
   * The conversation this was about has left the list (issue 50).
   *
   * One action rather than a `closeSheet` and a `back` composed in the shell.
   * Closing the sheet the verb was tapped in and leaving the screen that was
   * reading the conversation are two halves of one intent — put it away — and
   * the shell sends it from four places, so the rule for what "close up after
   * it" means belongs here where it can be read and tested once.
   */
  | { type: 'dismissAfterRemoval' }
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
    case 'dismissAfterRemoval':
      // Both halves, in one state. The sheet always goes; the screen goes only
      // when it was the conversation's own — a swipe from a list, or a Later
      // picked over the inbox, has nothing above the root to pop and leaves
      // the list exactly where it was.
      return {
        ...state,
        sheet: null,
        stack: topEntry(state).kind === 'thread' ? state.stack.slice(0, -1) : state.stack,
      }
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
/**
 * How far a sheet is dragged down before letting go closes it.
 *
 * Larger than `SWIPE_ACTION_THRESHOLD`, because the two gestures are answering
 * different questions. A row's swipe is a deliberate flick at a target the
 * finger is already on; a sheet is dismissed by a hand that is on its way
 * somewhere else, and a sheet that leaves under a 72 px drag would also leave
 * under the first half of a scroll that started on its header.
 */
export const SHEET_DISMISS_THRESHOLD = 96

/**
 * Where a sheet sits while a finger is on it.
 *
 * Down only. A bottom sheet is already at the bottom of the screen, so there
 * is nothing above its resting place to drag it to — and an upward rubber band
 * would be the one gesture on the phone that moves and then puts everything
 * back with no possible outcome.
 */
export function sheetDragOffset(dy: number): number {
  return Math.max(0, dy)
}

/** Whether letting go here closes the sheet. */
export function sheetDismisses(offset: number): boolean {
  return offset >= SHEET_DISMISS_THRESHOLD
}

/**
 * How much of a subject the conversation ANNOUNCES itself by.
 *
 * A subject has no length limit and a pasted paragraph is a legal one. Five
 * thousand characters printed a 6,113 px title, so the first message started
 * seven and a half screens down and a screen reader read the whole paragraph
 * before it said anything else about the conversation (issue 62).
 *
 * 120 characters is about two spoken seconds and comfortably more than the
 * three lines the title draws, so the ear gets the same sentence the eye does
 * and neither gets the paragraph. `clip` breaks on a word where it can, so
 * what is announced is the beginning of a sentence rather than half a word.
 */
export const THREAD_TITLE_CLIP = 120

/** How many lines of subject the conversation shows before it offers the rest. */
export const THREAD_TITLE_LINES = 3

/**
 * What the conversation is CALLED — the screen's accessible name, and the
 * title's own when the title is still clamped.
 *
 * One function for both, because the eye and the ear must not be given two
 * different names for the same conversation. The blank case is here too: a
 * mail with no subject is "(No subject)" on the screen, so it is "(No
 * subject)" to VoiceOver rather than an unnamed heading.
 */
export function threadTitleName(subject: string): string {
  return subject.trim() ? clip(subject, THREAD_TITLE_CLIP) : '(No subject)'
}
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
 * Whether releasing after this much movement was a TAP on the sheet's scrim.
 *
 * The dimmed area outside a sheet closes it, and it used to close it on
 * `pointerdown` — which meant the edge back could never run on a short sheet,
 * because the finger that starts the gesture on the scrim has already
 * dismissed the sheet before it moves. Wave 3 read that as "the back gesture
 * works on Labels and Move"; it was the tap, every time (issue 53).
 *
 * The rule is the axis lock's own: below `AXIS_LOCK_THRESHOLD` on both axes a
 * gesture has not declared itself, and `usePointerDrag` already treats that as
 * a tap. Sharing the answer is what keeps the scrim from calling a movement a
 * tap that the drag underneath it is still calling a drag.
 */
export function scrimTap(deltaX: number, deltaY: number): boolean {
  return resolveDragAxis(deltaX, deltaY) === null
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

/**
 * Whether there is a list to be in selection mode over.
 *
 * Select All, then Archive, and the inbox empties — and the bulk bar stayed
 * across the bottom of the empty state offering Archive, Later and Done over
 * nothing, with the header still reading "Done" (issue 18). Selection is a
 * mode over a list; with no list there is nothing to be in the mode of.
 *
 * One predicate, because the mode has two rules — when to offer Edit, and when
 * to end the mode on its own — and they are the same question asked twice. Two
 * copies of it is how the empty state kept an Edit control that could only put
 * an all-disabled bulk bar on screen and take it away again.
 *
 * `pending` is the half that matters. A list that has not loaded yet is also a
 * list with no rows, and dropping the mode on a refetch would take the
 * checkmarks away from someone who is mid-batch and just pulled to refresh —
 * so a list still loading counts as a list, in both rules alike.
 */
export function hasListToSelect(pending: boolean, rowCount: number): boolean {
  return pending || rowCount > 0
}

/** What a row draws. */
export interface MobileRowContent {
  sender: string
  subject: string
  snippet: string
  time: string
  unread: boolean
  starred: boolean
  messageCount: number
  /**
   * When a thread saved for later comes back, in words — `null` for a thread
   * that was never saved, and for one whose moment has already passed.
   *
   * Always computed rather than asked for by the Later list alone: the same
   * fact is worth having in a search result, which is the other phone surface
   * a deferred thread can show up in.
   */
  until: string | null
}

/** What a row draws, plus what it announces. */
export interface MobileRowModel extends MobileRowContent {
  label: string
}

export function buildMobileRowModel(
  thread: Thread,
  selfEmails: string[],
  now: number,
): MobileRowModel {
  const self = selfEmails.map((email) => email.toLowerCase())
  const content: MobileRowContent = {
    sender: participantLine(correspondents(thread.participants, self)),
    subject: thread.subject || '(No subject)',
    snippet: thread.snippet,
    time: relativeTime(thread.lastMessageAt, now),
    unread: thread.unread,
    starred: thread.starred,
    messageCount: thread.messageCount,
    // `isDeferred` and `wakeTime` are the engine's own pair, so the row, the
    // Later sheet's toast and the desktop all say the same words about the
    // same moment.
    until: isDeferred(thread, now) ? wakeTime(thread.deferredUntil as number, now) : null,
  }
  // Composed here, with the rest of the model, rather than in the row: the row
  // is rendered by a virtualizer and re-rendered on every scroll, and the
  // sentence only ever changes when the model does.
  return { ...content, label: mobileRowLabel(content) }
}

/**
 * What a screen reader hears when it reaches a row.
 *
 * Every row used to announce its sender and its subject and nothing else, so
 * an unread conversation and a read one below it were indistinguishable
 * (issue 17). The unread dot, the star mark and the message count were all
 * marked as decoration — correctly, since they are glyphs — and nothing put
 * the words back.
 *
 * The desktop row does this with sr-only words in DOM order: "Unread" from the
 * gutter dot, then the content, then "Starred". The phone's row is one button
 * with an `aria-label`, so the same words are composed here instead, in the
 * order the eye takes them, and the label is a pure function of the model so
 * it can be tested as a sentence rather than as a tree.
 */
export function mobileRowLabel(model: MobileRowContent): string {
  return [
    model.unread ? 'Unread' : null,
    model.sender,
    model.time,
    model.subject,
    model.messageCount > 1 ? `${model.messageCount} messages` : null,
    model.starred ? 'Starred' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ')
}
