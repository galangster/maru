# Handoff — 2026-09-02, the overnight polish run

Continues [2026-09-01-grill-4-account-iphone.md](2026-09-01-grill-4-account-iphone.md).
Mandate (Nick, 2026-09-01 night): full polish of the phone and the desktop
with mail-feature parity, robust delightful interactions, break the app with
the QA skill and file GitHub issues, audit with subagents, cut TestFlight
build 2 early and build 3 at the end with desktop 0.1.9 published. Overnight
mini-grill rulings Q1–Q7 all accepted (parity means identical mail behaviour
with native chrome per platform; breaking runs in demo mode only; never touch
Stripe, Google Cloud or Apple settings; three worktree lanes, evidence-only
returns, Opus for anything that writes or judges, two-reviewer pass before
every merge; stop when a wave yields no new findings on both apps or at the
compaction boundary).

## State at handoff

Main is at `5e587a1` plus this edit (morning session continued after Nick's approval of every recommendation); every lane
below is merged and pushed to `galangster/maru` unless marked otherwise.
Tests on main: **1016 passed, 4 skipped** (was 767 at the start of the night). Every GitHub issue filed (1–66) is closed.

### Shipped

| Surface | State |
| --- | --- |
| Sync service (Railway `sync`) | `POST /v1/push/test` live (c414c34): one visible alert to the caller's device, 6/min, APNs rejection returned as 200 `{ok:false, apns:{status, reason}}`, 402 when expired. Spec §5/§9/§12 updated. |
| Phone push registration | Root cause fixed (4fa1852): the APNs token was dropped when it arrived before the Maru session hydrated and nothing retried. `registerDevice()` now runs on start, consent, new token, sign-in and every foreground; Settings → Notifications has a **Push diagnostics** row (permission, token prefix, relay result or error, **Send test push**). Nick's phone still showed `has_token=false` at the last relay probe (06:03 UTC) — the next TestFlight install is what proves the fix. |
| TestFlight | **0.1.10 (6)** is the current cut (phone wave-3 fixes: sheet back gesture, long-subject title clamp, gesture hints from resolved actions, acted-on search results drop, one coalesced Undo toast, IME and RTL on the phone). Earlier: 0.1.9 (5), (4), 0.1.8 (3), all VALID. App Store Connect **renumbered** the night's uploads (see `docs/APP-STORE.md` §6): the build number is `bundle.iOS.bundleVersion` in `src-tauri/tauri.ios.conf.json`; next free is **7**. |
| Desktop | **v0.1.10 published** (wave-3/4 fixes 23, 32, 54–61, the accent-as-text tier app-wide, sender name on outgoing mail with Settings field and Gmail prefill; 7 assets, updater manifest reports 0.1.10; macOS signed locally, Windows from CI run 33640730205). **v0.1.9 published** earlier (7 assets: DMG, app.tar.gz, .sig, latest.json, SHA256SUMS, Windows exe+msi). The tag workflow failed at the Developer ID certificate import step as for 0.1.8; the macOS build was signed, notarized and stapled locally with `scripts/release-macos.sh` and the notes say so. `releases/latest/download/latest.json` reports 0.1.9. |
| Desktop QA | Wave 1 (7 issues), interface review (17 issues), wave 2 (8 issues), wave 3 (23 of 25 verified, 2 reopened, 3 new), wave 4 (all 5 verified, 5 new: 57–61). Reports in `wayfinder/qa/2026-09-02-desktop-wave-{1,2,3,4}.md` and `wayfinder/UI-REVIEW-2026-09-02-desktop.md`. |
| Phone QA | Wave 1 (14 issues, 7 parity gaps), wave 2 (all 14 verified, 7 new), wave 3 (6 of 7 verified, 53 reopened for the sheet back gesture, 4 new: 62–65). Reports in `wayfinder/qa/2026-09-02-mobile-wave-{1,2,3}.md`. |
| Fix lanes merged | device-qa (swipes reach the finger, keyboard-only rings, `:where()` button reset, hairlines, Dynamic Type, push-account sheet); desktop-fixes 1–7; push-diagnostics; mobile-fixes-a (bulk undo, sync banner, scroll restore, toasts, a11y names, Dynamic Type); mobile-fixes-b (Mailboxes picker → Later/Sent/Starred/Trash/labels, bulk Trash/Read/Unread, search-result actions, blocked images, label picker, expand-all); desktop-ui-fixes 22–38 (focus ring token, on-fill certified tier bound to the fill utilities, search sender column, etc.); desktop-fixes-2 (39, 41–45); undo-depth (40: ten-deep stack); mobile-fixes-c (47–53: per-conversation actions in Sent/Trash, search survives a thread, dismiss after removal, sync banner wrap, "this phone", sheet drag-to-dismiss + edge-back). Each merge had a two-reviewer pass applied before it. |

### Open on GitHub

- None. 23, 32, 54, 55, 56 landed via `lane/desktop-fixes-3` (merged, two-reviewer pass applied). Issue 23 is closed at 2 of 9 search subjects still truncating at 216 px: a one-line 52 px result row (DIRECTION §5) cannot hold sender + subject for the two longest; a wider list, a two-line result row, or dropping the sender name is an owner call.
- Closed by ruling (Nick, 2026-09-02): accent as a word draws in `--wren-accent-text` (+ hover tier) app-wide, palette unchanged; `npm run contrast:check` exits 0. Search results keep the one-line row and sender column; a clipped subject carries its full text as a tooltip and in the accessible name.
- Owner items left by the device-QA lane, in `wayfinder/tickets/I2-mobile-layer.md` → "Device QA 2026-09-02": duplicated archive/Later/more in thread nav and toolbar; mail bodies not scaling with Dynamic Type; undo toast vs the expanded glass bar; virtualizer re-measure drift under Dynamic Type. Nothing has been re-proved on a physical iPhone tonight.

### Housekeeping

- Stray branch `lane-backup-before-recommit` (left by the mobile-fixes-c lane while rewriting its captures into per-issue commits). The execution-guard hook blocks `git branch -D`; delete it by hand or with `ALLOW_SHARED_WORKTREE_REWRITE=1`.
- `wayfinder/NICK-QUEUE.md` carries the TestFlight install + push check at **0.1.9 (5)**.
- Codex (`gpt-5.6-sol`) is out of credits until 2026-09-06 19:28 PT; every lane tonight ran on Opus subagents.

## Resume

1. Done: every lane merged; desktop 0.1.10 and TestFlight 0.1.10 (6) carry all of it.
2. Done: TestFlight 0.1.9 (5) is `VALID` and in the group (6 builds listed). To re-check later, use `GET /v1/builds?filter[app]=6807633550&sort=-uploadedDate&limit=1` with key `G52RSWR37N` (issuer `52f4e617-a4b3-4cee-bcd0-23f8e653d7b5`, `~/.wren-release/AuthKey_G52RSWR37N.p8`).
3. Done: desktop 0.1.10 cut the same way as 0.1.9 (local `scripts/release-macos.sh`, Windows from CI). For the next release: bump the five version files, tag, run the script, `gh release create`, attach the Windows run's exe/msi.
4. The stop rule (Q7) is still not reached: desktop wave 4 found 5 new, phone wave 3 found 4 new (all fixed). The yield is falling (P1s gone since wave 2 desktop / wave 2 phone). A wave 5 desktop and wave 4 phone on 0.1.10 would be the next check; the untested owner-only surfaces (Maru account section, real Gmail, physical iPhone gestures, VoiceOver, push) are where the remaining risk sits.
5. Release workflow: the five non-certificate secrets were set 2026-09-02 (API issuer/key/private key, signing identity, updater key). Only `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD` are missing — the .p12 export is in `wayfinder/NICK-QUEUE.md` with exact commands.

## Owner gates (unchanged unless noted)

Install 0.1.10 (6), sign in to the Maru account, open Settings → Notifications → Push diagnostics, press Send test push, then send yourself a mail. Paid-subscription run. Google verification submission. Dossier fields. FlowDeck Accessibility permission. Delete the stray branch. Export the Developer ID .p12 for CI.
