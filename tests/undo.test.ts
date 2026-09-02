// Undo, in the three places it is testable without a screen: the reverse
// mapping in the service layer, the registry's stack and window rules, and the
// store that holds them. Everything else about undo is a closure over a held
// mutation and belongs to the surface that made it.

import { beforeEach, describe, it, expect, vi } from 'vitest'

interface ShownToast {
  message: string
  id?: string
  description?: string
  action?: { label: string; onClick: () => void }
}

const sonner = vi.hoisted(() => ({
  shown: [] as ShownToast[],
  dismissed: [] as string[],
}))

vi.mock('sonner', () => {
  const toast = Object.assign(
    (message: string, options: Omit<ShownToast, 'message'> = {}) => {
      sonner.shown.push({ message, ...options })
    },
    {
      dismiss: (id: string) => {
        sonner.dismissed.push(id)
      },
      success: () => {},
      error: () => {},
    },
  )
  return { toast }
})

import { labelDelta, reverseAction } from '../src/core/service/actions'
import type { MailActionType } from '../src/core/types'
import { showUndoToast, undoAndSay } from '../src/features/mail/queries'
import { useUi } from '../src/features/mail/ui-store'
import {
  announcesItself,
  findUndoable,
  liveUndoable,
  newestUndoable,
  NOTHING_TO_UNDO,
  pushUndoable,
  UNDO_DEPTH,
  UNDO_LABELS,
  UNDO_WINDOW_MS,
  undoToastId,
  withoutUndoable,
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

describe('pushUndoable', () => {
  it('puts the newest entry on top and keeps the ones under it', () => {
    const first = entry(1_000, 'archive:a')
    const second = entry(2_000, 'archive:b')
    expect(pushUndoable(pushUndoable([], first), second)).toEqual([second, first])
  })

  it('replaces an entry registered again under the same id', () => {
    // Archiving the same thread twice is one offer to undo, not two: the id is
    // what a toast button and a late clear navigate by, and a duplicate would
    // make both of them ambiguous.
    const older = entry(1_000, 'archive:a')
    const newer = entry(2_000, 'archive:a')
    expect(pushUndoable([older], newer)).toEqual([newer])
  })

  it('never grows past the depth, and drops the oldest to stay inside it', () => {
    let stack = pushUndoable([], entry(0, 'oldest'))
    for (let i = 1; i <= UNDO_DEPTH; i++) stack = pushUndoable(stack, entry(i, `e${i}`))
    expect(stack).toHaveLength(UNDO_DEPTH)
    expect(stack.map((e) => e.id)).not.toContain('oldest')
    expect(stack[0].id).toBe(`e${UNDO_DEPTH}`)
  })

  it('takes the depth as an argument, so the bound is testable at any size', () => {
    const stack = pushUndoable(pushUndoable([entry(1, 'a')], entry(2, 'b')), entry(3, 'c'), 2)
    expect(stack.map((e) => e.id)).toEqual(['c', 'b'])
  })
})

describe('newestUndoable', () => {
  it('has nothing to offer on an empty stack', () => {
    expect(newestUndoable([], 1_000)).toBeNull()
  })

  it('offers the newest entry, which is the top one', () => {
    const newer = entry(2_000, 'archive:b')
    expect(newestUndoable([newer, entry(1_000, 'archive:a')], 2_100)).toBe(newer)
  })

  it('offers nothing once every entry is past its window', () => {
    const now = 2_000 + UNDO_WINDOW_MS + 1
    expect(newestUndoable([entry(2_000, 'archive:b'), entry(1_000, 'archive:a')], now)).toBeNull()
  })

  it('skips an entry stamped in the future and offers the newest live one', () => {
    // A clock that jumped forward must not empty the stack: the entry it
    // mis-stamped is unusable, the ones under it are not.
    const live = entry(1_000, 'archive:a')
    expect(newestUndoable([entry(9_000, 'archive:b'), live], 1_500)).toBe(live)
  })
})

describe('findUndoable', () => {
  it('finds an entry by name, however deep it has been buried', () => {
    const oldest = entry(1_000, 'archive:a')
    const stack = [entry(3_000, 'archive:c'), entry(2_000, 'archive:b'), oldest]
    expect(findUndoable(stack, 'archive:a', 3_100)).toBe(oldest)
  })

  it('answers null for an id the stack no longer holds', () => {
    expect(findUndoable([entry(1_000, 'archive:a')], 'archive:z', 1_100)).toBeNull()
  })

  it('holds a named entry to the same window the keyboard uses', () => {
    // A toast left on screen past its window answers the way Cmd+Z does,
    // rather than reaching further back than the keyboard can.
    const stack = [entry(1_000, 'archive:a')]
    expect(findUndoable(stack, 'archive:a', 1_001 + UNDO_WINDOW_MS)).toBeNull()
  })
})

describe('withoutUndoable', () => {
  it('withdraws the entry that reports itself spent', () => {
    expect(withoutUndoable([entry(1_000, 'send')], 'send')).toEqual([])
  })

  it('leaves a newer entry alone when an older one reports in late', () => {
    // The send that flushes at 4 s is often no longer the newest undoable: the
    // user archived something at 2 s. A blind pop there would silently take
    // Cmd+Z away from the archive.
    const newer = entry(2_000, 'archive:t9')
    expect(withoutUndoable([newer, entry(1_000, 'send')], 'send')).toEqual([newer])
  })

  it('gives the same stack back when it holds no such id', () => {
    // Identity, not merely equality: a late clear from a spent entry must not
    // cost every subscriber a re-render.
    const stack = [entry(2_000, 'archive:t9')]
    expect(withoutUndoable(stack, 'send')).toBe(stack)
  })

  it('is a no-op on an empty stack', () => {
    expect(withoutUndoable([], 'send')).toEqual([])
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

// The store, which is where the stack rules meet a real registration. Issue 40
// lived exactly here: two archives, and the second registration overwrote the
// first in a one-slot store.
describe('the undo stack in the store', () => {
  beforeEach(() => {
    useUi.setState({ undoStack: [] })
    sonner.shown.length = 0
    sonner.dismissed.length = 0
  })

  /** Register an archive whose reversal appends to `undone`. */
  function archive(key: string, undone: string[]): string {
    const id = `archive:${key}`
    useUi.getState().registerUndo({
      id,
      label: UNDO_LABELS.archive,
      run: () => undone.push(key),
    })
    return id
  }

  it('walks back through two archives, newest first', () => {
    // Issue 40, in one test. Two archives, two presses, both threads back.
    const undone: string[] = []
    archive('a', undone)
    archive('b', undone)

    expect(useUi.getState().runUndo()?.id).toBe('archive:b')
    expect(useUi.getState().runUndo()?.id).toBe('archive:a')
    expect(undone).toEqual(['b', 'a'])
    expect(useUi.getState().undoStack).toHaveLength(0)
  })

  it('runs one entry once, however fast the second press comes', () => {
    const undone: string[] = []
    archive('a', undone)
    useUi.getState().runUndo()
    expect(useUi.getState().runUndo()).toBeNull()
    expect(undone).toEqual(['a'])
  })

  it('reports nothing at all when the stack is empty', () => {
    expect(useUi.getState().runUndo()).toBeNull()
  })

  it('reports nothing once every entry is past its window', () => {
    archive('a', [])
    expect(useUi.getState().runUndo(Date.now() + UNDO_WINDOW_MS + 1)).toBeNull()
  })

  it('undoes the entry a toast names, even with a newer one above it', () => {
    const undone: string[] = []
    const first = archive('a', undone)
    archive('b', undone)

    expect(useUi.getState().undoEntry(first)?.id).toBe(first)
    expect(undone).toEqual(['a'])
    // The newer archive is untouched and still the next thing Cmd+Z reaches.
    expect(useUi.getState().undoStack.map((e) => e.id)).toEqual(['archive:b'])
  })

  it('applies the reversal recorded at registration, not the state since', () => {
    // The threads an entry names go on changing after it is registered. What
    // it replays is what was true when the action was taken.
    let mailbox = 'inbox'
    useUi.getState().registerUndo({
      id: 'archive:a',
      label: UNDO_LABELS.archive,
      run: () => {
        mailbox = 'inbox'
      },
    })
    mailbox = 'trash'
    useUi.getState().runUndo()
    expect(mailbox).toBe('inbox')
  })

  it('holds at most UNDO_DEPTH entries, dropping the oldest', () => {
    const undone: string[] = []
    archive('oldest', undone)
    for (let i = 1; i <= UNDO_DEPTH; i++) archive(`t${i}`, undone)

    const stack = useUi.getState().undoStack
    expect(stack).toHaveLength(UNDO_DEPTH)
    expect(stack.map((e) => e.id)).not.toContain('archive:oldest')
  })

  it('withdraws one entry by name and leaves the rest standing', () => {
    const undone: string[] = []
    archive('a', undone)
    archive('b', undone)
    useUi.getState().clearUndo('archive:b')
    expect(useUi.getState().runUndo()?.id).toBe('archive:a')
  })

  it('drops the whole stack on sign-out', () => {
    archive('a', [])
    archive('b', [])
    useUi.getState().clearUndoStack()
    expect(useUi.getState().undoStack).toEqual([])
  })
})

describe('the answer Cmd+Z gives', () => {
  beforeEach(() => {
    useUi.setState({ undoStack: [] })
    sonner.shown.length = 0
    sonner.dismissed.length = 0
  })

  const last = () => sonner.shown[sonner.shown.length - 1]

  it('says what it undid', () => {
    useUi.getState().registerUndo({ id: 'archive:a', label: UNDO_LABELS.archive, run: () => {} })
    undoAndSay()
    expect(last().message).toBe('Undone')
    expect(last().description).toBe(UNDO_LABELS.archive)
  })

  it('takes the spent offer off the screen with it', () => {
    // The button is on screen and has to still work, so it goes in the same
    // turn as the action it offered — issue 2's rule, on the archive toast.
    useUi.getState().registerUndo({ id: 'archive:a', label: UNDO_LABELS.archive, run: () => {} })
    undoAndSay()
    expect(sonner.dismissed).toContain(undoToastId('archive:a'))
  })

  it('says "Nothing to undo" rather than nothing at all', () => {
    // Issue 40's second half: a cold start, or one press past the last entry.
    undoAndSay()
    expect(last().message).toBe(NOTHING_TO_UNDO)
  })

  it('answers the same way once the stack has been walked back', () => {
    useUi.getState().registerUndo({ id: 'archive:a', label: UNDO_LABELS.archive, run: () => {} })
    undoAndSay()
    undoAndSay()
    expect(last().message).toBe(NOTHING_TO_UNDO)
  })

  it('does not leave the last label standing under "Nothing to undo"', () => {
    // Sonner spreads the new options over the ones on screen, so an omitted
    // description would print "Nothing to undo / Archived" — issue 2's trap,
    // one toast further on.
    useUi.getState().registerUndo({ id: 'archive:a', label: UNDO_LABELS.archive, run: () => {} })
    undoAndSay()
    undoAndSay()
    expect(last().description).toBeUndefined()
  })
})

describe('showUndoToast', () => {
  beforeEach(() => {
    useUi.setState({ undoStack: [] })
    sonner.shown.length = 0
    sonner.dismissed.length = 0
  })

  it('gives each entry its own toast, so a second action keeps the first offer', () => {
    showUndoToast('archive:a', UNDO_LABELS.archive, 'Book club')
    showUndoToast('archive:b', UNDO_LABELS.archive, 'Standup notes')
    expect(sonner.shown.map((t) => t.id)).toEqual([
      undoToastId('archive:a'),
      undoToastId('archive:b'),
    ])
  })

  it('reverses the action that raised it, not whatever is newest', () => {
    const undone: string[] = []
    for (const key of ['a', 'b']) {
      useUi.getState().registerUndo({
        id: `archive:${key}`,
        label: UNDO_LABELS.archive,
        run: () => undone.push(key),
      })
    }
    showUndoToast('archive:a', UNDO_LABELS.archive, 'Book club')

    const button = sonner.shown[0].action
    expect(button?.label).toBe('Undo')
    button?.onClick()
    expect(undone).toEqual(['a'])
  })
})
