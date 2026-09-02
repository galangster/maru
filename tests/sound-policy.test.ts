import { describe, it, expect } from 'vitest'

import {
  ARRIVAL_BURST_LIMIT,
  MIN_GAP_MS,
  RATE_LIMIT_MS,
  decideSound,
  initialSoundPolicyState,
  rateLimit,
  type SoundName,
  type SoundPolicyState,
  type SoundRequest,
} from '../src/lib/sound-policy'

/** A request with every guard satisfied, so each test can break exactly one. */
function request(over: Partial<SoundRequest> = {}): SoundRequest {
  return {
    name: 'send',
    now: 1_000_000,
    enabled: true,
    focused: true,
    reducedMotion: false,
    screenshot: false,
    ...over,
  }
}

/** Play a cue and return the state that follows, asserting it was audible. */
function play(state: SoundPolicyState, over: Partial<SoundRequest> = {}): SoundPolicyState {
  const decision = decideSound(state, request(over))
  expect(decision.verdict).toBe('play')
  return decision.state
}

describe('decideSound — the switch', () => {
  it('is silent by default: nothing plays while sounds are off', () => {
    const decision = decideSound(initialSoundPolicyState(), request({ enabled: false }))
    expect(decision.verdict).toBe('disabled')
  })

  it('plays when the switch is on and nothing else objects', () => {
    expect(decideSound(initialSoundPolicyState(), request()).verdict).toBe('play')
  })

  it('never plays during a capture, even with the switch on', () => {
    const decision = decideSound(initialSoundPolicyState(), request({ screenshot: true }))
    expect(decision.verdict).toBe('screenshot')
  })

  it('is muted under reduced motion — the two settings travel together', () => {
    const decision = decideSound(initialSoundPolicyState(), request({ reducedMotion: true }))
    expect(decision.verdict).toBe('reduced-motion')
  })

  it('leaves the state untouched when a cue is blocked, so nothing is "spent"', () => {
    const state = initialSoundPolicyState()
    const decision = decideSound(state, request({ enabled: false }))
    expect(decision.state).toBe(state)
  })
})

describe('decideSound — window focus', () => {
  it('holds every response cue while the window is unfocused', () => {
    for (const name of ['send', 'sent', 'complete', 'error', 'palette'] as SoundName[]) {
      const decision = decideSound(initialSoundPolicyState(), request({ name, focused: false }))
      expect(decision.verdict).toBe('unfocused')
    }
  })

  it('lets arrival through unfocused — the one cue for peripheral attention', () => {
    const decision = decideSound(
      initialSoundPolicyState(),
      request({ name: 'newMail', focused: false }),
    )
    expect(decision.verdict).toBe('play')
  })
})

describe('decideSound — the 250 ms global spacing', () => {
  it('refuses a second cue inside the window', () => {
    const after = play(initialSoundPolicyState())
    const decision = decideSound(after, request({ name: 'palette', now: 1_000_000 + MIN_GAP_MS - 1 }))
    expect(decision.verdict).toBe('spacing')
  })

  it('allows it once the window has passed', () => {
    const after = play(initialSoundPolicyState())
    const decision = decideSound(after, request({ name: 'palette', now: 1_000_000 + MIN_GAP_MS }))
    expect(decision.verdict).toBe('play')
  })

  it('spaces cues of different names, not just repeats of one', () => {
    const after = play(initialSoundPolicyState(), { name: 'complete' })
    expect(decideSound(after, request({ name: 'error', now: 1_000_100 })).verdict).toBe('spacing')
  })
})

describe('decideSound — archive is a 100x/day action', () => {
  it('holds `complete` to one tick per 400 ms, so a held key is one gesture', () => {
    let state = play(initialSoundPolicyState(), { name: 'complete', now: 0 })
    // Well past the 250 ms global spacing, still inside the cue's own window.
    const decision = decideSound(state, request({ name: 'complete', now: 399 }))
    expect(decision.verdict).toBe('rate-limited')

    state = decision.state
    expect(decideSound(state, request({ name: 'complete', now: 400 })).verdict).toBe('play')
  })

  it('collapses a forty-press mass archive to a handful of ticks', () => {
    let state = initialSoundPolicyState()
    let audible = 0
    // Forty archives at 60 ms apart: a fast held `e` down a mailbox.
    for (let i = 0; i < 40; i++) {
      const decision = decideSound(state, request({ name: 'complete', now: i * 60 }))
      if (decision.verdict === 'play') audible++
      state = decision.state
    }
    // 2.34 s of held key, one tick every 400 ms: six, not forty.
    expect(audible).toBe(6)
  })
})

describe('decideSound — arrival', () => {
  it('stays silent during an account\'s first sync', () => {
    const decision = decideSound(
      initialSoundPolicyState(),
      request({ name: 'newMail', initialSync: true, batchSize: 1 }),
    )
    expect(decision.verdict).toBe('initial-sync')
  })

  it('plays for a batch at the limit and stays silent above it', () => {
    const at = decideSound(
      initialSoundPolicyState(),
      request({ name: 'newMail', batchSize: ARRIVAL_BURST_LIMIT }),
    )
    expect(at.verdict).toBe('play')

    const over = decideSound(
      initialSoundPolicyState(),
      request({ name: 'newMail', batchSize: ARRIVAL_BURST_LIMIT + 1 }),
    )
    expect(over.verdict).toBe('burst')
  })

  it('holds arrival to one every 30 s across separate sync passes', () => {
    const state = play(initialSoundPolicyState(), { name: 'newMail', now: 0, batchSize: 1 })

    // A second pass a minute of polling later, but inside the floor.
    expect(
      decideSound(state, request({ name: 'newMail', now: 29_999, batchSize: 1 })).verdict,
    ).toBe('rate-limited')

    expect(
      decideSound(state, request({ name: 'newMail', now: RATE_LIMIT_MS.newMail, batchSize: 1 }))
        .verdict,
    ).toBe('play')
  })

  it('does not let a burst of mail turn into a drumroll', () => {
    let state = initialSoundPolicyState()
    let audible = 0
    // Twelve arrival passes over ten minutes of polling, one thread each.
    for (let i = 0; i < 12; i++) {
      const decision = decideSound(state, request({ name: 'newMail', now: i * 50_000, batchSize: 1 }))
      if (decision.verdict === 'play') audible++
      state = decision.state
    }
    expect(audible).toBe(12)

    // The same twelve arriving inside a single minute: at most two.
    state = initialSoundPolicyState()
    audible = 0
    for (let i = 0; i < 12; i++) {
      const decision = decideSound(state, request({ name: 'newMail', now: i * 5_000, batchSize: 1 }))
      if (decision.verdict === 'play') audible++
      state = decision.state
    }
    expect(audible).toBe(2)
  })
})

describe('decideSound — the send pair', () => {
  it('lets `send` and `sent` both play across a real undo window', () => {
    const state = play(initialSoundPolicyState(), { name: 'send', now: 0 })
    // `sent` fires at the end of the 4 s hold, long past the 250 ms spacing.
    expect(decideSound(state, request({ name: 'sent', now: 4_000 })).verdict).toBe('play')
  })

  it('has no floor of its own — send is bounded by human typing speed', () => {
    expect(RATE_LIMIT_MS.send).toBe(0)
    expect(RATE_LIMIT_MS.sent).toBe(0)
  })
})

describe('the shared cue clock', () => {
  it('lets the first cue through and holds the rest for the window', () => {
    // A bulk archive fans out one mutation per thread. All of them land in the
    // same millisecond, and only the first is a confirmation.
    expect(rateLimit('archive-burst', 400, 1_000)).toBe(true)
    expect(rateLimit('archive-burst', 400, 1_000)).toBe(false)
    expect(rateLimit('archive-burst', 400, 1_399)).toBe(false)
    expect(rateLimit('archive-burst', 400, 1_400)).toBe(true)
  })

  it('keeps one clock per key', () => {
    expect(rateLimit('later-key', 400, 5_000)).toBe(true)
    expect(rateLimit('complete-key', 400, 5_000)).toBe(true)
    expect(rateLimit('later-key', 400, 5_100)).toBe(false)
  })

  it('never blocks a cue with no window', () => {
    expect(rateLimit('unbounded', 0, 9_000)).toBe(true)
    expect(rateLimit('unbounded', 0, 9_000)).toBe(true)
  })
})
