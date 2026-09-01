import type { Thread } from '@/core/types'
import { correspondents, participantLine, relativeTime } from '@/lib/format'

export type MobileRoute = { kind: 'inbox' } | { kind: 'thread'; threadKey: string }

export type MobileNavigationAction =
  | { type: 'pushThread'; threadKey: string }
  | { type: 'pop' }
  | { type: 'reset' }

export function mobileNavigationReducer(
  state: MobileRoute[],
  action: MobileNavigationAction,
): MobileRoute[] {
  switch (action.type) {
    case 'pushThread':
      return [...state, { kind: 'thread', threadKey: action.threadKey }]
    case 'pop':
      return state.length > 1 ? state.slice(0, -1) : state
    case 'reset':
      return [{ kind: 'inbox' }]
  }
}

export type SwipeIntent = 'archive' | 'later' | null

export function resolveSwipeIntent(
  deltaX: number,
  deltaY: number,
  threshold = 72,
): SwipeIntent {
  if (Math.abs(deltaY) > Math.abs(deltaX) * 0.72) return null
  if (deltaX >= threshold) return 'archive'
  if (deltaX <= -threshold) return 'later'
  return null
}

export interface MobileRowModel {
  key: string
  sender: string
  subject: string
  snippet: string
  time: string
  unread: boolean
  starred: boolean
  messageCount: number
  hasAttachments: boolean
}

export function buildMobileRowModel(
  thread: Thread,
  selfEmails: string[],
  now: number,
): MobileRowModel {
  const self = selfEmails.map((email) => email.toLowerCase())
  return {
    key: thread.key,
    sender: participantLine(correspondents(thread.participants, self)),
    subject: thread.subject || '(No subject)',
    snippet: thread.snippet,
    time: relativeTime(thread.lastMessageAt, now),
    unread: thread.unread,
    starred: thread.starred,
    messageCount: thread.messageCount,
    hasAttachments: thread.hasAttachments,
  }
}
