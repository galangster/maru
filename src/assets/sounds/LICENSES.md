# Sound candidate licenses

Every file under `candidates/` was downloaded as-is (no transcoding, trimming,
or normalization) from a source page that states its own license in text.
Nothing was pulled from a page whose license could not be confirmed on the
page itself. Total download: 6 sets, 33 files, ~198 KB.

One set requires attribution in-app if shipped — see **material-design-sound-resources**
below, flagged for the About screen.

---

## What actually ships: `active/`

`src/assets/sounds/active/` holds the six files SOUNDS.md §2 names as the
primary mapping, renamed to their moment. **Every one is CC0 or explicitly
no-attribution-required, so nothing here reaches the About screen.** The
Material Design set (CC BY 4.0) is not used.

| Shipped file | Source | License |
|---|---|---|
| `send.mp3` | `candidates/uisfx-zen/send.mp3` | CC0 1.0 |
| `sent.mp3` | `candidates/uisfx-zen/success.mp3` | CC0 1.0 |
| `new-mail.mp3` | `candidates/uisfx-zen/receive.mp3` | CC0 1.0 |
| `complete.mp3` | `candidates/uisfx-zen/complete.mp3` | CC0 1.0 |
| `error.mp3` | `candidates/uisfx-zen/error.mp3` | CC0 1.0 |
| `palette.wav` | `candidates/octave/tap-simple.aif`, **transcoded** | Octave, free-for-any-use, no attribution |

Five of the six are byte-identical copies of the candidate, renamed only.

### The one transcode: `palette.wav`

The Octave set ships AIFF, and AIFF is not a format either engine Wren targets
can be relied on to decode. `AudioContext.decodeAudioData` is backed by
CoreAudio in WKWebView, which takes AIFF, and by FFmpeg in Chromium/WebView2,
where AIFF is not among the formats Chromium documents as supported — so the
palette tick would have been silent on Windows and fine on macOS, which is the
worst kind of difference to ship. It was converted on macOS with:

```
afconvert -f WAVE -d LEI16 candidates/octave/tap-simple.aif active/palette.wav
```

Linear PCM, 1 ch, 44.1 kHz, 16-bit, 3.2 ms, 4.4 KB — WAVE is decodable on both
engines. No trimming, no normalization, no resampling: the samples are the
source's. Octave's licence permits use of individual sounds "in original or
modified form" inside an application; the one restriction is on selling,
hosting or renting the sound set itself, which this is not.

---

## uisfx-soft/ and uisfx-zen/

- **Source:** https://github.com/romainsimon/uisfx (site: https://uisfx.com/)
- **License file on source:** `packages/uisfx/LICENSE-AUDIO`
- **License:** CC0 1.0 Universal (public domain dedication) for all audio in `sounds/`.
  Verbatim: "The audio files in the `sounds/` directory are released under
  Creative Commons CC0 1.0 Universal Public Domain Dedication... Attribution
  is appreciated but not required." Code (the npm package/synthesis engine)
  is separately MIT-licensed; we only took rendered audio files, not code.
- **Attribution required:** No.
- **Files taken** (`packages/uisfx/sounds/<feel>/<cue>.mp3` on the source repo):
  - `uisfx-zen/send.mp3`, `success.mp3`, `complete.mp3`, `error.mp3`,
    `notification.mp3`, `receive.mp3`, `select.mp3`
  - `uisfx-soft/send.mp3`, `receive.mp3`, `select.mp3`, `press.mp3`
  - Note: `soft/error.mp3`, `soft/notification.mp3`, `soft/complete.mp3`,
    `soft/success.mp3` were fetched and measured but **excluded** — all ran
    714ms–977ms, over the ~700ms ceiling. The `zen` feel's versions of the
    same cues came in under 650ms and were kept instead.

## octave/

- **Source:** https://github.com/scopegate/octave (project page: http://raisedbeaches.com/octave)
- **License file on source:** `LICENSE.md` at repo root
- **License:** Free-for-any-use, no-attribution-required custom license.
  Verbatim: "You are free to use Octave (the 'sound set') or any part
  thereof (the 'sounds') in any personal, open-source or commercial work
  without obligation of payment (monetary or otherwise) or attribution."
  Attribution is "optional but appreciated." The one restriction: you may
  not sell, host, or rent the sound set itself, in original or modified
  form — using individual sounds inside an app (our case) is explicitly fine.
- **Attribution required:** No.
- **Author:** Fred Showell.
- **Files taken** (`Octave-Sounds/<category>/<name>.aif`):
  `tap-simple.aif`, `tap-crisp.aif`, `tap-resonant.aif`, `tap-mellow.aif`,
  `slide-paper.aif`, `beep-rejected.aif`, `beep-tapped.aif`

## kenney-interface-sounds/

- **Source:** https://kenney.nl/assets/interface-sounds
- **License file on source:** `License.txt` inside the downloaded zip (kept
  in this folder for reference)
- **License:** CC0 1.0 Universal. Verbatim: "This content is free to use in
  personal, educational and commercial projects. Support us by crediting
  Kenney or www.kenney.nl (this is not mandatory)."
- **Attribution required:** No (credit appreciated, not mandatory).
- **Files taken:** `confirmation_001.ogg`, `confirmation_002.ogg`,
  `confirmation_003.ogg`, `tick_001.ogg`, `tick_002.ogg`, `bong_001.ogg`,
  `error_001.ogg`, `error_003.ogg`, `glass_001.ogg`, `glass_003.ogg`,
  `pluck_001.ogg`, `select_003.ogg`

## kenney-ui-audio/

- **Source:** https://kenney.nl/assets/ui-audio
- **License file on source:** `License.txt` inside the downloaded zip (kept
  in this folder for reference)
- **License:** CC0 1.0 Universal. Verbatim: "You may use these assets in
  personal and commercial projects. Credit (Kenney or www.kenney.nl) would
  be nice but is not mandatory."
- **Attribution required:** No.
- **Files taken:** `click2.ogg`, `rollover1.ogg`

## material-design-sound-resources/

- **Source:** https://archive.org/details/material-design-sound-resources —
  an Internet Archive mirror of Google's original Material Design "Sound
  resources" download (the live material.io page that used to host this
  set is gone; this is the only intact copy of the actual files found).
  The archive item's own description field reproduces Google's original
  license text verbatim.
- **License:** CC BY 4.0. Verbatim (from the item's description field, via
  the Internet Archive metadata API, matching Google's original wording):
  "Available under CC-BY 4.0. By downloading these files, you agree to the
  Google Terms of Service." **Caution:** the archive.org page's own
  uploader-set `licenseurl` field is tagged CC BY-SA 4.0, which conflicts
  with the CC BY 4.0 stated in the description text. We treat the
  description text as authoritative because it reproduces Google's original
  copy, but flag the mismatch here rather than resolve it silently.
- **Attribution required: YES.** This is the one set that needs a credit
  line if shipped. Suggested text: "Notification sounds adapted from
  Material Design Sound Resources by Google, licensed under CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/)."
- **Files taken:** `navigation_forward-selection-minimal.ogg`,
  `ui_tap-variant-01.ogg`
- **Excluded from this set:** `notification_simple-01.ogg` (817ms),
  `notification_simple-02.ogg` (1.6s), `alert_error-01.ogg` (952ms), and
  `state-change_confirm-up.ogg` (730ms) were downloaded, measured, and then
  discarded — all over the ~700ms ceiling. Google's own "Alerts and
  Notifications" sounds in this set are built for phone-style chimes, not a
  barely-there desktop cue.

## Considered but not downloaded

- **freesound.org** (e.g. `GameAudio` "UI SFX" pack): individual sounds on
  Freesound carry per-file licenses (CC0/CC-BY/CC-BY-NC mixed within the
  same pack), and downloading requires a Freesound account login — both of
  which put it outside "verify the license on the source page itself,
  download nothing behind a login." Skipped rather than guessing.
