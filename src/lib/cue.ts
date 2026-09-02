// A confirmation the user can hear and feel.
//
// Sound and haptic are one decision, not two. They answer the same event, they
// are governed by the same window — MAGIC §3.7's 400 ms, so a held `e` down a
// mailbox is one confirmation rather than forty — and they must never disagree
// about whether that event happened. Two clocks did disagree: `decideSound`
// only records a cue that was audible, so the haptic beside it needed a second
// timestamp of its own, and sound being off by default meant the two were
// almost never in step.
//
// The rule lives in `sound-policy.ts`, where it is arithmetic over timestamps
// and can be tested. This file only binds a cue to what it feels like.

import { isScreenshot } from '@/lib/env'
import { playSound } from '@/lib/sound'
import { RATE_LIMIT_MS, rateLimit, type SoundName } from '@/lib/sound-policy'
import { nativeShell } from '@/platform/shell'

/**
 * The confirmations that are a feel as well as, or instead of, a sound. A
 * `SoundName` with no entry here — `send`, `error`, `palette`, `newMail` — has
 * no feel, and stays a plain `playSound` call at its own call site.
 */
export type CueName = 'complete' | 'sent' | 'defer'

/**
 * What each cue feels like on a phone. A completion is a tap. A send is the
 * system's success pattern, the one iOS reserves for "the thing you asked for
 * happened". Every one is a no-op off iOS.
 */
const FEEL: Record<CueName, () => void> = {
  complete: () => void nativeShell.impact('medium'),
  sent: () => void nativeShell.notify('success'),
  defer: () => void nativeShell.impact('medium'),
}

/**
 * The window each cue is held to. `defer` shares `complete`'s: `undefer` fans
 * out the way a bulk archive does and the Later sheet sends one mutation per
 * selected thread, so one gesture is one tap.
 */
const WINDOW_MS: Record<CueName, number> = {
  complete: RATE_LIMIT_MS.complete,
  sent: RATE_LIMIT_MS.sent,
  defer: RATE_LIMIT_MS.complete,
}

/**
 * The file a cue plays, or `null` for a soundless one. `defer` is soundless:
 * deferring is an intent rather than a completion (SOUNDS §2), and `complete`
 * is reserved for archive and trash.
 */
function soundFor(name: CueName): SoundName | null {
  return name === 'defer' ? null : name
}

/** Play and tap a cue, if the one policy says it may fire. */
export function cue(name: CueName): void {
  if (!rateLimit(name, WINDOW_MS[name])) return
  const sound = soundFor(name)
  if (sound) playSound(sound)
  // Captures are silent and still, and byte-comparable because of it.
  // `playSound` carries its own screenshot guard; the haptic needs this one.
  if (!isScreenshot) FEEL[name]()
}
