# Handoff — 2026-08-31, run 6: the night real mail found the bugs

Baseline: `b3b9ec9` (start of session) → `8b0acd9`. 49 commits. Every one is
pushed to `galangster/maru` on `main`.

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

## Still open

**Owner decisions** (all in `NICK-QUEUE.md`): the restricted-data question to
Google; whether the submission discloses the sync roadmap; does Maru ship for
Intel; should a dev build share the real database; the shell/message-card
radius inversion; accent-on-ground contrast at 4.31:1.

**Agent work with no gate**: the agent registry is still shared between dev and
release builds (the socket is split, the credentials are not). P15 notification
badges, P17 menu-bar residency and G3 the agent gatekeeper are all queued behind
owner sign-off.

**The submission is the actual critical path, and it runs through Nick**: the
IAM second-owner grant, four `«NICK: …»` dossier fields, and the ~20-minute
recording sitting. The re-seeding for that recording never happened — it needs
about two minutes of held focus and Nick was at the keyboard all evening.
