import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: vi.fn() }))

import type { MailAction } from '../src/core/types'
import { bulkAction, bulkDefer, checkedInView } from '../src/features/list/bulk'
import { useUi } from '../src/features/mail/ui-store'
import { wakeTime } from '../src/lib/format'
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

describe('bulkDefer', () => {
  const NOW = 1_800_000_000_000
  const WAKE = NOW + 86_400_000

  it('saves the batch, clears the checkmarks, and offers ONE undo', () => {
    useUi.setState({ checked: new Set([key('b'), key('d')]) })
    const sent: [string, number | null][] = []
    const count = bulkDefer((k, at) => sent.push([k, at]), threads, WAKE, NOW)

    expect(count).toBe(2)
    expect(sent).toEqual([
      [key('b'), WAKE],
      [key('d'), WAKE],
    ])
    expect(useUi.getState().checked.size).toBe(0)
    expect(useUi.getState().undoable).toMatchObject({ id: 'bulk:later' })
  })

  it('says what Maru will do, and says it once for the whole batch', () => {
    useUi.setState({ checked: new Set([key('a')]) })
    bulkDefer(() => {}, threads, WAKE, NOW)
    expect(useUi.getState().undoable?.label).toBe(`1 thread saved for ${wakeTime(WAKE, NOW)}`)
  })

  it('puts each thread back on ITS OWN schedule, not on one shared guess', () => {
    // Two threads deferred to different times, both brought back at once.
    const deferred = [
      { ...threads[0], deferredUntil: NOW + 1_000 },
      { ...threads[1], deferredUntil: NOW + 2_000 },
    ]
    useUi.setState({ checked: new Set(deferred.map((t) => t.key)) })
    const sent: [string, number | null][] = []
    bulkDefer((k, at) => sent.push([k, at]), deferred, null, NOW)
    expect(sent).toEqual([
      [deferred[0].key, null],
      [deferred[1].key, null],
    ])

    sent.length = 0
    useUi.getState().runUndo()
    expect(sent).toEqual([
      [deferred[0].key, NOW + 1_000],
      [deferred[1].key, NOW + 2_000],
    ])
  })

  it('reports zero when nothing visible is checked, so the key falls through', () => {
    useUi.setState({ checked: new Set(['acct-1/gone']) })
    expect(bulkDefer(() => {}, threads, WAKE, NOW)).toBe(0)
  })

  it('advances the selection off a thread the batch is about to remove', () => {
    useUi.setState({ checked: new Set([key('b')]), selected: key('b') })
    bulkDefer(() => {}, threads, WAKE, NOW)
    expect(useUi.getState().selected).toBe(key('c'))
  })
})
