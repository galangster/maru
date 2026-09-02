# Decision log — grill rounds (self-interrogation)

Nick invoked `/grill-me` and simultaneously requested zero-touch autonomy. The
grilling skill's design tree was therefore run as a self-interrogation on
2026-08-28: every frontier question is recorded here with the recommended
answer auto-adopted. Any decision can be overturned; each entry names the
cost of reversal. ⚠ marks decisions that deviate from standing doctrine or
carry real residual risk — read those first.

## Round 1 — roots

**Q1 — Runtime: Electron or Tauri?**
Adopted: **Electron** (electron-vite, TypeScript everywhere).
Why: the sync engine, OAuth loopback server, SQLite, and MIME building all
live in Node where the ecosystem is deepest; Tauri would put them in Rust or
behind plugin seams — each one a one-shot failure point. Windows WebView2
variance is avoided; Spark and Mailspring themselves ship on this stack.
Cost: heavier install/RAM than Tauri. Reversal: the renderer is plain web
code and the engine is behind a typed IPC contract, so a Tauri port swaps the
shell, not the app. Revisit post-MVP if "lightweight" must mean binary size.

**Q2 — ⚠ Frontend: React + shadcn/ui, or Svelte + shadcn-svelte?**
Adopted: **React + shadcn/ui**.
This deviates from the runtime-efficiency contract §10 ("Svelte is the
production frontend direction"). Justification: (a) Nick's explicit
instruction this session names shadcn as the component library, and canonical
shadcn is React; (b) the design/motion skills requested for the polish phase
(interface-craft, motion-react, component-design) are React-based; (c)
one-shot reliability — the React ports of every needed primitive (virtual
list, resizable panes, command palette) are first-party. Overturn path: §10
was ratified in the MetaDAO design-system context; if Nick extends it here,
the UI layer sits alone in `src/renderer` against the IPC contract.

**Q3 — Gmail access: Gmail REST API, IMAP, or a bundled OAuth client?**
Adopted: **Gmail REST API + OAuth 2.0 loopback/PKCE + bring-your-own client
ID**. No credentials ship in the repo; a 5-minute setup doc covers creating
the Google Cloud OAuth client. A first-class **demo mode** (fixture data)
makes the app fully evaluable with zero setup.
Why: REST gives threads, labels, history-based incremental sync, and parsed
MIME for free; IMAP+app-passwords is clunkier and weaker. Bundling a shared
client ID is a security smell and needs Google verification we can't do.
Cost: Nick performs the OAuth dance himself (Claude must never enter
credentials). Reversal: the provider is behind an interface; IMAP can be
added as a second provider later.

**Q4 — Product shape?**
Adopted: Spark-style three-pane app — sidebar (unified + per-account
folders), thread list, reading pane — unified inbox as the home view.

## Round 2 — engine and data

**Q5 — Sync scope:** initial backfill = all threads from the last **90 days**
per account (`newer_than:90d`), then incremental `history.list` polling every
60 s + manual refresh; full window resync when the stored historyId is
rejected. No Gmail push (needs Pub/Sub infrastructure). "Load older" is
post-MVP.

**Q6 — Storage:** SQLite via better-sqlite3 in the main process, FTS5 for
search, schema behind a small store interface (fallback seam if native
rebuild ever breaks a platform).

**Q7 — ⚠ OAuth scopes:** `gmail.modify` + `gmail.send` + `userinfo.email`.
gmail.modify is a *restricted* scope: with a BYO client in Testing status,
Google expires refresh tokens after ~7 days (re-auth weekly). Mitigation
documented in setup guide; research pass verifies current policy. Accepted
for MVP — personal-use apps live with this.

**Q8 — Send pipeline:** build RFC 822 text (small hand-rolled/`mimetext`
builder), base64url → `messages.send` with `threadId` + In-Reply-To /
References for replies. No SMTP.

**Q9 — Threading:** Gmail's native `threadId`. No JWZ algorithm.

**Q10 — Search:** local FTS5 (subject, sender, body text) for MVP; remote
Gmail query fallback post-MVP.

**Q11 — Composer:** Tiptap StarterKit (bold/italic/lists/links) in a
Spark-style docked sheet; To/Cc/Bcc chips; attachments on send and receive.

**Q12 — Name:** **Wren** — small, light, fast bird; working title, trivially
changeable (one constant + package fields).

## Round 3 — platform, safety, cut lines

**Q13 — ⚠ Windows-first, built on macOS:** custom titlebar via Windows
titleBarOverlay (window-controls overlay), Segoe-safe font stack under Inter,
NSIS installer through electron-builder, and a GitHub Actions workflow that
produces the Windows build. Residual risk: no Windows machine in this
session, so the Windows binary is CI-verified, not hand-verified. macOS build
is what gets visually verified here (also satisfies the later Mac port).

**Q14 — Security posture:** contextIsolation on, nodeIntegration off, typed
preload bridge only; message HTML sanitized with DOMPurify and rendered in a
sandboxed iframe; remote images blocked by default with per-message allow;
tokens encrypted at rest via Electron safeStorage (DPAPI on Windows,
Keychain on macOS); no telemetry.

**Overturned in part, 2026-08-31 (owner):** *"can we please not do this by
default anymore? maybe it can be an option but it's annoying to have to click
this every time."* Remote images now LOAD by default. `Settings.imagePolicy`
defaults to `allow` and is finally read — it had been a dead setting, declared
and defaulted and exported by settings transfer and never once consulted, so
the blocking was hardcoded. Settings → Appearance → "Load images in messages"
turns it off, and the per-thread Show affordance survives intact at `block`.

An image whose DECLARED size is at or below 8×8 is dropped under BOTH values
and counted by neither, so a beacon-only body keeps `img-src data:` and the CSP
backstop stays fully closed for it. What this gives up is that backstop for the
image class specifically: images are now enumeration-only, and enumeration is
what leaked four times before P16. `default-src 'none'` is unchanged, so
scripts, fetch, fonts, frames, media and form targets stay categorically
impossible.

Be precise about what the beacon drop is worth. It protects completely for a
message with no pictures and one declared-tiny pixel. It protects nothing for a
message with a visible picture: every major sender stamps a per-recipient token
on content images, so the moment a hero loads the sender has been told the mail
was opened. Never let a string in this app imply otherwise. Cost of reversal:
one word in `src/core/defaults.ts`, plus a migration if installs are to follow.

**Q15 — Demo mode:** `--demo` flag and an onboarding button seed two fixture
accounts with realistic threads. All screenshots and UI verification run in
demo mode.

**Q16 — Keyboard + notifications:** Gmail-style keys (j/k, e archive,
# trash, s star, r reply, c compose, / search, u toggle read, ⌘/Ctrl+K
palette, ⌘/Ctrl+Enter send); OS notifications for new mail.

**Q17 — Out of scope for MVP:** snooze, send-later, templates, signatures,
smart-inbox categorization, AI features, IMAP/other providers, multi-select,
Gmail drafts sync (local draft persistence only), calendar, unified
"load older than 90d".

> **Q17 amended 2026-09-01 — deferral is IN, and it is called Later.**
> Nick asked for Spark's save-for-later on 2026-08-31 ("nice, fun little
> interactions"), and P21 shipped it the next day. The original answer stands
> for everything else on that list.
>
> It is **not** the snooze Q17 ruled out, and the difference is the whole
> design. Gmail exposes no snooze API, so Maru would have had to hold the
> timer — and a timer held by a laptop that is shut on Tuesday morning
> removes INBOX at Google on Monday and never puts it back. That fails
> unsafe: mail the person asked to see on Tuesday is gone from *every*
> device, past its time, with nothing anywhere that will fix it.
>
> Later is a local predicate instead — `wake_at > now`, in its own
> `thread_defer` table, evaluated when the query runs. Nothing has to happen
> at wake time, so nothing can be missed; a week with the laptop shut costs
> nothing and the thread is simply there. It calls **no new Gmail method**,
> so the open verification submission and
> `docs/security/google-oauth-method-scope-matrix.md` are untouched.
>
> The name is load-bearing. "Snooze" is a cross-device promise in Gmail,
> Spark and Superhuman alike, and Maru's is one Mac — so the word would turn
> an honest local feature into a lie. It is **Later**, and one sentence rides
> permanently with it in three places (the picker, the Later view's header,
> and Settings → Sync): *"Later is on this Mac. Gmail on your phone still
> shows these in your inbox."*
>
> The cost, stated: Maru's inbox count and Gmail's iOS badge disagree by
> however many threads are saved. There is no mitigation short of a sync
> service (map 4, G2), and `thread_defer` is exactly the shape that syncs on
> that spine when it arrives. Full reasoning in
> [P21](../wayfinder/tickets/P21-later-and-swipe.md).

> **Q17 amended again 2026-09-02 — Later syncs, and it is still not snooze.**
> Nick ruled A9 yes: deferrals travel between a person's own devices inside
> the encrypted Maru vault. The spine the note above predicted arrived, and
> `thread_defer` synced on it as predicted.
>
> Nothing about the fail-safe design moved. A deferral is still the local
> predicate `wake_at > now`, evaluated when the query runs, on every device
> that holds the vault. No device is asked to act at a moment in time, and
> **no Gmail method is called on this path** — asserted in
> `tests/later-sync.test.ts` against a client whose every method throws, so
> the method-scope matrix and the verification submission stay untouched.
> This is what still separates it from snooze: Gmail's snooze is a promise
> kept by Google's servers, and Maru's is a predicate each device evaluates
> for itself.
>
> One constraint moved, and only in letter: MARU-ACCOUNT.md §1 now says **no
> ids the service can read** rather than no ids at all. A Gmail thread id
> travels, as ciphertext, under a key the service never holds.
>
> The permanent sentence changed with it — the old one said "Later is on this
> Mac", which is now true only when nobody is signed in. It reads: *"Later
> follows your Maru account when you're signed in, and stays on this device
> when you're not. Gmail never sees it, so these still show in Gmail's
> inbox."* Four homes now: the picker, the Later view's header, Settings, and
> the phone's Later sheet. Full reasoning in
> [A9](../wayfinder/tickets/A9-later-sync.md).

**Q18 — Build SOP:** sequential single-writer lanes (scaffold → engine →
shell → features → polish), Opus-floor agents for component-writing lanes,
one verification gate per boundary, simplify pass before seal. Detail in
[SOP.md](SOP.md).

## Round 4 — Nick's live answers (2026-08-28) + research corrections

Nick installed `mattpocock-skills` mid-run and answered one frontier round
directly. His rulings supersede the matching Round 1 entries:

**Q1→ Frontend:** React + canonical shadcn/ui stands (his delegation), with a
new hard constraint: **no MetaDAO styling** — "this is a totally separate
product." Wren's design language is its own, Spark-inspired.

**Q2→ ⚠ Runtime: Tauri 2, superseding Electron.** Nick: "do whichever is
faster, lighter, more optimized, more futureproof" — that is Tauri on every
axis (~10 MB core, WebView2, no bundled Chromium). One-shot de-risking: the
entire app core (Gmail client, sync engine, OAuth logic) is TypeScript in
the webview, unit-testable in Node; Rust is confined to official plugins
(sql, notification, opener, http) + a ~40-line keychain command + the OAuth
loopback listener. Native HTTP plugin carries all Google calls (no CORS
exposure). Search drops FTS5 for an in-memory MiniSearch index (no native
seam). Fallback if the Rust toolchain blocks: Electron, per Round 1.

**Q3→** BYO OAuth client confirmed as recommended.

**Q4→** Autonomous one-shot confirmed; wayfinder map carries the execution
override in its Notes. Nick: "i'll let you decide autonomously for every
decision to make here on out."

**Research corrections adopted** (see docs/research/gmail-api-notes.md):
scopes reduced to `gmail.modify` + `gmail.send`; sync engine designed for
the 2026-05 quota model (6,000 units/min/user, messages.get = 20 units →
batched ≤50, metadata-first, lazy body hydration); historyId expiry treated
as routine with a cheap full-window resync path; replies carry References/
In-Reply-To headers *and* threadId.

**Toolchain note:** system Rust was 1.72 (Homebrew, 2023) — upgraded via
`brew upgrade rust` to meet Tauri 2's minimum.

## Round 5 — Nick's design-direction interjection (2026-08-28, during T2)

Nick's ruling, verbatim gist: modern SaaS that "feels like a cloud"; some
liquid-glass elements (researched properly); a thoughtful UX that fills the
holes of current email clients; spacing and alignment "REALLY important";
Mobbin MCP for inspiration; Anron icons; Open Runde + DM Sans, one or two
weights, a couple of sizes; uncluttered, simple, elegant system. Reference
apps: Family, Phantom, Aave, Umbra.

Adopted:
- **T7 design-direction lane inserted before the shell** — Mobbin study +
  liquid-glass research → docs/design/DIRECTION.md + src/styles/tokens.css.
  The shell builds against tokens; nothing is retrofitted.
- **Fonts bundled:** DM Sans Regular/Medium statics from Nick's zip
  (~/Downloads/DM_Sans.zip) and Open Runde Regular/Medium/Semibold woff2
  from github.com/lauridskern/open-runde, with licenses, in
  src/assets/fonts/. Two weights per family max, ≤5 sizes.
- **⚠ Anron icons deferred:** no Figma MCP is connected in this session
  (DesignSync targets claude.ai/design, not Figma). All icons go through a
  single `Icon` component; MVP ships lucide tuned to Anron's rounded
  geometry (stroke, caps, sizing grid); swapping in real Anron SVGs later is
  a bounded change behind that seam.
- **Glass discipline:** liquid glass on floating/overlay surfaces only;
  list rows stay solid for WebView2 scroll performance.
- 4 px spacing grid; spacing/alignment named as an explicit review gate in
  T5.

## Round 6 — post-MVP live session (2026-08-28/29, Nick present)

Rulings and events after the seal, in order:
- **ui-review full audit** (Nick's directive): verdict Blocked, grade B+; all
  3 blocking + 13/13 should-fix + 10/11 nits fixed (d757c1c).
- **Magic + sounds**: MAGIC.md moments implemented; CC0 sound set, off by
  default; send micro-sequence with a real 4 s undo window.
- **GitHub**: private repo galangster/wren; Windows CI run succeeded
  (artifact wren-windows). gh account restored to NickMetaDAO after each push.
- **Google OAuth**: project "Wren" (id smart-processor-507004-r9), Gmail API
  enabled, External/Testing consent, Nick sole test user, Desktop client
  "Wren Desktop". Claude drove the console; Nick performed sign-in, the
  User-Data-Policy agreement, and credential copy — credentials never
  entered Claude's context.
- **First live sync — two real-engine fixes:** (1) pooled-connection
  BEGIN/COMMIT starved every write (5 s busy-timeout, rows_affected=0) —
  transactions removed, WAL enabled (e2894ad); (2) Gmail per-user rate
  limiter 429'd 50-item batch bursts (2,000 units/instant) — chunks now 10
  with per-part retry rounds instead of whole-batch replay (ac6d3b3).
  Verified live: full backfill completed; send verified cross-account.
- **⚠ Amie-ification** (Nick: "take all of the UI, colors, and styling from
  Amie... they told me i could"): styling system only — no Amie assets or
  brand. Study from 36 Mobbin screens → de-tinted achromatic neutrals,
  8-hue category family bound to labels/avatars, ring-composed ~25% lighter
  depth, tighter desktop radii, inset rounded rows (3175e3e). Autonomous
  calls under Nick's delegation: accent stays hue 268; glass narrowed to
  palette+composer (his Round-5 ask outranks Amie's no-glass); subject-emoji
  inference deferred.
- **Celebrations** (Nick: "small celebrations... dopamine"): overrides the
  earlier no-confetti conservatism. Amie register — one confident pop;
  particles only at inbox-zero (18, once per transition, 60 s guard);
  reduced-motion mounts nothing.
- **Colored active fills** (Nick): stateful icons use Anron Filled twins +
  semantic color (star gold — contrast-floored at oklch(0.63 0.15 58)).
- **Anron icons landed** after Nick supplied the library-grid Figma node:
  42/43 mapped, Line resting / Filled active; icon-seam chip session merged
  (82f42ef); non-scaling-stroke hack removed (root cause of heavy small
  icons).
- **Titlebar**: double "Wren" fixed — macOS hiddenTitle + overlay traffic
  lights; Windows overlay untouched.

Frontier empty. Tree closed 2026-08-28.
