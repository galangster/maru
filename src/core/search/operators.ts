// Search operators — P11. Gmail's grammar, scoped to what a thread-level
// local index can answer honestly:
//
//   from:maya to:dev        participants (the index is thread-level, so both
//                           match the people on the thread; documented, not
//                           hidden)
//   is:unread is:read       the unread flag, either way
//   is:starred              the star
//   has:attachment          a non-inline attachment somewhere in the thread
//   label:Receipts          a user label, by name, case-insensitive;
//                           label:"Big Deals" quotes a spaced name
//
// Everything else is free text for MiniSearch. Operators alone (no text)
// filter the whole mailbox, newest first — `is:unread` with an empty rest is
// a legitimate query.

import type { Label, Thread } from '../types'
import type { ThreadSearchIndex } from './index'

export interface SearchFilters {
  /** Lowercased needles matched against the thread's participant text. */
  people: string[]
  unread?: boolean
  starred?: boolean
  attachment?: boolean
  /** Lowercased label names (unresolved); resolution needs the caller's list. */
  labels: string[]
}

export interface ParsedSearch {
  text: string
  filters: SearchFilters
}

const OPERATOR = /(from|to|is|has|label):(?:"([^"]*)"|(\S+))/gi

export function parseSearchQuery(raw: string): ParsedSearch {
  const filters: SearchFilters = { people: [], labels: [] }
  const text = raw
    .replace(OPERATOR, (_all, op: string, quoted: string | undefined, bare: string | undefined) => {
      const value = (quoted ?? bare ?? '').trim().toLowerCase()
      if (value === '') return ''
      switch (op.toLowerCase()) {
        case 'from':
        case 'to':
          filters.people.push(value)
          break
        case 'is':
          if (value === 'unread') filters.unread = true
          else if (value === 'read') filters.unread = false
          else if (value === 'starred') filters.starred = true
          break
        case 'has':
          if (value === 'attachment') filters.attachment = true
          break
        case 'label':
          filters.labels.push(value)
          break
      }
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { text, filters }
}

export function hasFilters(filters: SearchFilters): boolean {
  return (
    filters.people.length > 0 ||
    filters.labels.length > 0 ||
    filters.unread !== undefined ||
    filters.starred !== undefined ||
    filters.attachment !== undefined
  )
}

function participantsText(thread: Thread): string {
  return thread.participants
    .map((p) => [p.name, p.email].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase()
}

/** `labelIds`: the ids the typed label names resolved to (unresolved names
 * resolve to nothing, which correctly matches no thread — a typo finds
 * nothing rather than everything). */
export function matchesFilters(
  thread: Thread,
  filters: SearchFilters,
  labelIds: string[],
): boolean {
  if (filters.unread !== undefined && thread.unread !== filters.unread) return false
  if (filters.starred !== undefined && thread.starred !== filters.starred) return false
  if (filters.attachment !== undefined && thread.hasAttachments !== filters.attachment) return false
  if (filters.people.length > 0) {
    const people = participantsText(thread)
    if (!filters.people.every((needle) => people.includes(needle))) return false
  }
  if (filters.labels.length > 0) {
    if (labelIds.length < filters.labels.length) return false
    if (!labelIds.every((id) => thread.labelIds.includes(id))) return false
  }
  return true
}

/** The one policy for `label:` resolution — user labels, matched by
 *  lowercased name — beside the matching that depends on it. Both services
 *  hand in their accounts' labels, concatenated. */
export function labelNameMap(labels: Label[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const label of labels) {
    if (label.type === 'user') map.set(label.name.toLowerCase(), label.id)
  }
  return map
}

/**
 * The whole pipeline, shared by both services: parse, let MiniSearch rank
 * whatever free text remains (or take the mailbox newest-first when the
 * query was operators alone), then filter. `labels`: every account's labels,
 * concatenated — `label:` resolves against them via `labelNameMap`.
 */
export function searchWithOperators(
  index: ThreadSearchIndex,
  raw: string,
  labels: Label[],
  limit = 100,
): Thread[] {
  const { text, filters } = parseSearchQuery(raw)
  if (text === '' && !hasFilters(filters)) return []

  const byName = labelNameMap(labels)
  const labelIds = filters.labels
    .map((name) => byName.get(name))
    .filter((id): id is string => id !== undefined)

  const base = text !== '' ? index.search(text, limit * 4) : index.all()
  const out: Thread[] = []
  for (const thread of base) {
    if (!matchesFilters(thread, filters, labelIds)) continue
    out.push(thread)
    if (out.length >= limit) break
  }
  return out
}
