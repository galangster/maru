// The conversation lens: which way the messages run, and which are open.
// Pure, like the list's lens — the thread itself is always chronological in
// the store; these decide only what the pane shows.

import type { Message, Settings } from '@/core/types'
import type { ReadingExpansion } from '@/features/mail/ui-store'

type ConversationOrder = Settings['conversationOrder']

/**
 * The messages in display order. Chronological is the store's own order,
 * handed back untouched; newest-first is a reversed copy. The *newest*
 * message is the anchor either way — it is what the pane lands on and what
 * `default` expansion opens.
 */
export function displayMessages(messages: Message[], order: ConversationOrder): Message[] {
  return order === 'newestFirst' ? [...messages].reverse() : messages
}

/**
 * The ids that render expanded. `default` opens the newest message only —
 * the same rule whichever way the display runs.
 */
export function expandedIds(messages: Message[], expansion: ReadingExpansion): ReadonlySet<string> {
  if (expansion === 'all') return new Set(messages.map((m) => m.id))
  if (expansion === 'none') return new Set()
  if (expansion === 'default') {
    const newest = messages[messages.length - 1]
    return new Set(newest ? [newest.id] : [])
  }
  return expansion
}

/** One message toggled, from whatever state the set is in now. */
export function toggleExpanded(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Collapse a manual set back to the named states when it lands on one, so
 * "is everything open?" has exactly one spelling: `expansion === 'all'`. The
 * keymap's `o` and the pane's toolbar button both toggle on that spelling —
 * without this, a person who opened every message by hand would have a
 * button saying Collapse and a key that expands.
 */
export function normalizeExpansion(
  next: ReadonlySet<string>,
  messages: Message[],
): ReadingExpansion {
  if (next.size === 0) return 'none'
  if (messages.length > 0 && messages.every((m) => next.has(m.id))) return 'all'
  return next
}
