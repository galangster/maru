# Autonomous run 5 — coral brand, motion, narrow panes, multi-device brief

Standing order: memory `wren-autonomous-standing-order`. Nick went to bed
mid-run with: "work autonomously on getting the app visually up to par
with production level quality" + the multi-device questions.

## Shipped this session (all pushed to galangster/maru main)

Path work (earlier in the session): ImprovMX mail routing live
(support@/security@getmaru.app deliver), production quota monitoring on
maru-mail-prod (`ops/google-oauth/monitoring/apply.sh`), dossier down to
9 legitimately-gated placeholders, getmaru.app/status live, 0.1.1 signed
build in /Applications with the official client id, link-click bug
root-caused and fixed (WebKit sandbox listeners), Remotion demo scaffold
+ capture rig ready, five seed emails sent to galangsterr@gmail.com.

Visual/product work (the overnight mandate):

- **Coral brand system** — accent = logo hue (dark lands on the logo
  colour itself; light is Nick's #F08080 reference darkened only to the
  white-text floor). Warm neutrals, gold star, semantic icon fills
  (inbox coral / star gold / sent blue / trash red), colored toolbar
  hovers.
- **The wren marks** — cloud replaced by the perched wren (pupil follows
  the cursor); inbox zero celebrates with the wren in flight (bob loop,
  reduced-motion safe).
- **Photos** — image attachments render as photographs (thumb grid +
  shared-element lightbox morph); HEIC/TIFF keep the chip.
- **Message paper** — real padding, warm ink, zoom-to-fit for
  fixed-width newsletters (no more mid-word clipping in narrow panes).
- **Sidebar** — accounts fold into one ACCOUNTS group (animated,
  inert-when-folded); unread count pops on rise only.
- **Narrow-pane rig** — `scripts/narrow-audit.mjs` captures the real
  extremes (940px window floor, panes at min) to docs/captures/narrow/;
  ReplyBar is a @container (labels never wrap; keycaps yield <30rem).
- **Full capture sweep** — all 15 frames regenerated on the new brand,
  reviewed, zero defects open.

Every substantive diff ran /simplify (two agents); all findings applied
or recorded. 477 tests + tsc green at every commit.

## Multi-device (Nick's question, answered)

`docs/research/multi-device-strategy.md`: hosted sync is already map 4's
paid product (grill 3); sync carries Maru state only (never tokens or
mail — Gmail syncs the mail), keeping the verification story intact.
iOS = map 5 via Tauri, riding map 4's Gmail-watch push relay. Queue has
the ratification item.

## Environment facts

- Local checkout `~/Projects/wren`; pushes need `gh auth switch -u
  galangster` (switch back to NickMetaDAO after).
- /Applications/Maru.app = 0.1.1 signed, official client id, link fix —
  but now BEHIND main (coral brand + photos + motion not in it).
  **Rebuild before recording**: `WREN_OFFICIAL_GOOGLE_CLIENT_ID=<id>
  APPLE_SIGNING_IDENTITY="Developer ID Application: The Creative Co.
  Marketing Firm LLC (2M8UE59WH7)" ./scripts/release-macos.sh` — local
  only; CI signing secrets are absent by decision-pending (queue).
  The binary inside Maru.app is named `wren` — pkill by path, not name.
- Dev demo: preview server on 1420, `?demo=1`; audit rigs are
  `scripts/narrow-audit.mjs` and `scripts/screenshot.mjs`.
- galangsterr@gmail.com: demo account, signed into Maru (green), seeded
  with 5 emails; IAM owner invite NOT yet granted (classifier blocked;
  steps in queue).

## Ordered next actions

1. **Nick's morning read**: the coral light accent (his reference
   applied), the queue's multi-device ratification, and a play with the
   morph/fold/pop + photo lightbox.
2. **Freeze + rebuild** 0.1.1 with the brand (command above), reinstall,
   quick smoke (bodies render, links open, photos morph).
3. **Recording prep in Maru**: star the Acme invoice, reply once from
   galangsterr on the lunch thread; then the 20-minute session per
   demo/RECORDING-RUNBOOK.md (Nick: three consent clicks).
4. Render, upload (Nick), fill the demo-link dossier line.
5. **Verification submission** (Nick clicks submit).
6. Queue leftovers any time: second-owner IAM grant, re-auth the three
   red accounts, CI signing secrets decision, billing gate.

## Open owner gates

All in wayfinder/NICK-QUEUE.md — nothing new since the queue update at
commit time. No surface mid-mutation; working tree clean at push.

## Addendum — the character arc (later that night)

Nick delivered canonical Maru art mid-run (character sheet with bio,
turnaround, palette #FF4F87 family, plus perched/flight/preen
references). Everything traced and shipped — see P13 for the state:

- `docs/design/wren-character/` — canonical sheet, references, traced
  paths, the tracer.
- Design canvas (link in P13) — canonical sheet as hero board, traced
  working boards below.
- **In-app rig v1** (`src/components/wren-figure.tsx` +
  `src/assets/wren-poses.ts`): perched Maru breathes/blinks/gazes in
  empty states; the real flight pose flies at inbox zero.

P13 v2 wants: five-beat inbox-zero sequence with DialKit, perk +
ruffle art, turnaround traces. The freeze-candidate rebuild now also
carries the character — the demo video's empty states star Maru.

Also this stretch: multi-device strategy brief (queue has the
ratification item), narrow-pane rig + zoom-to-fit mail, the accounts
group, motion pass, photo lightbox morph. All in the commit log
between 79a2491 and fac5eb2.
