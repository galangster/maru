import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: vi.fn() }))

import type { MailAction } from '../src/core/types'
import { bulkAction, checkedInView } from '../src/features/list/bulk'
import { useUi } from '../src/features/mail/ui-store'
import { makeThread } from './fixtures/domain'

const threads = ['a', 'b', 'c', 'd'].map((id, i) =>
  makeThread({ gmailThreadId: id, lastMessageAt: 400 - i * 100 }),
)
const key = (id: string) => threads.find((t) => t.gmailThreadId === id)!.key

beforeEach(() => {
  useUi.setState({
    checked: new Set<string>(),
    checkAnchor: null,
    selected: null,
    undoable: null,
  })
})

describe('checkedInView', () => {
  it('returns checked threads in list order, ignoring keys the lens hides', () => {
    useUi.setState({ checked: new Set([key('c'), key('a'), 'acct-1/gone']) })
    expect(checkedInView(threads).map((t) => t.gmailThreadId)).toEqual(['a', 'c'])
  })
})

describe('bulkAction', () => {
  it('dispatches one mutation per checked thread and clears the batch', () => {
    useUi.setState({ checked: new Set([key('b'), key('d')]) })
    const sent: MailAction[] = []
    const count = bulkAction((a) => sent.push(a), threads, 'markRead')
    expect(count).toBe(2)
    expect(sent).toEqual([
      { type: 'markRead', threadKey: key('b') },
      { type: 'markRead', threadKey: key('d') },
    ])
    expect(useUi.getState().checked.size).toBe(0)
  })

  it('is a no-op when nothing visible is checked', () => {
    const sent: MailAction[] = []
    expect(bulkAction((a) => sent.push(a), threads, 'archive')).toBe(0)
    expect(sent).toEqual([])
    expect(useUi.getState().undoable).toBeNull()
  })

  it('advances the reading selection past the whole batch on a removal', () => {
    useUi.setState({ checked: new Set([key('b'), key('c')]), selected: key('b') })
    bulkAction(() => {}, threads, 'archive')
    expect(useUi.getState().selected).toBe(key('d'))
  })

  it('falls back to the nearest survivor above when the batch runs to the end', () => {
    useUi.setState({ checked: new Set([key('c'), key('d')]), selected: key('d') })
    bulkAction(() => {}, threads, 'trash')
    expect(useUi.getState().selected).toBe(key('b'))
  })

  it('registers ONE undo that reverses every thread in the batch', () => {
    useUi.setState({ checked: new Set([key('a'), key('c')]) })
    const sent: MailAction[] = []
    bulkAction((a) => sent.push(a), threads, 'archive')
    sent.length = 0
    const label = useUi.getState().runUndo()
    expect(label).toBe('2 threads archived')
    expect(sent).toEqual([
      { type: 'unarchive', threadKey: key('a') },
      { type: 'unarchive', threadKey: key('c') },
    ])
  })
})
