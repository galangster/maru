# P3 — Auto-update  `wayfinder:task`

status: closed · claimed: P3 lane, 2026-08-29 · blocked by: —

## Question → work

Tauri updater plugin against a static, signature-verified manifest on
GitHub Releases (ratified: no Wren server, no telemetry). Auto-check on
launch, always-ask before install, a "Check for updates" surface in
Settings → About. The key ceremony — where the updater private key lives,
who can cut a release — is the fog this ticket burns off; write it down
in docs/DECISIONS.md when settled.

## Resolution

Tauri updater over the static manifest, exactly as ratified: pubkey in
tauri.conf, endpoint `releases/latest/download/latest.json`, updater
artifacts (`.app.tar.gz` + `.sig`) produced signed — the CLI quirk worth
recording: the `_PATH` env variant silently skips signature generation;
the release script exports the key *contents* with an explicit empty
password. `release-macos.sh` now assembles `latest.json` (version, url,
signature) and names everything to upload with a `v<version>` release;
`macos-release.yml` carries the new secret and artifacts.

In the app: one silent check per launch — only a found update makes a
sound, a sticky toast whose action is the consent ("Restart & update" →
downloadAndInstall → relaunch) — and a loud "Check for updates" beside
the debug report in About, where "you're current" is an answer. The
browser demo answers honestly that updates apply to the installed app
(verified live).

**Key custody** (the ticket's fog, settled): the updater private key
lives at `~/.wren-release/updater.key` (0600, no password — it signs
updates, it unlocks nothing) beside the Developer ID key; the same
contents go into the `TAURI_SIGNING_PRIVATE_KEY` repo secret when CI
releases start. Only this machine and the repo secrets can cut an
update; losing the key means users re-download by hand — back it up with
the Apple key. First full end-to-end (check → install → relaunch)
necessarily waits for the first real GitHub release to exist; the
pipeline halves are each verified.
