# Maru Mail — verification demo video

Remotion project for the Google OAuth verification demo. Not part of the
app build (root `tsconfig.json` includes only `src` and `tests`; this
directory has its own `package.json`).

Source of truth for content: `docs/research/shared-client-implementation-plan.md`,
Part 1 §8 (shot list and rejection reasons) and Part 2 §8 (recording rules).

## Usage

```
cd demo
npm install
npm run studio    # preview with live reload
npm run render    # renders out/maru-demo.mp4
```

The shot list, captions, and per-shot durations live in `src/shots.ts`.
Each shot's `hasCapture` flag is `false` until its real capture exists;
those shots render a labeled placeholder slot, so the full composition
previews end to end before any recording happens.

## Capture rules (non-negotiable)

- Record only the **final signed build** — the exact version submitted
  for review. Do not record before build, site, scope, name, logo, and
  disclosures are frozen.
- Shots marked `consentFlow: true` (account addition, Google consent
  screen, agent-session consent) must each be **one continuous,
  unedited capture** — no cuts, speed changes, or cropping inside the
  clip. Editing happens only *between* flows, never within one.
- Keep identity evidence visible: browser address bar, the client id in
  the request URL, the app version. Captions render in a band below the
  capture so they never cover it.
- Consent screen must be in **English**.
- Show the privacy notice immediately before agent-session consent
  (shot 07 covers both in one take).
- Record account deletion and token removal (shot 10) — reviewers need
  the complete lifecycle.

## Adding a capture

1. Record the clip (screen capture, 16:9, ideally 1920×1080).
2. Drop it in `public/captures/` named after the shot id, e.g.
   `public/captures/03-consent-screen.mp4`.
3. In `src/shots.ts`, flip that shot's `hasCapture` to `true` and set
   `durationInFrames` to the clip's real length (`sec(<seconds>)`).
4. Before the final render, fill `APP_VERSION` in `src/shots.ts` with
   the frozen release version.

## Delivery

Render, then upload to an accessible YouTube (unlisted) or Google Drive
link — the link must stay accessible for the whole review. The link,
transcript, and this shot list go in the submission dossier
(`docs/research/shared-client-implementation-plan.md` §6).
