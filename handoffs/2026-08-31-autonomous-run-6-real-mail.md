# Handoff — 2026-08-31, run 6: the night real mail found the bugs

Baseline: `b3b9ec9` (start of session) → `fa25ed2`. **51 commits, all pushed** to
`galangster/maru` on `main`. Working tree clean. 577 tests pass. **0.1.7 is
installed at `/Applications/Maru.app` and running on Nick's four real accounts.**

Shipped versions this session: **0.1.1 → 0.1.7**, each signed, notarized,
stapled and Gatekeeper-verified, each installed to `/Applications/Maru.app`.

## The shape of the night

Nick used Maru on his own four accounts while the work ran, and that is what
made this session different from the previous five: **almost every defect below
was found by him using the app, not by an audit.** Two of them were mine from
the same day. The pattern worth carrying: an agent sweep finds classes of
problem, a person using the product for real finds the ones that matter.

## What was wrong, and is not now

**Mail was silently missing from the inbox.** `mapGmailThread` unioned every
message label onto the thread, `TRASH` included — so one deleted reply anywhere
in a conversation's history stamped TRASH on the whole thread, and every
non-trash view excludes TRASH. **58 threads across four accounts** were hidden.
Nick reported two; the count was the surprise. Migration 4 repairs what is
already stored, from the messages already stored, offline — because fixing the
mapping only helps a thread the next sync happens to touch, and a conversation
nobody replies to is never touched again.

**"Show" for blocked images was completely dead**, and P16 that morning had
made it worse rather than better. `wantsRemote = allowRemoteImages &&
blockedImages > 0` is unsatisfiable: every increment of the blocked count sits
inside a `!allowRemoteImages` guard, so clicking Show dropped it to zero, the
CSP stayed at `img-src data:`, and the sanitizer un-blocked the images while
the CSP re-blocked them in the same pass. 0.1.1 had no CSP at all, so images
did load there.

**The sidebar could not say which account had failed.** `useSyncStatus` is a
partial record filled only by events, so `.some(s => s.state === 'error')`
rendered "Up to date" for four accounts on one status — a positive claim about
three the app had heard nothing from. Now: `syncKind()` as one shared
discriminant, per-account sentences that name the address and the remedy, a
list-pane strip when mail has genuinely stopped, and a `noCredentials` state so
a machine that never held a token is not told Google signed it out.

**A link in an email could reload the app into another mode.** Relative hrefs
survived sanitization carrying `target="_top"`, and a srcdoc iframe resolves
those against the parent — so `<a href="?screenshot=1">` was a same-origin top
navigation the Rust guard allows. Closed in two layers.

**Sync waited 1.5–6.2s for the search index** before asking Google for
anything, on every launch, measured on Nick's real 3607-thread mailbox.

Also: the updater endpoint pointed at the pre-rename `galangster/wren`
(compiled into the binary, so no later version could repair it); `CSS_SIZING`
welded neighbouring declarations together in every minified newsletter;
`describeSync` reported "0 accounts · last synced just now" with no accounts;
`MissingOAuthClientError` read as a transient blip forever.

## Two more things landed after that

**A dev build now gets its own database** (`wren.dev.db`), with
`VITE_MARU_REAL_DB=1` as a deliberate opt-in. Nick delegated this one. The
argument that decided it: a dev build RUNS MIGRATIONS against real mail, and
two migrations were written that day — one of them a repair that rewrites label
rows across every thread. The keychain split already stopped a dev build
syncing or sending; it did nothing to stop it writing. It also closes the
shared agent registry, which the socket split could not reach. Verified by
running a dev build beside the installed app: `wren.db` kept its 4 accounts and
3,682 threads with its mtime unchanged.

**P21 is designed and not built** — see below.

## What changed on purpose

**Remote images load by default** (owner). `imagePolicy` was a dead setting —
declared, defaulted, exported by settings transfer, read by nothing. Now wired,
with a Settings switch. **Migration 5 removes the stored key rather than
overwriting it**, because every install that ever saved a setting carries a
literal `"imagePolicy":"block"` that beats the default; removing it keeps
`defaults.ts` the only copy, so the reversal cost really is one word.

The beacon drop was hoisted above both counters so a declared-tiny image is
dropped under both policies and counted by neither — which is what keeps the
CSP closed for a beacon-only body. Its honest scope is written into the code
and the copy: **complete** protection for a message with no pictures and one
hidden pixel, **none** for a message with a visible picture, because senders
stamp a per-recipient token on content images. Nothing says "blocks trackers".

**Maru's character got two homes.** The pink field is back on the reading pane
where the bird perches; the inbox-zero bird flies continuously in a bounded
feathered disc on a white card. The cruise bob was re-cut as a sampled sine
after Nick caught it dipping and jutting — loop-seam velocity mismatch went
0.138 → 0.000.

**G2 ruled (b): the tokens sync.** Maru becomes a custodian. Still map 4, still
after the submission — but it makes four public claims false on the day it
ships, and the restricted-data question to Google is now load-bearing rather
than optional.

## Read these before touching anything

- `wayfinder/NICK-QUEUE.md` — owner-only actions. The time-sensitive one is the
  refresh-token/restricted-data question, which belongs *inside* the open
  Google review.
- `wayfinder/tickets/P18-sync-legibility.md`, `P19`, `P20` — all closed, all
  carrying the reasoning for why each fix is shaped the way it is.
- `wayfinder/tickets/G2-cross-device-sync.md` — the (b) ruling and the four
  claims it invalidates.
- `docs/DECISIONS.md` Q14 — the image default, overturned in part, with the
  original decision left intact above it.

## Environment facts

- **Release**: `APPLE_SIGNING_IDENTITY="Developer ID Application: The Creative
  Co. Marketing Firm LLC (2M8UE59WH7)" ./scripts/release-macos.sh`. Notary key
  and updater key live in `~/.wren-release/`. All three verification checks run
  automatically.
- **The DMG step fails if a stale `dmg.*` volume is mounted.** `ls /Volumes/`
  first; `hdiutil detach -force` any leftovers.
- **`gh` keeps switching its active account to `NickMetaDAO`**, which cannot
  push to `galangster/maru`. It happened three times tonight.
  `gh auth switch --hostname github.com --user galangster` fixes it. Worth
  finding the cause.
- **Do not run `npx prettier` on this repo.** There is no config, so it
  reformats to its own defaults against house style. I did this once to
  `sanitize.ts` and had to restore and redo the edits by hand.
- The browser preview pane runs **hidden**, so `requestAnimationFrame` is
  throttled and animations freeze mid-frame. Motion cannot be judged there —
  use `?screenshot=1` for static layout and judge motion on the installed app.
- A cache-busting `import('/src/lib/sanitize.ts?v=…')` registers a **second**
  DOMPurify hook and measures the wrong module instance. Import without the
  query, on a freshly loaded page.

## P21 — Later and swipe, designed 2026-08-31, NOT built

`wayfinder/tickets/P21-later-and-swipe.md` holds the full spec. The three
things worth knowing before opening it:

1. **Local-only, own table, and the reason is the failure mode** — not privacy
   and not OAuth scope. A Gmail-label snooze removes INBOX at Google and needs
   a network write at wake time that only happens if this Mac runs; a laptop
   shut Monday to Friday hides mail on every device, past its time, with no
   timer anywhere to fix it. Local-only is a predicate evaluated at query time
   and cannot be missed. Label-based fails unsafe, local-only fails safe.
2. **It is called Later, not Snooze**, because Snooze is a cross-device promise
   everywhere else and this is one-device. Three permanent disclosure sites,
   deliberately not the toast.
3. **Two lanes, and lane 2 is gated on Nick's trackpad.** WebKit exposes no
   gesture phase to JavaScript, so a web swipe cannot know when fingers lift
   and is necessarily a heuristic. Lane 1 (Later) is complete without it, has
   three keyboard doors, and touches no Gmail method — so it does not disturb
   the open verification submission. **Start with lane 1.**

## Still open

**Owner decisions** (all in `NICK-QUEUE.md`, newest at the top): the ten-second
trackpad experiment that gates P21 lane 2; whether a reply should wake a
deferred thread early; the restricted-data question to Google; whether the
submission discloses the sync roadmap; the shell/message-card radius inversion;
accent-on-ground contrast at 4.31:1.

**Answered 2026-08-31, do not re-ask:** Maru does not ship for Intel (Apple
Silicon only, now stated at the download button). A dev build does not share
the real database. G2 is ruled (b) — the tokens sync.

**The website is seven versions stale and the auto-updater is confidently
wrong.** `NICK-QUEUE.md` carries the full release checklist. getmaru.app's
download button 302s to v0.1.0 with assets still named `Wren`, and
`latest.json` at that endpoint returns HTTP 200 with the 0.1.0 manifest — so
every installed copy polls it, sees a version older than itself, and correctly
does nothing, silently. The site's PROSE deploys from `main` on push; only the
artifacts are stale. Recommendation recorded: publish once, at the freeze, with
the build the demo is recorded against.

**Agent work with no gate**: P21 lane 1 (Later) is the obvious next build — it
is designed to the file-and-identifier level and needs no decision. P15
notification badges, P17 menu-bar residency and G3 the agent gatekeeper are all
queued behind owner sign-off.

**The submission is the actual critical path, and it runs through Nick**: the
IAM second-owner grant, four `«NICK: …»` dossier fields, and the ~20-minute
recording sitting. The re-seeding for that recording never happened — it needs
about two minutes of held focus and Nick was at the keyboard all evening.
