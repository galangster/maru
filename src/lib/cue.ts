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
 * What each cue feels like on a phone. A completion is a tap. A send is the
 * system's success pattern, the one iOS reserves for "the thing you asked for
 * happened". Every one is a no-op off iOS.
 *
 * The cues with no entry — `send`, `error`, `palette`, `newMail` — have no
 * feel, and stay plain `playSound` calls at their own call sites.
 */
const FEEL: Partial<Record<SoundName, () => void>> = {
  complete: () => void nativeShell.impact('medium'),
  sent: () => void nativeShell.notify('success'),
}

/** Play and tap a cue, if the one policy says it may fire. */
export function cue(name: SoundName): void {
  // Captures are silent and still, and byte-comparable because of it.
  if (isScreenshot) return
  if (!rateLimit(name, RATE_LIMIT_MS[name])) return
  playSound(name)
  FEEL[name]?.()
}
