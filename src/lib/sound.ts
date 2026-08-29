// Interface sounds — SOUNDS.md.
//
// Six cues, one AudioContext, one master gain, default off. Everything about
// *whether* a sound plays is in `sound-policy.ts` and is unit-tested; this file
// only owns the audio graph and the loading.
//
// Web Audio rather than <audio> elements: it decodes once instead of per play,
// it lets all six share a context and a master gain, and it is the only way to
// hold the six mastering levels of three different creators to one level
// (SOUNDS.md §3). Total payload is under 30 KB, resident for the process.
//
// Licensing: every file under assets/sounds/active is CC0 or explicitly
// no-attribution — see assets/sounds/LICENSES.md. Nothing here reaches the
// About screen.

import completeUrl from '@/assets/sounds/active/complete.mp3?url'
import errorUrl from '@/assets/sounds/active/error.mp3?url'
import newMailUrl from '@/assets/sounds/active/new-mail.mp3?url'
import paletteUrl from '@/assets/sounds/active/palette.wav?url'
import sendUrl from '@/assets/sounds/active/send.mp3?url'
import sentUrl from '@/assets/sounds/active/sent.mp3?url'

import { isScreenshot } from '@/lib/env'
import {
  decideSound,
  initialSoundPolicyState,
  type SoundName,
  type SoundPolicyState,
} from '@/lib/sound-policy'

export type { SoundName } from '@/lib/sound-policy'

const FILES: Record<SoundName, string> = {
  send: sendUrl,
  sent: sentUrl,
  newMail: newMailUrl,
  complete: completeUrl,
  error: errorUrl,
  palette: paletteUrl,
}

/**
 * Master gain, ~-15 dB. SOUNDS.md §3 asks for -18 to -14 dB relative to source
 * peak so the cues read as texture rather than as notifications: nothing here
 * should be audible across a room.
 */
const MASTER_GAIN = 0.18

/**
 * Per-cue, relative to master — MAGIC §4's table.
 *
 * `send` is the sheet leaving and sits under `sent`, which is the earned moment
 * and fires at the *end* of the undo window: a sound at button press would be
 * lying about state, because the mail has not gone yet.
 */
const GAIN: Record<SoundName, number> = {
  send: 0.55,
  sent: 1,
  newMail: 0.5,
  complete: 0.4,
  error: 0.7,
  palette: 0.4,
}

let enabled = false
let context: AudioContext | null = null
let master: GainNode | null = null
let loading: Promise<void> | null = null
const buffers = new Map<SoundName, AudioBuffer>()
let policy: SoundPolicyState = initialSoundPolicyState()

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Build the graph and decode the set. Both halves need a user gesture behind
 * them: a context created before one starts suspended, and resuming it is the
 * gesture's job. Called from the first pointer or key press, and again from the
 * Settings switch — which is itself a click.
 */
function ensureReady(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    if (typeof window === 'undefined' || isScreenshot) return
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    context = new Ctor()
    master = context.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(context.destination)

    await Promise.all(
      (Object.keys(FILES) as SoundName[]).map(async (name) => {
        try {
          const response = await fetch(FILES[name])
          const bytes = await response.arrayBuffer()
          // `context` cannot be null here, but decodeAudioData is the one call
          // that can reject on a format an engine will not take — a cue that
          // fails to decode must cost the app nothing but its own silence.
          buffers.set(name, await (context as AudioContext).decodeAudioData(bytes))
        } catch {
          // Left out of the map. `play` treats a missing buffer as silence.
        }
      }),
    )
  })()
  return loading
}

if (typeof window !== 'undefined' && !isScreenshot) {
  // Preload on the first gesture of the session, whatever it was, so the first
  // cue is never the one that pays the decode. Passive and once.
  const arm = () => {
    if (enabled) void ensureReady()
  }
  window.addEventListener('pointerdown', arm, { once: true, passive: true })
  window.addEventListener('keydown', arm, { once: true })
}

/** The Settings switch. Off is the shipped default — SOUNDS.md §3. */
export function setSoundsEnabled(next: boolean): void {
  enabled = next
  if (next) void ensureReady()
}

export interface PlayOptions {
  /** `newMail` only: how many threads arrived in this pass. */
  batchSize?: number
  /** `newMail` only: true while this is an account's first backfill. */
  initialSync?: boolean
}

/**
 * Play a cue, if every guard in `sound-policy` says so. Fire and forget: a
 * caller in an action handler must never wait on audio.
 */
export function playSound(name: SoundName, options: PlayOptions = {}): void {
  const decision = decideSound(policy, {
    name,
    now: Date.now(),
    enabled,
    focused: typeof document === 'undefined' ? false : document.hasFocus(),
    reducedMotion: prefersReducedMotion(),
    screenshot: isScreenshot,
    batchSize: options.batchSize,
    initialSync: options.initialSync,
  })
  // The state advances even when nothing is audible for this call's own
  // reasons; it only records a play, so a blocked cue never moves the clock.
  policy = decision.state
  if (decision.verdict !== 'play') return

  void (async () => {
    await ensureReady()
    const buffer = buffers.get(name)
    if (!context || !master || !buffer) return
    if (context.state === 'suspended') await context.resume()
    const source = context.createBufferSource()
    source.buffer = buffer
    const gain = context.createGain()
    gain.gain.value = GAIN[name]
    source.connect(gain).connect(master)
    source.start()
  })()
}
