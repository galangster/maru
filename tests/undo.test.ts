// Undo, in the two places it is pure: the reverse mapping in the service layer
// and the registry's window rule. Everything else about undo is a closure over
// a held mutation and belongs to the surface that made it.

import { describe, it, expect, vi } from 'vitest'

import { labelDelta, reverseAction } from '../src/core/service/actions'
import type { MailActionType } from '../src/core/types'
import {
  announcesItself,
  clearedUndoable,
  liveUndoable,
  UNDO_LABELS,
  UNDO_WINDOW_MS,
  type Undoable,
} from '../src/lib/undo'

const ALL: MailActionType[] = [
  'archive',
  'unarchive',
  'trash',
  'untrash',
  'star',
  'unstar',
  'markRead',
  'markUnread',
]

describe('reverseAction', () => {
  it('pairs every action with another action', () => {
    for (const type of ALL) expect(ALL).toContain(reverseAction(type))
  })

  it('is an involution: undoing an undo is the original action', () => {
    for (const type of ALL) expect(reverseAction(reverseAction(type))).toBe(type)
  })

  it('never maps an action to itself', () => {
    for (const type of ALL) expect(reverseAction(type)).not.toBe(type)
  })

  it('is the same label arithmetic read backwards', () => {
    // The property that makes the mapping right rather than merely plausible:
    // the reverse adds exactly what the action removed, and removes exactly
    // what it added. A table hand-kept in the UI could not promise this.
    for (const type of ALL) {
      const forward = labelDelta(type)
      const back = labelDelta(reverseAction(type))
      expect(back.add).toEqual(forward.remove)
      expect(back.remove).toEqual(forward.add)
    }
  })

  it('names the four the toasts promise', () => {
    expect(reverseAction('archive')).toBe('unarchive')
    expect(reverseAction('trash')).toBe('untrash')
    expect(reverseAction('star')).toBe('unstar')
    expect(reverseAction('markRead')).toBe('markUnread')
  })

  it('restores INBOX when it undoes an archive', () => {
    expect(labelDelta(reverseAction('archive'))).toEqual({ add: ['INBOX'], remove: [] })
  })
})

function entry(at: number, id = 'archive:t1'): Undoable {
  return { id, label: 'Archived', at, run: vi.fn() }
}

describe('liveUndoable', () => {
  it('has nothing to offer when nothing was registered', () => {
    expect(liveUndoable(null, 1_000)).toBeNull()
  })

  it('offers an action taken a moment ago', () => {
    const e = entry(1_000)
    expect(liveUndoable(e, 1_500)).toBe(e)
  })

  it('offers an action taken exactly at the edge of the window', () => {
    const e = entry(1_000)
    expect(liveUndoable(e, 1_000 + UNDO_WINDOW_MS)).toBe(e)
  })

  it('drops an action one millisecond past the window', () => {
    expect(liveUndoable(entry(1_000), 1_001 + UNDO_WINDOW_MS)).toBeNull()
  })

  it('drops an entry stamped in the future rather than treating it as fresh', () => {
    // A clock that went backwards — a system time change, a laptop resumed.
    // Reading a negative age as "very recent" would hand back an action the
    // user stopped thinking about hours ago.
    expect(liveUndoable(entry(9_000), 1_000)).toBeNull()
  })

  it('takes the window as an argument, so a caller can be stricter', () => {
    const e = entry(1_000)
    expect(liveUndoable(e, 3_000, 1_000)).toBeNull()
    expect(liveUndoable(e, 1_500, 1_000)).toBe(e)
  })
})

describe('clearedUndoable', () => {
  it('withdraws the entry that reports itself spent', () => {
    expect(clearedUndoable(entry(1_000, 'send'), 'send')).toBeNull()
  })

  it('leaves a newer entry alone when an older one reports in late', () => {
    // The send that flushes at 4 s is often no longer the newest undoable: the
    // user archived something at 2 s. A blind clear there would silently take
    // Cmd+Z away from the archive.
    const newer = entry(2_000, 'archive:t9')
    expect(clearedUndoable(newer, 'send')).toBe(newer)
  })

  it('is a no-op on an empty registry', () => {
    expect(clearedUndoable(null, 'send')).toBeNull()
  })
})

describe('announcesItself', () => {
  it('announces every action that moves a thread between mailboxes', () => {
    expect(announcesItself('archive')).toBe(true)
    expect(announcesItself('trash')).toBe(true)
    // Issue 5: restoring is the mirror of trashing and was the silent one.
    expect(announcesItself('untrash')).toBe(true)
    expect(announcesItself('unarchive')).toBe(true)
  })

  it('stays quiet for a flag the row still shows', () => {
    expect(announcesItself('star')).toBe(false)
    expect(announcesItself('unstar')).toBe(false)
    expect(announcesItself('markRead')).toBe(false)
    expect(announcesItself('markUnread')).toBe(false)
  })

  it('gives every announced action words that say where the thread went', () => {
    expect(UNDO_LABELS.trash).toBe('Moved to trash')
    expect(UNDO_LABELS.untrash).toBe('Moved to Inbox')
    for (const type of ['archive', 'unarchive', 'trash', 'untrash'] as const) {
      expect(UNDO_LABELS[type].length).toBeGreaterThan(0)
    }
  })
})
