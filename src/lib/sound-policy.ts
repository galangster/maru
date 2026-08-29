// Whether a sound is allowed to play, as a pure function.
//
// Sound is the highest annoyance risk in the whole product (MAGIC §2.11), and
// every guard that keeps it tasteful is arithmetic over timestamps — so none of
// it lives in the Web Audio layer, where it could only be checked by listening.
// `src/lib/sound.ts` holds the AudioContext and calls `decideSound` once per
// play; this file holds the rules and is covered by tests/sound-policy.test.ts.
//
// The rules come from SOUNDS.md §3 and MAGIC.md §4.

/** The six moments SOUNDS.md §2 maps to a file. */
export type SoundName = 'send' | 'sent' | 'newMail' | 'complete' | 'error' | 'palette'

export interface SoundPolicyState {
  /** When any sound last played. */
  lastAny: number
  /** When each sound last played. */
  last: Partial<Record<SoundName, number>>
}

/** No sound fires within 250 ms of another — MAGIC §4, the global rule. */
export const MIN_GAP_MS = 250

/**
 * The per-sound floor between two plays of the *same* cue.
 *
 * `newMail` is the one that can fire unsolicited and many times an hour, so it
 * is held to one every 30 s even across separate incremental-sync passes
 * (SOUNDS.md §3) — a burst of mail must not turn into a drumroll.
 *
 * `complete` shares the 400 ms window MAGIC §3.7 gives the archive animation:
 * a held `e` down a mailbox is one gesture, not forty.
 */
export const RATE_LIMIT_MS: Record<SoundName, number> = {
  send: 0,
  sent: 0,
  newMail: 30_000,
  complete: 400,
  error: 0,
  palette: 0,
}

/** More arriving at once than this and the arrival is silent — MAGIC §4.4. */
export const ARRIVAL_BURST_LIMIT = 3

export interface SoundRequest {
  name: SoundName
  /** Milliseconds, from the same clock every call uses. */
  now: number
  /** The Settings switch. Default off. */
  enabled: boolean
  /** `document.hasFocus()`. */
  focused: boolean
  /** `prefers-reduced-motion: reduce` — the two settings travel together. */
  reducedMotion: boolean
  /** `?screenshot=1`. Captures are silent and deterministic. */
  screenshot: boolean
  /** `newMail` only: how many threads arrived in this pass. */
  batchSize?: number
  /** `newMail` only: true while this is an account's first full backfill. */
  initialSync?: boolean
}

export type SoundVerdict =
  | 'play'
  | 'disabled'
  | 'screenshot'
  | 'reduced-motion'
  | 'initial-sync'
  | 'burst'
  | 'unfocused'
  | 'spacing'
  | 'rate-limited'

export interface SoundDecision {
  verdict: SoundVerdict
  /** The state to carry into the next call. Unchanged unless the sound played. */
  state: SoundPolicyState
}

export function initialSoundPolicyState(): SoundPolicyState {
  return { lastAny: Number.NEGATIVE_INFINITY, last: {} }
}

/**
 * Pure. Returns why a sound may or may not play, and the state that follows.
 *
 * The order matters and is the order a reader would ask the questions in:
 * is sound on at all, is this session one that may make noise, is this
 * particular event worth a sound, is the window listening, and only then the
 * two timing guards.
 */
export function decideSound(state: SoundPolicyState, request: SoundRequest): SoundDecision {
  const { name, now } = request

  // A capture must be byte-comparable and silent, matching the existing guard
  // in use-notifications.ts.
  if (request.screenshot) return { verdict: 'screenshot', state }
  if (!request.enabled) return { verdict: 'disabled', state }
  // Sound is muted under reduced motion as well: the two settings travel
  // together for vestibular and sensory sensitivity (MAGIC §4).
  if (request.reducedMotion) return { verdict: 'reduced-motion', state }

  if (name === 'newMail') {
    // The event source already guarantees this — incrementalSync() returns
    // before applyHistory() when there is no stored historyId — but a sound
    // layer that assumes it cannot be tested for it.
    if (request.initialSync) return { verdict: 'initial-sync', state }
    if ((request.batchSize ?? 1) > ARRIVAL_BURST_LIMIT) return { verdict: 'burst', state }
  }

  // Arrival is the one cue licensed to reach a user who is not looking at the
  // window. Everything else is a response to something they just did, and a
  // response to a gesture in another app is noise.
  if (!request.focused && name !== 'newMail') return { verdict: 'unfocused', state }

  if (now - state.lastAny < MIN_GAP_MS) return { verdict: 'spacing', state }

  const previous = state.last[name]
  if (previous !== undefined && now - previous < RATE_LIMIT_MS[name]) {
    return { verdict: 'rate-limited', state }
  }

  return {
    verdict: 'play',
    state: { lastAny: now, last: { ...state.last, [name]: now } },
  }
}
