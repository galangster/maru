// The keymap, as data.
//
// Two things read it: use-shortcuts, which binds `key` to a handler, and the
// "?" overlay, which prints `keys` and `label`. They used to be two hand-kept
// lists, so a shortcut could be bound and undocumented, or documented and
// dead. Adding a row here is now the only way to add a shortcut, and the
// handler map in use-shortcuts is keyed by this table's ids.
//
// Two kinds of key reach a row: the Gmail-school letters (j/k/e/#) for hands
// that know them, and the universal mental models (arrows, Delete-to-archive,
// ⌘N, ⌘,) for hands that don't — Nick's ruling, 2026-08-29. The second kind
// rides `aliases`: extra unmodified presses that fire the same id without
// widening what the overlay prints.

import { platformOS } from '@/lib/env'

/** ⌘ on a Mac, Ctrl everywhere else. The overlay prints it; the handler
 *  accepts either modifier, because a Mac keyboard can be plugged in. */
export const MOD = platformOS === 'mac' ? '⌘' : 'Ctrl'

export type ShortcutGroup = 'Move' | 'Triage' | 'Write' | 'Find'

export type ShortcutId =
  | 'next'
  | 'prev'
  | 'open'
  | 'scan'
  | 'expandAll'
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
  | 'settings'
  | 'approvals'
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
   * a plain unmodified press. The modified ones (⌘K, ⌘1-4, ⌘↵, ⌘⌫, ⌘N, ⌘,
   * ⌘F), Space and Escape are handled ahead of the table, because they carry
   * modifiers or need the event itself.
   */
  key?: string
  /** Extra unmodified presses that fire the same id. Not printed. */
  aliases?: string[]
}

export const SHORTCUTS: ShortcutSpec[] = [
  { id: 'next', keys: ['J'], label: 'Next thread', group: 'Move', key: 'j', aliases: ['ArrowDown'] },
  { id: 'prev', keys: ['K'], label: 'Previous thread', group: 'Move', key: 'k', aliases: ['ArrowUp'] },
  { id: 'open', keys: ['↵'], label: 'Open the selection', group: 'Move', key: 'Enter' },
  { id: 'scan', keys: ['space'], label: 'Scroll, then next thread', group: 'Move' },
  { id: 'expandAll', keys: ['O'], label: 'Expand or collapse all messages', group: 'Move', key: 'o' },
  { id: 'folders', keys: [`${MOD}1`, `${MOD}4`], label: 'Inbox … Trash', group: 'Move' },

  { id: 'archive', keys: ['E'], label: 'Archive', group: 'Triage', key: 'e', aliases: ['Backspace', 'Delete'] },
  { id: 'trash', keys: ['#'], label: 'Trash or restore', group: 'Triage', key: '#' },
  { id: 'star', keys: ['S'], label: 'Star', group: 'Triage', key: 's' },
  { id: 'read', keys: ['U'], label: 'Read / unread', group: 'Triage', key: 'u' },
  // `z` is Gmail's muscle memory for the same undo ⌘Z runs; both land here.
  // The printed key stays ⌘Z — one canonical chord, one muscle-memory alias.
  { id: 'undo', keys: [`${MOD}Z`], label: 'Undo the last action', group: 'Triage', key: 'z' },

  { id: 'compose', keys: ['C'], label: 'Compose', group: 'Write', key: 'c' },
  { id: 'reply', keys: ['R'], label: 'Reply', group: 'Write', key: 'r' },
  { id: 'replyAll', keys: ['A'], label: 'Reply all', group: 'Write', key: 'a' },
  { id: 'forward', keys: ['F'], label: 'Forward', group: 'Write', key: 'f' },
  { id: 'send', keys: [`${MOD}↵`], label: 'Send', group: 'Write' },

  { id: 'palette', keys: [`${MOD}K`], label: 'Command palette', group: 'Find' },
  { id: 'search', keys: ['/'], label: 'Search mail', group: 'Find', key: '/' },
  { id: 'settings', keys: [`${MOD},`], label: 'Settings', group: 'Find' },
  // The approval queue's only entry point was the sidebar badge, which is
  // absent at zero by design — so the one surface that gates outbound mail was
  // mouse-only, and unreachable at all when empty, in an app that ships a
  // palette and a printed shortcut sheet (UI-REVIEW-2026-08-29 S9). `w` for
  // "waiting on you", and it is free.
  { id: 'approvals', keys: ['W'], label: 'Waiting on you', group: 'Find', key: 'w' },
  { id: 'help', keys: ['?'], label: 'Show this list', group: 'Find', key: '?' },
  { id: 'escape', keys: ['esc'], label: 'Close the top surface', group: 'Find' },
]

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Move', 'Triage', 'Write', 'Find']

export function shortcutsIn(group: ShortcutGroup): ShortcutSpec[] {
  return SHORTCUTS.filter((s) => s.group === group)
}

/** The unmodified presses, indexed by every key or alias that fires them. */
export const SHORTCUTS_BY_KEY: Record<string, ShortcutId> = Object.fromEntries(
  SHORTCUTS.flatMap((s) => [...(s.key ? [s.key] : []), ...(s.aliases ?? [])].map((k) => [k, s.id])),
)
