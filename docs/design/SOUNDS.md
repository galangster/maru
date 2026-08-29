# Wren — Interface Sounds

Status: sourcing complete, not yet implemented. Candidates live in
`src/assets/sounds/candidates/`; per-file license terms are in
`src/assets/sounds/LICENSES.md`. This document is the *why* and the
*which file*; it does not add any playback code.

Wren should sound the way it looks: cloud-soft, quiet, near-silent unless
you're listening for it. Nothing below should be audible across a room.

---

## 1. Sets sourced

| Set | License | Attribution | Character verdict |
|---|---|---|---|
| **uisfx** — `zen` feel (github.com/romainsimon/uisfx) | CC0 1.0 (audio) | Not required | Best fit. Purpose-built low, damped, short cues named exactly for our moments (`send`, `receive`, `complete`, `error`). This is the primary voice. |
| **uisfx** — `soft` feel | CC0 1.0 (audio) | Not required | Warmer and slightly longer than `zen`; four of its eight cues ran over 700ms and were dropped. Kept as a backup register, not the default. |
| **Octave** (github.com/scopegate/octave) | Free-for-any-use, no attribution required; may not resell/rehost the set itself | Not required | Hand-crafted iOS taps, 3ms–75ms. The only source with a genuinely *barely-there* tick (`tap-simple.aif`, 402 bytes). Too minimal to carry a "confirmation" alone, ideal for the command palette. |
| **Kenney — Interface Sounds** (kenney.nl) | CC0 1.0 | Not required (credit appreciated) | Competent and clean but reads as game UI — bright, slightly clicky. Kept as a fallback register for `send`/`confirm`, not first choice for a mail app. |
| **Kenney — UI Audio** (kenney.nl) | CC0 1.0 | Not required (credit appreciated) | Same family, thinner selection (clicks/rollovers only). Backup only. |
| **Google Material Design Sound Resources** (mirrored on archive.org, original material.io page now dead) | CC BY 4.0 | **Required if shipped** | Well-designed but built for phone-scale chimes: most of the notification/error/alert cues ran 730ms–1.6s, over budget, and were excluded. Only two short system-selection sounds survived the cut. |

Freesound.org was researched but not downloaded: individual sounds carry
mixed per-file licenses within the same pack and downloading requires an
account login, which fails the "verify on the source page, nothing behind a
login" bar. See LICENSES.md, "Considered but not downloaded."

---

## 2. Recommended mapping

| Moment | File | Why |
|---|---|---|
| **Send** | `candidates/uisfx-zen/send.mp3` (368ms) | Purpose-named cue in the calmest feel — a soft push, not a swoosh. Alt: `candidates/octave/slide-paper.aif` (64ms) for an even lighter paper-flick. |
| **Message sent confirmation** | `candidates/uisfx-zen/success.mp3` (571ms) | Sits right after send without doubling it — a settled low tone, not a chime. Alt: `candidates/kenney-interface-sounds/confirmation_001.ogg` (290ms) if `zen` reads too subtle in testing. |
| **New mail arrival** | `candidates/uisfx-zen/receive.mp3` (409ms) | Gentle, low, single-event — nothing like a phone ping. Alt: `candidates/kenney-interface-sounds/bong_001.ogg` (123ms), a single soft low bong, if `receive` feels too "notification-app." |
| **Archive / complete** | `candidates/uisfx-zen/complete.mp3` (637ms) | The Things-3 satisfying-tick target: a short two-part resolve, not a single click. Alt: `candidates/octave/tap-crisp.aif` (32ms) for a snappier, more percussive tick if `complete` reads too soft. |
| **Error** | `candidates/uisfx-zen/error.mp3` (481ms) | Low and short, states "no" without alarming. Alt: `candidates/octave/beep-rejected.aif` (75ms) for a lower, more muted register. |
| **Command palette open** | `candidates/octave/tap-simple.aif` (3ms) | Genuinely barely-there — shorter than a frame at 60fps, registers as texture more than sound. Alt: `candidates/uisfx-zen/select.mp3` (254ms) if silence-adjacent proves too subtle to confirm the palette opened. |

Every recommended file is CC0 or no-attribution-required. The Material Design
set (CC BY 4.0, attribution required) is not used in the primary mapping —
its two surviving short files (`navigation_forward-selection-minimal.ogg`,
`ui_tap-variant-01.ogg`) are documented as fallback options only, so shipping
without them means no attribution obligation reaches the About screen at all.
**If a future revision does pull in the Material Design files, the About
screen must carry:** "Notification sounds adapted from Material Design Sound
Resources by Google, licensed under CC BY 4.0."

---

## 3. Playback engineering notes (for the implementing lane)

**Preloading.** Decode all six mapped files once at startup via the Web
Audio API (`AudioContext.decodeAudioData`), not `<audio>` elements — avoids
per-play decode latency and lets every sound share one `AudioContext`. Keep
the decoded `AudioBuffer`s in memory; total mapped-set payload is under 30KB,
trivial to hold resident for the process lifetime.

**Gain staging.** Every sound must sit well below system alert volume so it
reads as texture, not notification. Route each play through a single master
`GainNode` at a conservative default (start near -18dB to -14dB relative to
the source peak, tune by ear against a real inbox) rather than trusting
source-file loudness — the six files come from three different creators with
three different mastering levels and will not match each other at unity gain.

**Debounce / frequency guards.** `src/core/sync/engine.ts` already gives most
of this for free:
- `newMail` events are emitted only from `applyHistory()`, called by
  `incrementalSync()`. `incrementalSync()` calls `fullBackfill()` instead
  and returns *before* ever calling `applyHistory()` when there's no stored
  `historyId` yet — so **"never during the first sync" is already true of
  the event source**, not something the sound layer has to re-derive.
- What the sound layer does still need to add: `applyHistory()` emits one
  `newMail` event *per new thread*, so a 5-message batch fires 5 events
  today (consumed today by `src/features/notifications/use-notifications.ts`,
  which reacts per-event for OS toasts). The arrival sound must coalesce
  these — play at most once per `applyHistory()` pass, and no more than
  once per rolling 30 seconds even across separate incremental-sync passes,
  so a burst of mail doesn't turn into a drumroll.
- Mirror the existing notification hook's other guard: never play while
  `document.hasFocus()` is false is *wrong* for sound (that's the opposite
  case for OS toasts) — instead, never play the arrival sound while the
  window is unfocused *and* an OS notification is also about to fire for
  the same event, to avoid a double-alert; and never play any interface
  sound during `isScreenshot` capture mode, matching the existing guard in
  that same file.

**Settings toggle.** One switch, "Interface sounds," in Settings. **Default
recommendation: off.** Things 3's sounds default on because completions are
rare, user-initiated, and each one is a small reward; Wren's most frequent
sound — new mail arrival — is unsolicited, can fire many times an hour, and
Wren is read in meetings, open offices, and shared spaces far more often
than a task manager is. Ship it excellent and opt-in; let people turn it on
once they've seen it's tasteful, rather than asking everyone to opt out of
something that surprised them once in a quiet room.

---

## 4. What could not be sourced openly

Nothing in the openly-licensed pool matches Google's own "Alerts and
Notifications" register for an arrival chime that (a) reads as
gentle/non-startling the way Material's `notification_ambient` or
`alarm_gentle` do, and (b) also stays under ~700ms — Material's own short
`notification_simple-01` still ran 817ms, and everything shorter in that
folder trades gentleness for a flatter, more clicky system-selection tone.
Rather than stretch the ~700ms ceiling to justify using Material's actual
arrival chimes (which would also pull in the CC BY attribution obligation
for a file we're not fully confident in), the recommended arrival sound
(`uisfx-zen/receive.mp3`) is a synthesized cue tuned for the same brief, not
a "real chime" shortened to fit. If the implementing lane listens to the
current mapping and finds arrival still doesn't feel distinct enough from
`complete`, that is the honest gap: no open-source set here nails a chime
that is simultaneously warm, arrival-specific, and under 700ms, and the
right next step is a short custom-recorded/synthesized cue rather than
another open-source search.
