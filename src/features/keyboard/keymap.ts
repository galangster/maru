// The keymap, as data.
//
// Two things read it: use-shortcuts, which binds `key` to a handler, and the
// "?" overlay, which prints `keys` and `label`. They used to be two hand-kept
// lists, so a shortcut could be bound and undocumented, or documented and
// dead. Adding a row here is now the only way to add a shortcut, and the
// handler map in use-shortcuts is keyed by this table's ids.

import { platformOS } from '@/lib/env'

/** ⌘ on a Mac, Ctrl everywhere else. The overlay prints it; the handler
 *  accepts either modifier, because a Mac keyboard can be plugged in. */
export const MOD = platformOS === 'mac' ? '⌘' : 'Ctrl'

export type ShortcutGroup = 'Move' | 'Triage' | 'Write' | 'Find'

export type ShortcutId =
  | 'next'
  | 'prev'
  | 'open'
  | 'folders'
  | 'archive'
  | 'trash'
  | 'star'
  | 'read'
  | 'undo'
  | 'compose'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'send'
  | 'palette'
  | 'search'
  | 'help'
  | 'escape'

export interface ShortcutSpec {
  id: ShortcutId
  /** As the overlay prints it. Two entries mean a range: "⌘1 … ⌘4". */
  keys: string[]
  label: string
  group: ShortcutGroup
  /**
   * The KeyboardEvent.key the global handler switches on, when the shortcut is
   * a plain unmodified press. The modified ones (⌘K, ⌘1-4, ⌘↵) and Escape are
   * handled ahead of the table, because they must also fire while typing.
   */
  key?: string
}

export const SHORTCUTS: ShortcutSpec[] = [
  { id: 'next', keys: ['J'], label: 'Next thread', group: 'Move', key: 'j' },
  { id: 'prev', keys: ['K'], label: 'Previous thread', group: 'Move', key: 'k' },
  { id: 'open', keys: ['↵'], label: 'Open the selection', group: 'Move', key: 'Enter' },
  { id: 'folders', keys: [`${MOD}1`, `${MOD}4`], label: 'Inbox … Trash', group: 'Move' },

  { id: 'archive', keys: ['E'], label: 'Archive', group: 'Triage', key: 'e' },
  { id: 'trash', keys: ['#'], label: 'Trash or restore', group: 'Triage', key: '#' },
  { id: 'star', keys: ['S'], label: 'Star', group: 'Triage', key: 's' },
  { id: 'read', keys: ['U'], label: 'Read / unread', group: 'Triage', key: 'u' },
  // Modified, so it is handled ahead of the table and carries no `key`. It is
  // in Triage rather than a group of its own because what it undoes is the
  // four rows above it.
  { id: 'undo', keys: [`${MOD}Z`], label: 'Undo the last action', group: 'Triage' },

  { id: 'compose', keys: ['C'], label: 'Compose', group: 'Write', key: 'c' },
  { id: 'reply', keys: ['R'], label: 'Reply', group: 'Write', key: 'r' },
  { id: 'replyAll', keys: ['A'], label: 'Reply all', group: 'Write', key: 'a' },
  { id: 'forward', keys: ['F'], label: 'Forward', group: 'Write', key: 'f' },
  { id: 'send', keys: [`${MOD}↵`], label: 'Send', group: 'Write' },

  { id: 'palette', keys: [`${MOD}K`], label: 'Command palette', group: 'Find' },
  { id: 'search', keys: ['/'], label: 'Search mail', group: 'Find', key: '/' },
  { id: 'help', keys: ['?'], label: 'Show this list', group: 'Find', key: '?' },
  { id: 'escape', keys: ['esc'], label: 'Close the top surface', group: 'Find' },
]

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Move', 'Triage', 'Write', 'Find']

export function shortcutsIn(group: ShortcutGroup): ShortcutSpec[] {
  return SHORTCUTS.filter((s) => s.group === group)
}

/** The unmodified presses, indexed by the key that fires them. */
export const SHORTCUTS_BY_KEY: Record<string, ShortcutId> = Object.fromEntries(
  SHORTCUTS.filter((s) => s.key).map((s) => [s.key as string, s.id]),
)
