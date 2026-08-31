// Formatting the list and the reading pane share. Every function takes the
// clock explicitly so a frozen `now` (captures) and a live one behave the same.

import { base64EncodeBytes } from '@/core/mime'
import type { EmailAddress } from '@/core/types'
import type { IconName } from '@/components/ui/icon'

const DAY = 86_400_000

export function displayName(addr: EmailAddress): string {
  return addr.name?.trim() || addr.email
}

/** One or two letters, from the display name when there is one. */
export function initials(addr: EmailAddress): string {
  const source = addr.name?.trim() || addr.email.split('@')[0] || '?'
  const words = source.split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export type DateGroup = 'Today' | 'Yesterday' | 'This week' | 'Earlier'

export function dateGroup(ts: number, now: number): DateGroup {
  const today = startOfDay(now)
  if (ts >= today) return 'Today'
  if (ts >= today - DAY) return 'Yesterday'
  if (ts >= today - 6 * DAY) return 'This week'
  return 'Earlier'
}

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const datedFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const fullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** The list's right-hand meta column: short, tabular, never wider than 56px. */
export function relativeTime(ts: number, now: number): string {
  const group = dateGroup(ts, now)
  if (group === 'Today') return timeFmt.format(ts)
  if (group === 'Yesterday') return 'Yesterday'
  if (group === 'This week') return weekdayFmt.format(ts)
  return new Date(ts).getFullYear() === new Date(now).getFullYear()
    ? dateFmt.format(ts)
    : datedFmt.format(ts)
}

/**
 * How long ago, in words — the approval queue's meta column.
 *
 * `relativeTime` answers with a clock time for anything today, which is right
 * for a mail list and wrong for a queue whose whole question is "how long has
 * this been waiting": a request 59 minutes old rendered "00:59" and read as
 * 12:59 AM (UI-REVIEW-2026-08-29 S4). This one always answers with an age, so
 * the empty state's promise that a request expires after a day is something
 * the user can check against what is on screen.
 */
export function elapsedTime(ts: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - ts) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function fullTimestamp(ts: number): string {
  return fullFmt.format(ts)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Everyone on the thread except you — who the row is actually *from*. */
export function correspondents(
  participants: EmailAddress[],
  selfEmails: string[],
): EmailAddress[] {
  const others = participants.filter((p) => !selfEmails.includes(p.email.toLowerCase()))
  return others.length > 0 ? others : participants
}

/**
 * Sender-column text. One correspondent keeps their whole name, because
 * "The Marginal Weekly" must not become "The"; two or more collapse to first
 * names, then to a count.
 */
export function participantLine(list: EmailAddress[]): string {
  if (list.length === 0) return 'Unknown'
  if (list.length === 1) return displayName(list[0])
  const names = list.map((p) => firstName(p))
  if (names.length === 2) return names.join(', ')
  return `${names[0]}, ${names[1]} +${names.length - 2}`
}

function firstName(addr: EmailAddress): string {
  const name = addr.name?.trim()
  if (!name) return addr.email.split('@')[0]
  const [first] = name.split(/\s+/)
  return first
}

/**
 * Image types every shipped webview actually decodes. HEIC (the default
 * iPhone photo) and TIFF pass a bare `image/` check and then render as a
 * broken-image glyph — those keep the filename chip instead.
 */
export function isPreviewableImage(mimeType: string): boolean {
  return /^image\/(jpeg|png|gif|webp|avif|svg\+xml)$/.test(mimeType)
}

export function attachmentIcon(mimeType: string): IconName {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'text/calendar') return 'calendar'
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'fileText'
  return 'file'
}

/**
 * Bytes to a data: URL, via core/mime's chunked encoder — a spread over a
 * megabyte-sized image blows the argument stack, which is exactly what a
 * photo attachment is. Shared by inline cid: images and photo thumbnails.
 */
export function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${base64EncodeBytes(bytes)}`
}
