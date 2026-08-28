import { describe, it, expect } from 'vitest'
import { ThreadSearchIndex } from '../src/core/search/index'
import { makeThread } from './fixtures/domain'

function index() {
  const idx = new ThreadSearchIndex()
  idx.replaceAll([
    makeThread({
      gmailThreadId: 'a',
      subject: 'Tuesday walkthrough',
      snippet: 'Can we move the site visit',
      participants: [{ name: 'Maya Ellison', email: 'maya@fernwood.dev' }],
      lastMessageAt: 300,
    }),
    makeThread({
      gmailThreadId: 'b',
      subject: 'Order HS-40812 shipped',
      snippet: 'Your order is on its way',
      participants: [{ name: 'Harlow Supply', email: 'orders@harlowsupply.example' }],
      lastMessageAt: 200,
    }),
    makeThread({
      gmailThreadId: 'c',
      subject: 'Flight confirmation',
      snippet: 'SFO to PDX on 14 September',
      participants: [{ name: 'Alderfly Air', email: 'noreply@alderflyair.example' }],
      lastMessageAt: 100,
    }),
  ])
  return idx
}

describe('ThreadSearchIndex', () => {
  it('matches on subject', () => {
    expect(index().search('walkthrough').map((t) => t.gmailThreadId)).toEqual(['a'])
  })

  it('matches on a participant name and on an email address', () => {
    expect(index().search('Harlow').map((t) => t.gmailThreadId)).toEqual(['b'])
    expect(index().search('alderflyair').map((t) => t.gmailThreadId)).toEqual(['c'])
  })

  it('matches on the snippet', () => {
    expect(index().search('site visit').map((t) => t.gmailThreadId)).toEqual(['a'])
  })

  it('matches a prefix so search feels live while typing', () => {
    expect(index().search('walkth').map((t) => t.gmailThreadId)).toEqual(['a'])
  })

  it('returns nothing for a blank query', () => {
    expect(index().search('   ')).toEqual([])
  })

  it('returns nothing when no thread matches', () => {
    expect(index().search('zzzznotathing')).toEqual([])
  })

  it('searches body text once a thread is hydrated', () => {
    const idx = index()
    expect(idx.search('boarding')).toEqual([])
    idx.upsert(
      makeThread({ gmailThreadId: 'c', subject: 'Flight confirmation', lastMessageAt: 100 }),
      'Your boarding pass is attached',
    )
    expect(idx.search('boarding').map((t) => t.gmailThreadId)).toEqual(['c'])
  })

  it('replaces rather than duplicates on upsert, and drops stale terms', () => {
    const idx = index()
    idx.upsert(makeThread({ gmailThreadId: 'a', subject: 'Renamed entirely', lastMessageAt: 300 }))
    expect(idx.size).toBe(3)
    expect(idx.search('walkthrough')).toEqual([])
    expect(idx.search('Renamed').map((t) => t.gmailThreadId)).toEqual(['a'])
  })

  it('forgets a removed thread', () => {
    const idx = index()
    idx.remove('acct-1/b')
    expect(idx.size).toBe(2)
    expect(idx.search('Harlow')).toEqual([])
  })

  it('returns whole Thread objects, not ids', () => {
    const [hit] = index().search('walkthrough')
    expect(hit).toMatchObject({ key: 'acct-1/a', subject: 'Tuesday walkthrough', messageCount: 1 })
  })

  it('honours the result limit', () => {
    const idx = new ThreadSearchIndex()
    idx.replaceAll(
      Array.from({ length: 10 }, (_, i) =>
        makeThread({ gmailThreadId: `t${i}`, subject: 'shared keyword here', lastMessageAt: i }),
      ),
    )
    expect(idx.search('shared', 4)).toHaveLength(4)
  })
})
