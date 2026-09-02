// Formatting the list and the reading pane share. Every function takes the
// clock explicitly so a frozen `now` (captures) and a live one behave the same.

import { base64EncodeBytes } from '@/core/mime'
import type { EmailAddress } from '@/core/types'
import type { IconName } from '@/components/ui/icon'

const DAY = 86_400_000

/**
 * Cuts `text` to `max` characters, on a word boundary where one is close
 * enough, collapsing whitespace first.
 *
 * The one copy. It was written three times — the agent tools' snippets, the
 * demo fixtures' snippets and the send toast — and all three wanted the same
 * three things in the same order: flatten the whitespace, because a newline
 * inside a preview is a line of height for no words; cut; say that a cut
 * happened. Two of the three even used the same 140.
 *
 * `max` is the whole budget, ellipsis included, so a caller that has to fit a
 * box can pass the number of characters the box holds. (The tools' copy
 * counted the ellipsis as extra and could return `max + 1`; the toast's copy
 * did not, and the toast is the caller with a real geometric limit.)
 *
 * Whitespace collapse is why this cannot be a bare `slice`: a pasted subject
 * carries newlines, and the toast is two lines tall by construction.
 */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`
}

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

/**
 * A calendar date in the meta column's width: "Sep 24" inside this year, "Sep
 * 24, 2025" outside it.
 *
 * The tail both `relativeTime` and `wakeStamp` fall through to — one past a
 * week, one future past a week, and the same answer either way. The year test
 * is the whole of it, and it is the part that is easy to write twice and then
 * fix once: a deferral can cross a New Year (MAX_DEFER_DAYS is 30) exactly as a
 * received message can be from one.
 */
function calendarDate(ts: number, now: number): string {
  return new Date(ts).getFullYear() === new Date(now).getFullYear()
    ? dateFmt.format(ts)
    : datedFmt.format(ts)
}

/** The list's right-hand meta column: short, tabular, never wider than 56px. */
export function relativeTime(ts: number, now: number): string {
  const group = dateGroup(ts, now)
  if (group === 'Today') return timeFmt.format(ts)
  if (group === 'Yesterday') return 'Yesterday'
  if (group === 'This week') return weekdayFmt.format(ts)
  return calendarDate(ts, now)
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

/**
 * When a saved thread comes back, in the words the toast and the Later view
 * both use: "this evening, 18:00", "tomorrow, 9:00", "Monday, 9:00",
 * "Sep 24, 9:00".
 *
 * The toast states what MARU will do, which is both the honest claim and the
 * one the person actually wants to check — not "Saved", which says nothing
 * about when. It reads the same clock every other relative date reads, so a
 * frozen capture and a live window say the same thing.
 */
/**
 * The Later view's group headers.
 *
 * A separate closed set from `DateGroup` because that one buckets the PAST and
 * has no upper bound — every future timestamp satisfies its first branch, so
 * reusing it would put a whole month of deferrals under one "Today". Later's
 * list is ordered by when each thread comes back, and a header must agree with
 * the order it sits in or it stops being a header and becomes noise.
 *
 * The set is closed at a month because `MAX_DEFER_DAYS` is 30: nothing can be
 * saved past it, so there is no sixth bucket to write.
 */
export type WakeGroup = 'Today' | 'Tomorrow' | 'This week' | 'Next week' | 'Later this month'

export function wakeGroup(ts: number, now: number): WakeGroup {
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return 'This week'
  if (days < 14) return 'Next week'
  return 'Later this month'
}

/**
 * When a saved thread comes back, in the list's 64 px meta column.
 *
 * The Later list groups by the day the mail is due back and every row showed
 * the day it ARRIVED, so a thread saved until this evening sat under "Today"
 * and printed "Yesterday" on its own row — two dates on screen with nothing to
 * say which was which (issue #38). `relativeTime` cannot answer this: it
 * buckets the past, and a future timestamp satisfies its first branch and comes
 * back as a clock time whatever day it is on.
 *
 * The shape mirrors `relativeTime` exactly — clock, weekday, date — so the
 * Later list's column reads like every other list's. It answers with what the
 * group header does not already say: inside two days the header has the day, so
 * the time is the new information; past that the day is.
 */
export function wakeStamp(ts: number, now: number): string {
  const group = wakeGroup(ts, now)
  if (group === 'Today' || group === 'Tomorrow') return timeFmt.format(ts)
  if (group === 'This week') return weekdayFmt.format(ts)
  return calendarDate(ts, now)
}

export function wakeTime(ts: number, now: number): string {
  const clock = timeFmt.format(ts).replace(/^0/, '')
  // Deliberately NOT `dateGroup`. That function buckets a timestamp in the
  // PAST and has no upper bound, so every future time satisfies its first
  // branch and reads as "Today" — which is how "tomorrow, 9:00" came out as
  // "this evening, 9:00" the first time this was written.
  //
  // Whole days apart, measured between local midnights so a DST day (23 or 25
  // hours) still counts as one day rather than rounding into the next bucket.
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / DAY)
  if (days <= 0) return `this evening, ${clock}`
  if (days === 1) return `tomorrow, ${clock}`
  // Inside the coming week the weekday is the useful word; past it, a date is,
  // because "Monday" three weeks out is a thing nobody can place.
  if (days < 7) return `${weekdayFmt.format(ts)}, ${clock}`
  return `${dateFmt.format(ts)}, ${clock}`
}

/**
 * "1 thread", "2 conversations", "3 messages".
 *
 * The count leads and the noun agrees with it. Written down once because the
 * two shells name the same object differently and the same sentence is built
 * in three places — a batch toast, a batch undo label, and the Later sheet's
 * title — and the sheet said "threads" over a toast that said "conversations".
 */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
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
