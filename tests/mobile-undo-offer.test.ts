import { describe, expect, it } from 'vitest'

import { UNDO_DEPTH, UNDO_WINDOW_MS, type Undoable } from '@/lib/undo'
import { coalescedOffer } from '@/mobile/undo-offer'

const NOW = new Date(2026, 8, 2, 9, 30).getTime()

function entry(overrides: Partial<Undoable> = {}): Undoable {
  return { id: 'archive:account/one', label: 'Archived', at: NOW, run: () => {}, ...overrides }
}

/** A burst, newest first, the way `pushUndoable` leaves the stack. */
function burst(count: number, label = 'Archived'): Undoable[] {
  return Array.from({ length: count }, (_, index) =>
    entry({ id: `archive:account/${count - index}`, label, at: NOW - index * 200 }),
  )
}

/**
 * The phone's one undo offer.
 *
 * Six archives in a row raised six toasts, the newest in front and the other
 * five unreachable behind it; working down the pile got five back and the
 * sixth expired while it was still buried (issue 65). The registry is
 * unchanged — this is how many DOORS the phone puts on it.
 */
describe('the coalesced undo offer', () => {
  it('says what one action was', () => {
    expect(coalescedOffer([entry()], NOW)?.title).toBe('Archived')
  })

  it('counts a burst of the same action', () => {
    expect(coalescedOffer(burst(6), NOW)?.title).toBe('Archived · 6')
  })

  it('reverses the newest offer, which is the one a burst leaves in front', () => {
    const offer = coalescedOffer(burst(6), NOW)
    expect(offer?.entryId).toBe('archive:account/6')
    expect(offer?.count).toBe(6)
  })

  it('drops the verb when the offers do not share one', () => {
    // A star, an archive and a batch saved for later are three offers and none
    // of them is "Archived".
    const mixed = [entry({ id: 'star:a', label: 'Starred' }), entry({ id: 'archive:b' })]
    expect(coalescedOffer(mixed, NOW)?.title).toBe('2 actions')
  })

  it('keeps a batch sentence when the batch is the newest thing', () => {
    expect(coalescedOffer([entry({ label: '3 conversations archived' })], NOW)?.title).toBe(
      '3 conversations archived',
    )
  })

  it('offers nothing at all over an empty stack', () => {
    expect(coalescedOffer([], NOW)).toBeNull()
  })

  it('does not count offers whose window has closed', () => {
    // The stack holds expired entries until the next registration sweeps them.
    // Counting them would offer to undo something the window closed on.
    const stack = [entry({ id: 'a' }), entry({ id: 'b', at: NOW - UNDO_WINDOW_MS - 1 })]
    expect(coalescedOffer(stack, NOW)?.title).toBe('Archived')
    expect(coalescedOffer(stack, NOW)?.count).toBe(1)
  })

  it('offers nothing when every entry has expired', () => {
    expect(coalescedOffer(burst(3).map((e) => ({ ...e, at: NOW - UNDO_WINDOW_MS - 1 })), NOW)).toBeNull()
  })

  it('skips an expired entry to reach the live one under it', () => {
    // A clock that has jumped forward leaves a future-stamped entry on top.
    const stack = [entry({ id: 'future', at: NOW + 60_000 }), entry({ id: 'real' })]
    expect(coalescedOffer(stack, NOW)?.entryId).toBe('real')
  })

  it('never counts past the depth the registry keeps', () => {
    expect(coalescedOffer(burst(UNDO_DEPTH), NOW)?.count).toBe(UNDO_DEPTH)
    expect(coalescedOffer(burst(UNDO_DEPTH), NOW)?.title).toBe(`Archived · ${UNDO_DEPTH}`)
  })
})
