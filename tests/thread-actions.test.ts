// The thread action descriptor: one table read by the row's hover cluster, the
// reading toolbar, the command palette and the keymap. Every one of them names
// its buttons from `label`, so a missing or empty label there is an unnamed
// control on four surfaces at once (issue 6).

import { describe, expect, it } from 'vitest'

import {
  THREAD_ACTION_ORDER,
  threadActions,
  type ThreadActionSource,
} from '@/features/mail/thread-actions'

const NOW = Date.UTC(2026, 8, 2, 9, 0, 0)

function thread(over: Partial<ThreadActionSource> = {}): ThreadActionSource {
  return { labelIds: ['INBOX'], unread: false, starred: false, ...over }
}

describe('threadActions', () => {
  it('names every action, on an inbox thread and on a trashed one', () => {
    for (const source of [thread(), thread({ labelIds: ['TRASH'] })]) {
      const actions = threadActions(source, NOW)
      for (const id of THREAD_ACTION_ORDER) {
        expect(actions[id].label.trim().length, id).toBeGreaterThan(0)
      }
    }
  })

  it('says which way each toggle is about to go', () => {
    const actions = threadActions(thread({ unread: true }), NOW)
    expect(actions.read.label).toBe('Mark as read')
    expect(actions.star.label).toBe('Star')

    const other = threadActions(thread({ unread: false, starred: true }), NOW)
    expect(other.read.label).toBe('Mark as unread')
    expect(other.star.label).toBe('Unstar')
  })

  it('renames trash to restore once the thread is in the trash', () => {
    expect(threadActions(thread(), NOW).trash.label).toBe('Move to trash')
    const trashed = threadActions(thread({ labelIds: ['TRASH'] }), NOW)
    expect(trashed.trash.label).toBe('Restore from trash')
    expect(trashed.trash.type).toBe('untrash')
  })

  it('gives every action a distinct name, so five icons are five buttons', () => {
    const actions = threadActions(thread(), NOW)
    const labels = THREAD_ACTION_ORDER.map((id) => actions[id].label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
