# P20 — What the pre-freeze sweep found and did not fix  `wayfinder:task`

status: DONE (2026-08-31) · found by the 0.1.2 pre-freeze sweep, all four closed the same day

Eleven agents swept the 31 commits between the installed 0.1.1 build and
0.1.2, and every finding was adversarially verified before anyone acted on
it. The blockers are fixed and shipped in 0.1.2 (see the commit
`Pre-freeze sweep: fix what would have shipped in 0.1.2`). These are the
remainder: real, verified, and deliberately not fixed on release day.

Two design questions went to `NICK-QUEUE.md` instead — the shell/message-card
radius inversion, and accent-on-ground contrast. They are decisions, not
defects.

## 1. ~~Intel Macs will never receive an update~~ — half fixed, and it was worse than the ticket said

**DONE 2026-08-31 (the manifest half). The Intel half is a real decision and is
below.**

The ticket framed this as an updater bug. It is not, or not only. `lipo -archs`
on the shipped binary returns **arm64** and nothing else, so an Intel Mac does
not merely fail to update — **it cannot launch Maru at all.** Meanwhile
`site/index.html` offered a button reading "Download for macOS" with no
qualifier. Someone on an Intel Mac would download a DMG, drag it across, and
watch it refuse to open with no explanation.

Fixed now:

- **`scripts/release-macos.sh` reads the platform keys off the binary** with
  `lipo -archs`, instead of hardcoding `darwin-aarch64`. Verified against all
  three cases — arm64, x86_64, and universal, which emits both keys with no
  further edit. An unrecognised architecture is a hard error rather than a
  silently wrong manifest. The script also now prints a NOTE after every
  non-universal build saying Intel is excluded.
- **The site and README say Apple Silicon**, at the download button and in the
  status blockquote respectively.

Why the manifest fix matters even though the old hardcoded key was accidentally
correct: it was unguarded in both directions. A release cut on an Intel Mac
would have advertised an x86_64 tarball under the aarch64 key, handing Apple
Silicon users a binary to run under Rosetta. And a lookup that finds no matching
key returns null, which `check()` reports as "no update" — `src/lib/updates.ts`
passes `announceNoUpdate: false` on launch, so the user is never told.

### Still open: does Maru ship for Intel at all?

An owner decision, not a task. `rustup` is not installed on this machine (cargo
comes from Homebrew), so only the host target exists — shipping x86_64 or a
universal binary needs the toolchain added first. Then:

- **Universal** — one artifact, both architectures, no manifest change needed
  because the script now derives the keys. Costs roughly double the binary, and
  README currently advertises "~10 MB core".
- **Two artifacts** — keeps the arm64 download small, needs both keys pointing
  at different URLs, which the current script does NOT do (it points every key
  at one tarball). That is a further change, and the script should fail loudly
  rather than emit it wrongly.
- **Neither** — Apple Silicon only, now stated honestly at the point of
  download. Defensible for a pre-1.0 client; Intel Macs are past their last
  macOS release.

Nothing is broken while this is undecided, because the requirement is now
stated where people download.

## 2. ~~A stray `tauri dev` steals the release build's agent connections~~ — DONE 2026-08-31

The socket name is now split by build type, the same way `KEYRING_SERVICE`
already splits for the same shared-identifier reason. A debug build binds
`gateway.dev.sock` (and a `-dev` named pipe on Windows); a release build keeps
`gateway.sock`.

**Verified empirically rather than by reading**, because the failure was silent
in the old code and would have been silent in a wrong fix too. With the
installed 0.1.6 running, a `npm run tauri dev` was started beside it:

| socket | bound at | held by |
|---|---|---|
| `gateway.sock` | 20:48 | `/Applications/Maru.app` |
| `gateway.dev.sock` | 21:01 | `target/debug/wren` |

The release socket's bind time is unchanged. Before the split,
`try_overwrite(true)` would have unlinked and rebound it at 21:01, leaving the
release process listening on an unlinked inode and hearing nobody.

`bin/maru-mcp.mjs` and the published `npm/maru-mcp` copy still resolve the
RELEASE endpoint by default, deliberately: an agent connecting from outside
wants the installed app, not whatever is running under a developer's terminal.
Both now say so, and name `--socket` / `MARU_GATEWAY_SOCKET` as the way to
reach a dev build. `docs/CONNECT-AN-AGENT.md` carries the same note.

### Still shared, and still worth closing

Agent credentials, grants and the audit log all live in the shared `wren.db`,
so a credential issued by one build is still accepted by the other. That is the
larger half of the original finding and it is NOT fixed here — it depends on
the open queue question of whether a dev build should share the database at
all. Recorded in the code comment beside the split so the next reader does not
assume the isolation is complete.

## 3. ~~`--wren-fill-selected` missed the hue-13 anchor~~ — DONE 2026-08-31

It is now DERIVED rather than restated:
`color-mix(in oklab, var(--wren-accent) 8%, transparent)` in light, 14% in
dark. That is exactly what DIRECTION §3 already claimed the selected row was
("accent at 8% light / 14% dark") and was not — both values were literal copies
of the accent's pre-P14 hues, 21 and 35, frozen where a re-anchor could not
reach them.

The point is not the hue, which was invisible at 1/255. It is that a future
re-anchor is one edit again instead of three, which is the whole thing P14
spent a day buying.

Verified in the browser rather than by reading, because a `color-mix` that
failed to parse would leave selected rows with NO fill and nothing would say
so: light resolves to `oklab(0.575 0.145 0.034 / 0.08)`, dark to
`oklab(0.745 0.117 0.027 / 0.14)` — alpha preserved, so the mix premultiplied
and did not darken toward black. The selected sidebar row paints.

Audited while there: no other token still carries a retired accent hue. The
remaining reds — `--wren-destructive` (25 light / 22 dark) and the `red`
category hue — are deliberately NOT the brand, and a destructive red at hue 13
would be indistinguishable from it.

Carried forward, unchanged and not a regression: `text-ink-3` on a selected row
in dark measures 4.31:1 against DIRECTION's claimed 4.5 floor. It was 4.27
before the rebrand. It belongs with the accent-on-ground contrast question
already in `NICK-QUEUE.md`, not here.

## 4. ~~"Starting…" has no timeout~~ — DONE 2026-08-31

It escalates after 30 seconds: `Starting…` becomes `Not synced yet`, the
sentence becomes "…Mail is not arriving. Open Settings to check the accounts.",
and the line becomes a control that leads there.

The reasoning, because the wording matters more than the timer: "Starting…" is
a PROMISE that something is about to happen. The engine emits `syncing` as the
first act of both its backfill and its incremental pass, so a healthy account
clears it in well under a second. Anything still silent after half a minute is
not starting, and the footer should stop making a promise it cannot keep. After
the grace it states a fact instead, and offers somewhere to go.

It is deliberately NOT urgent. Nothing is known to be broken — the accounts are
silent, not failed — so it takes no destructive glyph and does not interrupt
the list.

The threshold is checked against the app-wide minute clock rather than a
dedicated timer, so the change lands at the first tick past the grace rather
than to the second. That is the trade taken on purpose: a second clock for a
sentence nobody is watching would be a second clock to keep in step with the
first.

## Sequencing

**All four are done as of 2026-08-31.** What remains from this ticket is one
owner decision — whether Maru ships for Intel at all (§1) — and one dependency:
the agent registry is still shared between dev and release builds (§2), which
waits on the queued question of whether a dev build should share the database.
