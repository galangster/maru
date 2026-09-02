# Nick's queue — owner-only actions

Standing order 2026-08-30: the agent works the map autonomously and
parks anything only Nick can do here, with exact steps, instead of
asking in chat. Newest at the top of each section. Strike items done.

## Map 4 and map 5 — the account and the phone (added 2026-09-01)

Grill 4 is recorded in `GRILL-4-AGENDA.md`; the audit in `AUDIT-2026-09-01.md`.
Three lanes are building the service, the desktop account and the iPhone app.
These are the buttons only you can press, in the order they unblock work.

1. **Stripe** (A3). Create the Stripe account under The Creative Co.
   Marketing Firm LLC, turn on two-factor, then run
   `cd server && STRIPE_SECRET_KEY=sk_live_… npm run stripe:setup` — it
   prints four env lines. Paste them into the Railway service. Add a
   webhook endpoint `https://sync.getmaru.app/v1/billing/webhook` for the
   six events listed in `docs/spec/MARU-ACCOUNT.md` §12 and paste its signing
   secret. Turn on Stripe Tax; register where Stripe says you must.
   **Price is set: $5/month, $50/year, 14-day trial.** Say so if you want
   it moved before a stranger sees it.
2. **The domain** (A5). At GoDaddy add two records, then nothing else:
   - CNAME, name `sync`, value `71w6pmej.up.railway.app`
   - TXT, name `_railway-verify.sync`, value
     `railway-verify=59aaf0a4962154688765b78d7e0065f31842840af28a616cf3a73dde3bafece0`
   Railway issues the certificate when it sees them. Until then the beta
   uses `https://sync-production-c0b0.up.railway.app`.
3. **Google Cloud, three items** (A4, I3), all in `maru-mail-prod`:
   - Pub/Sub → Create topic `gmail-push`. On the topic, grant
     `gmail-api-push@system.gserviceaccount.com` the role Pub/Sub Publisher.
   - Create a push subscription on it: endpoint
     `https://sync.getmaru.app/v1/push/gmail`, "Enable authentication" with a
     new service account `maru-push`, audience `maru-sync`. Tell me the
     service account email.
   - Credentials → Create OAuth client → type **iOS**, bundle
     `app.getmaru.ios`. Tell me the client id. **The phone side is built
     and proven** (2026-09-01): the id becomes
     `VITE_MARU_IOS_GOOGLE_CLIENT_ID` at build time and Gmail sign-in on
     the iPhone turns on; nothing else changes.
4. **Apple, two items** (A4, I6): Certificates → Keys → create an APNs key
   for team 2M8UE59WH7 and give me the `.p8` and its key id (put the file in
   `ops/apple/` locally, never in git); in App Store Connect create the app
   `Maru` with bundle `app.getmaru.ios` and a TestFlight internal group with
   your iPhone.
5. **Two accounts for App Review** (I6): a fresh Google account with two or
   three seed threads, and its Maru account (I comp it). Both need a phone
   number for signup, which is why they are yours.
6. **A lawyer's read** (A6) of `site/privacy.html` and `site/terms.html`
   once the drafts land. Until then they say "draft" in the footer.
7. **Decide A9**: should Later sync across devices inside the encrypted
   vault? My recommendation is yes; the reasoning is in the ticket.
8. **Second operator** (A8): the IAM item below still stands, and now also
   Railway (invite as member) and the registrar.
9. **VoiceOver on a real iPhone** (I2). The simulator's Accessibility
   Inspector never completes its audit against the Tauri WebView, so the
   phone's labels and focus order were verified from source and by touch
   only. Ten minutes with VoiceOver on your iPhone (inbox, a thread, compose,
   Settings → Maru account) once TestFlight exists; note anything unlabeled.
10. **Which devices are in the beta** (Q24): I assumed one iPhone and this
   Mac. Tell me if there is a Windows machine or a second Mac.

## Blocking the submission path

1. **getmaru.app is the domain** (renamed Wren → Maru, 2026-08-30;
   you already own it — no purchase). Your buttons now:
   - ~~DNS + site~~ — done 2026-08-30: https://getmaru.app live on
     GitHub Pages, cert issued, HTTPS enforced. Old Vercel site off the
     domain.
   - ~~Mail routing~~ — done 2026-08-30: ImprovMX active on getmaru.app
     (MX + SPF at GoDaddy verified), catch-all forwards to your Gmail, so
     support@ and security@ both deliver.
   - ~~Rename the GitHub repo~~ — done 2026-08-30 (galangster/maru;
     old maru project moved to maru-legacy).
   - ~~Publish `maru-mcp`~~ — done 2026-08-30, verified cold from the
     registry; wren-mcp deprecated with a pointer.
   - Consent screen name is **"Maru Mail"** when you reach the console.
   - The trademark/name-collision check matters more for "Maru" than it
     did for Wren — busier name.
2. ~~Create the production Google Cloud project~~ — done 2026-08-30:
   `maru-mail-prod`, Gmail API on, External, one Desktop client,
   `gmail.modify` only. Still open from this item, needs you in the
   console (agent won't change account config unattended):
   - **Second durable owner** in IAM — you named galangsterr@gmail.com
     (2026-08-30) but the grant was skipped when the permission classifier
     blocked the form fill. IAM → Grant access → principal
     `galangsterr@gmail.com` → role Basic/Owner → Save, then accept the
     invite from that account. Verify the double-r spelling first.
   - ~~Quota dashboards + alerts~~ — done 2026-08-30 via
     `ops/google-oauth/monitoring/apply.sh`: dashboard + 7 policies →
     support@getmaru.app. Recorded in ops/google-oauth/QUOTA.md. Still
     open there: log-based project-state-change alerts, dashboard
     screenshot + first alert-fire record at submission time.
   - **Billing decision** (moved to Non-blocking below).
3. ~~Consent screen~~ — done 2026-08-30: "Maru Mail", In production,
   getmaru.app branding + authorized domain. **Brand verification
   (plan §5) still pending** — runs inside the verification submission.
4. ~~Inject the official client id~~ — done 2026-08-30: repo variable
   `WREN_OFFICIAL_GOOGLE_CLIENT_ID` on galangster/maru; release
   workflow fails without it.
5. **THE FREEZE IS SUPERSEDED — do not record against the installed
   build.** The 0.1.1 you froze this morning (main @ 8e6beb6) is signed,
   notarized and installed at /Applications/Maru.app, but you then asked
   for the empty-state, character-motion and chrome changes, so the
   installed binary no longer matches main. **Re-run the release command
   after the visual pass lands**, then the hand-smoke below, then the
   sitting. Everything else in this item still stands.

   NO AGENT WORK IS OUTSTANDING. The list card landed (2026-08-31): the
   inbox pane is now a card on the ground like the sidebar. The thread
   pane is deliberately NOT one — it IS the ground the cards float on,
   and rounding it would delete the ~610px field that stops the channel
   reading as a crack, besides putting white paper inside a white
   message card inside a white pane. If you see it and still want the
   thread pane rounded, that is a separate decision with its own
   review; the fallback is priced in the design pass.

   YOUR HAND-CHECKS, in order, before the sitting:
   - **Four native checks no capture can make**, now load-bearing
     because the titlebar row was deleted: drag the window by the list
     header's blank area, by the reading header's blank area, and by
     the sidebar's traffic-light band; double-click each to zoom; then
     enter and exit fullscreen and confirm the lights carry over. If
     any fail, the drag regions are wrong — better known before a
     20-minute sitting than during one.
   - Open any thread (body renders), click one link (opens in Arc),
     open the weekend-photos thread and click a thumbnail (lightbox
     morph), watch the empty state (Maru breathes, blinks, and now
     shrugs a wing / shifts weight on a slow clock).
   - **Check the seed emails are still in the inbox** — the unified
     inbox showed only 2 real threads at smoke time, none of the 5
     seeds from SEED-EMAILS.md. If earlier testing archived them,
     re-seed per demo/SEED-EMAILS.md before recording.
   - Recording prep: star "Invoice #1042 from Acme Design", send one
     short reply from galangsterr on the "Team lunch Thursday?" thread.
   Then the ~20-minute sitting per demo/RECORDING-RUNBOOK.md.

   THE ONE DECISION THE RECORDING BAKES IN is the colour anchor (P14,
   below). Whatever is on screen when you record ships in the demo
   video, and you have already said the three colour systems do not
   agree. Every other queued decision can wait; that one cannot be
   undone cheaply.

   Freeze build facts, for the record (main @ 8e6beb6, coral brand +
   Maru character + link fix): signed, notarized Accepted, stapled, all
   three Gatekeeper checks passed, installed and launching. Rebuild
   command is in the handoff's Environment facts.

6. **Demo video captures** — the Remotion scaffold is built (`demo/`,
   2026-08-30) with the full 10-shot list, captions, and placeholder
   slots. Your part: record the clips of the final signed build —
   especially the three consent flows (account addition, Google
   consent screen, agent-session consent), each ONE continuous
   unedited capture with the address bar visible. Drop files in
   `demo/public/captures/<shot-id>.mp4` per `demo/README.md`; the
   agent wires durations and renders.

## Dossier placeholders

The submission dossier is written (`docs/security/`, `ops/google-oauth/`).
Every field only you can fill is marked `«NICK: …»` — grep for it.
Concentrations: verification-answers (project id, client id, trademark
receipt, frozen release, demo package), QUOTA (dashboards + alerts),
CONTACTS (roster), INCIDENT (second owner), REVERIFICATION (calendar).

## Publishing a release — DONE for 0.1.8 (2026-09-01)

v0.1.8 is on GitHub with the DMG, tarball, `.sig` and `latest.json`;
`releases/latest` and the updater endpoint both report 0.1.8, so the site's
download button and every installed copy are current. Your part: hand-smoke
the Windows installer once CI attaches it, and update the dossier's frozen
build fields to 0.1.8. The checklist below stays as the procedure.

## Publishing a release — the checklist (procedure)

**The website's download button is seven versions stale, and the auto-updater
is confidently wrong.** Verified 2026-08-31:

- `site/index.html` links to `/releases/latest`, which 302s to **v0.1.0**
  (2026-08-30). Its assets are still named `Wren`. So anyone downloading from
  getmaru.app today gets the build from before the missing-mail fix, before the
  dead Show button was fixed, and before P18/P19/P20.
- 0.1.1 through 0.1.7 were **never published as GitHub Releases**. Those DMGs
  exist only on this Mac.
- `latest.json` at that endpoint returns HTTP 200 and is the **0.1.0**
  manifest. Every installed copy polls it, sees a version older than itself,
  and correctly concludes there is nothing to do. It will never offer an
  update, and it fails silently by design (`announceNoUpdate: false` on
  launch, `src/lib/updates.ts`).

The site's TEXT does update on its own — Pages deploys from `main` via
`.github/workflows/pages.yml`, so prose fixes go live on push. Only the
artifacts are stale.

**Recommendation: publish once, at the freeze, with the exact build the demo is
recorded against** — so the video, the dossier's "frozen reviewer build", the
download and the updater manifest all name one version. Publishing mid-flight
means doing it again tomorrow.

### The checklist, in order. Half of it is easy to forget.

1. `./scripts/release-macos.sh` with `APPLE_SIGNING_IDENTITY` set. It signs,
   notarizes, staples, re-verifies with Apple's own tools, and writes
   `latest.json` with the platform key **read off the binary**.
2. Run `.github/workflows/windows-build.yml` (workflow_dispatch or a `v*` tag).
   v0.1.0 carries an `.exe` and an `.msi`; without them the site's "Windows
   preview available" line goes stale the same way the download did.
3. `gh release create v<version>` and upload **four** macOS files:
   the `.dmg`, `Maru.app.tar.gz`, `Maru.app.tar.gz.sig`, **and `latest.json`**.
   The `.sig` and `latest.json` are the two that get forgotten, and without
   either the auto-updater stays pointed at whatever came before.
4. Confirm the redirect actually moved:
   `curl -sI https://github.com/galangster/maru/releases/latest` should now
   name the new tag, and
   `curl -sL .../releases/latest/download/latest.json` should report the new
   version.
5. Only then update the dossier's frozen-build fields and record the demo.

**Do not publish a release whose `latest.json` names a version you did not also
upload a tarball for.** That is the one failure mode that breaks working
installs rather than merely failing to help them.

## Decisions to ratify

- **Should a reply wake a deferred thread early?** (P21, save-for-later.) You
  save a thread until Monday. On Saturday someone replies to it. Does it come
  back now, or stay away until Monday?
  My judgement is **yes, wake it** — hiding a live conversation you are party
  to is worse than an early return, and it is one line in a set the history
  sync already computes. But it will occasionally read as a bug ("I said
  Monday"), so it is a taste call and it is yours.
  **BUILT AS YES, 2026-09-01, on your instruction to assume it.** It is one
  line in `src/core/sync/engine.ts` (`applyHistory`, the `clearDeferral` call)
  plus one test in `tests/later.test.ts` named "wakes a deferred thread when a
  reply lands". Deleting both restores "Monday means Monday" and nothing else
  in the feature moves. Say the word if you want it flipped after using it.

- **Run this and tell me the three numbers** (P21 lane 2, the swipe gesture).
  Ten seconds, and it decides whether the gesture is built at all.
  **Now the only thing standing between Later and the swipe: lane 1 shipped
  2026-09-01, so the gesture is the whole of what is left in P21.** Later is
  complete without it — `h`/`b`, the hover-cluster button and the palette are
  all live, and the keyboard path is strictly more capable than the gesture
  could be. In a
  `npm run tauri dev` window, open devtools and paste:
  ```js
  window.addEventListener('wheel', e => console.log(e.deltaX.toFixed(1), e.deltaY.toFixed(1), e.deltaMode, Math.round(performance.now())), {passive: true})
  ```
  Then over a thread row: a slow two-finger swipe right, a fast flick right,
  and a normal vertical scroll. I need (1) does non-zero `deltaX` arrive at
  all, (2) is `deltaMode` 0, and (3) after your fingers lift, how many events
  keep arriving and how fast does `|deltaX|` decay.
  Why it cannot be answered from the code: **WebKit exposes no gesture phase to
  JavaScript.** Apple Mail's swipe reads a native NSEvent that knows when your
  fingers leave the trackpad; the web has no equivalent, and macOS keeps
  sending decaying momentum events that are indistinguishable from real
  movement. Any web implementation is a heuristic, and answer (3) is what says
  whether the heuristic is safe on your hardware. If `deltaX` never arrives the
  gesture is simply dead — and Later is complete without it either way.


- **The shell card is now less rounded than the cards inside it**
  (pre-freeze sweep, 2026-08-31). You ruled the shell corner to 12
  ("this looks bad visually" at 18, then "no padding/margin" at flush),
  and 12 is what shipped. But message cards in the reading pane are
  still `rounded-lg` (14) and were never part of that decision — so a
  four-inch-tall shell card is now *less* rounded than the small cards
  floating on it, which inverts the usual hierarchy. Three options:
  bring message cards down to 12 or 10 so the shell is the roundest
  thing; leave it (you may simply like it); or revisit the shell.
  I did not touch it because you ruled on that number twice and the
  message cards were not in front of you either time.

  ~~Related: three code comments and DIRECTION §6 still derive everything
  from the old 18.~~ **DONE 2026-09-01** — all four now state the shipped
  12 and say plainly that the concentric derivation no longer holds
  (12 − 8 = 4 against a 10 px row), that the rows were left alone on
  purpose, and that the inversion is YOUR open decision rather than a
  settled rule. Nobody will read 18 as current now. The decision itself is
  untouched and still yours.

- **Accent-coloured text on the ground measures 4.31:1** (pre-freeze
  sweep, 2026-08-31 — computed OKLCH → sRGB → WCAG, not estimated).
  `--wren-accent` #C04C5F on `--wren-surface-base` #F6F4F3 is below the
  4.5 floor. On white surface it is 4.73, which is fine and is what the
  P14 ticket verified — the ground is the case nobody measured, and the
  reading region IS the ground. Nothing ships accent-as-body-text there
  today, so this is a latent trap rather than a live defect. Your call:
  darken the light accent slightly (costs a little of the coral you
  picked), forbid accent text on the ground in DIRECTION, or accept it
  as decorative-only. ~~Separately and regardless: DIRECTION §3's
  contrast table still certifies an indigo accent on a hue-286 neutral
  ramp — a palette that no longer exists in the build — so the one
  document anyone would check a colour against is currently wrong.~~

  **DIRECTION §3 corrected 2026-09-01.** Rewritten against the shipped
  tokens, with every ratio re-measured rather than re-typed. The tool
  that did it is `scripts/contrast-audit.mjs` (`npm run contrast`); it
  reads `src/styles/tokens.css` directly, so the table cannot go stale
  again without the script saying so, and `npm run contrast:check` exits
  non-zero on a regression. **It exits non-zero today, on this one
  number and nothing else.**

  The full measured picture, so your decision has all of it:
  - **4.31 confirmed independently**, and it is the ONLY failure in
    either theme. Light accent is 4.73 on `surface`, 4.31 on the ground.
  - Every text tier, both themes, every surface it may sit on: passes.
  - All eight hue inks pass on both surface and ground; yellow on the
    ground is tightest at 4.64, so it is the one to re-check first if
    the ground ever lightens.
  - `accent-fg` on `accent` is 4.73 light / 8.11 dark. The dark
    accent-fg is near-black rather than white, so primary buttons are
    fine in both themes — worth knowing, because assuming white there
    reports a 2.39 failure that does not exist.
  - Nothing clips out of sRGB gamut, so DIRECTION's in-gamut claim
    holds for the new palette too.

- **Should a dev build share your real mail database?** (surfaced
  2026-08-31 by "none of the emails are syncing"; ticket P18 shipped the
  UI half.) What happened: dev and release builds use different keychain
  services on purpose — a differently-signed dev build is a stranger to
  the last one's keychain items, which is what caused the old
  password-prompt storms — but they share ONE bundle identifier and
  therefore ONE database. So a dev window reads your four real accounts
  out of a keychain holding none of their tokens, and mail silently stops
  until you notice. Yours had stopped at 11:01 and you found it at 13:52.
  The app now says so plainly instead of "Sync failed", and that may be
  enough. The three options:
  **(a) leave it** — the dev build reads your real mail, cannot sync or
  send, and now says exactly that. Best for design work, which is what we
  have been doing all week: real threads, real names, real density.
  **(b) give the dev build its own database** — full isolation, no way to
  confuse the two, and you lose real data in the dev window (demo mode
  substitutes, but it is 20 synthetic threads, not 3,607).
  **(c) let the dev build refuse to start** against a database whose
  accounts it has no credentials for. Safest, and it removes the one
  workflow — reading real mail while iterating on the UI — that made (a)
  worth having.
  Recommend **(a)**, now that the app is honest about it. Only worth
  revisiting if you get caught by this a second time.

- ~~**Unified sign-in — (a) or (b)?**~~ — ruled 2026-08-31: **(b)**,
  "yeah i like b". The tokens sync; one sign-in brings the mail with it.
  Maru becomes a custodian. Recorded in full in G2, including the four
  public claims it makes false and the prerequisites it creates.
  **The address-list half SHIPPED 2026-09-01** (you asked "are we able to do
  the sync login thing now?"). Export from one Mac, paste into another, and
  the second one now knows which addresses to sign in to and walks them one
  directed consent at a time — Google pre-selects each address and the flow
  refuses tokens that come back for a different mailbox. No server, no token,
  no decision needed. The vault itself is still map 4 and still gated; G2's
  build log says exactly what shipped and what did not.

  **Two things now need you, and the first is time-sensitive:**
  1. **Add the restricted-data question to the Google submission while it
     is open.** The repo has never held a Google sentence on whether a
     stored refresh token counts as restricted data. Under (a) that was
     optional; under (b) it is load-bearing, and asking inside an open
     review is far cheaper than shipping a vault and finding out through
     enforcement. The dossier already carries one open question — this
     goes beside it.
  2. **Decide whether the submission discloses the roadmap.** If Google
     approves a dossier describing local-only tokens and the vault ships
     after, that is a material change to what was reviewed. Disclose now,
     or plan a re-review. Your call which.
  Not urgent, but now on map 4's critical path rather than map 3's polish
  list: **P2 signed and reproducible builds**. A client-side-encrypted
  vault is only as good as the claim that the client you run is the client
  whose source you can read — and one person ships both the client and the
  server here.

- **Book a Wayfinder + grill for the AGENT GATEKEEPER** (your ask,
  2026-08-31; ticket G3-agent-gatekeeper). The idea is good and the
  ticket is written, but it needs you in a session rather than an agent
  building it, because it collides with the one sentence the whole
  verification dossier rests on: judging whether a message is
  "interesting enough" is an LLM call, and that means either a weak
  local model or mail CONTENT leaving the machine. G2 resolved the
  server question for settings by making the server the business;
  content is a much bigger step than settings.
  Two more things to grill: a gatekeeper's mistakes are invisible by
  construction (you cannot notice mail you were never shown), and
  auto-unsubscribing is an outbound ACTION in an app whose pitch is that
  you approve every send. Not before the Google submission.

- **Menu-bar quick actions — sign off on the list** (your ask,
  2026-08-31; ticket P17-menu-bar-residency). Staying resident when the
  window closes is unambiguous and needs nothing from you. The menu
  contents do: proposed, in value order — the icon carries the unread
  count, quick compose (with a global hotkey, the highest-value one),
  approve/reject a waiting agent send inline, pause mail for an hour,
  and a 3-5 item unread peek with inline archive. Explicitly rejected
  as redundant: search (the palette owns it), folder navigation,
  settings, and any full thread list or body reading. Tell me if the
  peek list is one step too far, or if something is missing.

- **Remembering "Show images" per sender** (from the P16 investigation,
  2026-08-31). Today allow-images is scoped to a thread AND to the
  session, so a newsletter you read daily is blocked again every time
  and you re-click Show every time — quite possibly part of what
  "still" meant. Options: keep it as-is (max privacy), remember per
  sender for the session, or persist a per-sender allowlist. This is a
  privacy-posture call, not a bug fix, so it is yours.

  **The defects are done — this question is all that is left of P16.**
  The ~350px void, the dead Show for CSS backgrounds and the
  tracking-pixel bypasses were fixed 2026-08-31 and verified in the
  running app 2026-09-01 (the Offhours fixture measures 428px where the
  hole made it 970). Three more defects in the same code were found and
  fixed on the way out; P16 is closed with a full resolution. So if you
  still meet "this image blocking thing", it will be THIS — the same
  newsletter asking again every session — and the answer is your call
  between the three options above.

- **Notification badge default + the iOS payload shape** (your ask,
  2026-08-31; ticket P15-notification-badges). Modes drafted: unread in
  inbox (your default), everything in inbox, dot-only, off, plus
  approvals-waiting as an overlay, with per-account opt-in and quiet
  hours. Two things need you: (1) confirm the default, (2) ratify how
  iOS gets its number — **(b) the relay sends raw counts and the device
  applies your preference** (recommended: no preferences or mail counts
  on the server, keeps the verification story intact) versus (a) the
  relay computes the badge and therefore stores your settings. This
  decision constrains map 4's relay payload, so it is worth settling
  before that relay is built.

- ~~**The app icon**~~ — ruled 2026-09-01: **"yeah i like the salmon"**,
  so the mark is NOT being redrawn. Recorded so nobody regenerates it as a
  loose end. What it costs, measured: the icon's field is `#FFAB9E`
  (OKLCH L 0.82 C 0.10 **h 29**) and the interface accent is `#C04C5F`
  (**h 13**) — a 16° drift, the icon reading warmer and more orange than
  the app. If it ever bothers you, the cheap fix is rotating the field hue
  to 13 and leaving the bird alone; the expensive one is redrawing.

- ~~**Color anchor**~~ — decided 2026-08-31: option C, a shared parent
  hue of 13. The interface accent (both themes), the character and the
  contact shadow all now derive from it; contrast held at 4.73 white-on-
  accent. Shipped, ticket P14 closed. NOTE: the app ICON in
  src-tauri/icons/ was not regenerated — it is still the old salmon, so
  the dock icon and the in-app accent no longer match. That is the one
  loose end from this pass and it needs your call on whether to redraw
  the mark.

- **Multi-device sequence** (asked 2026-08-31, brief in
  docs/research/multi-device-strategy.md): map 4 = paid sync service
  (settings + audit doc, E2E, plus the Gmail-watch push relay), map 5 =
  iOS via Tauri riding that relay. Ratify the order, or reorder; and
  decide whether the map-4 grill waits for Google's review verdict.
  Until then, P5's settings export/import is the zero-server stopgap.

## The launch ceiling — surfaced 2026-09-01, because you asked about mass distribution

**One Google Cloud project is the constraint, not the app.** The arithmetic is
already in `docs/research/shared-client-implementation-plan.md` §7; it was
filed under "billing" and marked non-blocking, which undersells it. It is a
capacity ceiling, and one of the numbers cannot be raised at any price.

- **Daily threshold: 80,000,000 units per project, and Google does not raise
  it.** Not a billing tier — a wall.
- A cold first sync costs roughly **200,000 units**. That is about **400 new
  users per day**, before anyone reads anything.
- An idle account polling every minute costs ~2,880 units/day → about
  **27,700 continuously-open accounts** before any sync work at all.
- Minute quota is 1,200,000/project and Maru caps each account at 4,500 →
  about **266 accounts saturating at once**.

So "mass distribute" on the current single-client architecture means roughly
**a few hundred new installs a day**, not a launch spike. That is fine for a
real launch and fatal for a front-page one.

**Three mitigations, and their costs, so this is decided rather than
discovered:**

1. **Staged cohorts.** The cheapest and the one the plan already recommends —
   release in waves rather than opening the download to everyone at once.
   Costs nothing technically; costs launch drama.
2. **Cold-sync jitter.** The plan names it (§7 mitigation 3) and it is NOT
   built. I deliberately did not build it speculatively: it puts a permanent
   random delay on every first run to protect against a spike that may never
   come, and run 6 spent real effort making startup faster (P19). Worth
   building the week before a wide launch, not before.
3. **Shrink the cold sync.** 200,000 units is the 90-day window and body
   prefetch. Narrowing either raises the daily ceiling proportionally, and
   costs first-run richness.

**The other launch gate is not quota at all:** an unverified app has a
lifetime cap of **100 new authorizations** before Google disables new
sign-ins. Verification is a hard gate in front of ANY distribution, which is
what makes the open submission the critical path it already is.

**And the single point of failure worth knowing before you scale:** deleting
the shared OAuth client invalidates every token it ever issued, and a
replacement client does not repair them. Every install shares fate with that
one client id.

## Non-blocking

- **Re-test the 7-day re-auth path** against the production consent
  screen after the flip (P4 ticket, still open).
- **Billing exposure decision** for quota beyond the free tier (plan
  §7 launch math).

- **CI signing secrets decision** (found 2026-08-31: macos-release run
  33353074623 failed at codesign — the repo only has
  TAURI_SIGNING_PRIVATE_KEY; all Apple secrets are missing). Either
  export the Developer ID .p12 and set APPLE_CERTIFICATE,
  APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY + notarization
  creds via `gh secret set`, or keep signing local-only via
  scripts/release-macos.sh (worked for v0.1.0 and v0.1.1) and demote
  the workflow. Local-only is fine until releases need to happen off
  your machine.

## Hand-checks (need a human at the machine)

- ~~**`git push` needs your credential back**~~ — done 2026-08-31: you
  reconnected `gh` as **galangster**, and `a1391ee`/`7f9fdbb` pushed
  (`167ffcc..7f9fdbb`). Plain `git ls-remote` now authenticates too, so
  the osxkeychain entry is back and later pushes need nothing special.
  For the record, the failure was: the keychain held only a
  **NickMetaDAO** github.com entry, which gets `403 Permission to
  galangster/maru.git denied`, while the remote
  (`https://galangster@github.com/...`) pins the `galangster` username —
  so git asked for a credential the helper did not have and could not
  prompt for in a non-interactive shell.

- **Windows hand-smoke** of the v0.1.0 NSIS installer — after it,
  add windows-x86_64 to latest.json so auto-update covers Windows.
- **Fullscreen traffic lights** (P2's carried check) — verify the
  re-parented buttons in macOS fullscreen.
