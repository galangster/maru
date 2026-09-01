# P20 — What the pre-freeze sweep found and did not fix  `wayfinder:task`

status: open · found 2026-08-31 by the 0.1.2 pre-freeze sweep

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

## 3. `--wren-fill-selected` missed the hue-13 anchor

`src/styles/tokens.css`: light is `oklch(0.575 0.15 21 / 0.08)` and dark is
`oklch(0.745 0.12 35 / 0.14)` — the *pre-13* accent hues, in both themes.
These are the only two OKLCH values in the file still carrying a retired hue.

Composited, the difference is invisible today: 1/255 in light, 4/255 on the
blue channel in dark. So this is not a visual defect. It matters because
DIRECTION §3 defines the selected row as "accent at 8% light / 14% dark", and
it is now a hard-coded coral that will silently *not* follow the next accent
change — which is exactly the failure P14 spent a day removing everywhere
else.

Measured while there: `text-ink-3` on a selected row in dark is 4.31:1,
against the 4.5 floor DIRECTION claims every tier clears. Pre-existing (4.27
before the rebrand), so not a regression — but it should be recorded rather
than rediscovered.

## 4. "Starting…" has no timeout

Carried from P18. An engine that never emits leaves the footer saying
"Starting…" indefinitely. Strictly better than the false "Up to date" it
replaced, but the honest version escalates to "Not synced yet" after ~30s.
Needs a timer and a new state, which is why it was deferred.

## Sequencing

None of these blocks the recording. (1) should land before anyone outside
this machine installs Maru. (2) should land before agent features are
demonstrated on camera, or the demo should simply confirm no dev build is
running. (3) and (4) are cleanup.
