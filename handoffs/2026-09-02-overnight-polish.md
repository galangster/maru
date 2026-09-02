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

Main is at the commit named in the "Resume" section below; every lane
below is merged and pushed to `galangster/maru` unless marked otherwise.
Tests on main: **932 passed, 4 skipped** (was 767 at the start of the night).

### Shipped

| Surface | State |
| --- | --- |
| Sync service (Railway `sync`) | `POST /v1/push/test` live (c414c34): one visible alert to the caller's device, 6/min, APNs rejection returned as 200 `{ok:false, apns:{status, reason}}`, 402 when expired. Spec §5/§9/§12 updated. |
| Phone push registration | Root cause fixed (4fa1852): the APNs token was dropped when it arrived before the Maru session hydrated and nothing retried. `registerDevice()` now runs on start, consent, new token, sign-in and every foreground; Settings → Notifications has a **Push diagnostics** row (permission, token prefix, relay result or error, **Send test push**). Nick's phone still showed `has_token=false` at the last relay probe (06:03 UTC) — the next TestFlight install is what proves the fix. |
| TestFlight | **0.1.9 (5)** uploaded 02:24 PT, delivery `baa9adc2-…`; 0.1.9 (4) VALID and in "Maru internal"; 0.1.8 (3) VALID. App Store Connect **renumbered** the night's uploads (see `docs/APP-STORE.md` §6): the build number is `bundle.iOS.bundleVersion` in `src-tauri/tauri.ios.conf.json`; next free is **6**. |
| Desktop | **v0.1.9 published** (7 assets: DMG, app.tar.gz, .sig, latest.json, SHA256SUMS, Windows exe+msi). The tag workflow failed at the Developer ID certificate import step as for 0.1.8; the macOS build was signed, notarized and stapled locally with `scripts/release-macos.sh` and the notes say so. `releases/latest/download/latest.json` reports 0.1.9. |
| Desktop QA | Wave 1 (7 issues), interface review (17 issues), wave 2 (8 issues), wave 3 release-candidate check (23 of 25 verified, 2 reopened, 3 new). Reports in `wayfinder/qa/2026-09-02-desktop-wave-{1,2,3}.md` and `wayfinder/UI-REVIEW-2026-09-02-desktop.md`. |
| Phone QA | Wave 1 (14 issues, 7 parity gaps), wave 2 (all 14 verified fixed, 7 new, every wave-1 parity gap closed). Reports in `wayfinder/qa/2026-09-02-mobile-wave-{1,2}.md`. |
| Fix lanes merged | device-qa (swipes reach the finger, keyboard-only rings, `:where()` button reset, hairlines, Dynamic Type, push-account sheet); desktop-fixes 1–7; push-diagnostics; mobile-fixes-a (bulk undo, sync banner, scroll restore, toasts, a11y names, Dynamic Type); mobile-fixes-b (Mailboxes picker → Later/Sent/Starred/Trash/labels, bulk Trash/Read/Unread, search-result actions, blocked images, label picker, expand-all); desktop-ui-fixes 22–38 (focus ring token, on-fill certified tier bound to the fill utilities, search sender column, etc.); desktop-fixes-2 (39, 41–45); undo-depth (40: ten-deep stack); mobile-fixes-c (47–53: per-conversation actions in Sent/Trash, search survives a thread, dismiss after removal, sync banner wrap, "this phone", sheet drag-to-dismiss + edge-back). Each merge had a two-reviewer pass applied before it. |

### Open on GitHub

- **23** (reopened) search subjects still truncate in a fixed 140 px box; **32** (reopened) hover lane shrinks subject/preview; **54** digits typed into the Later date field fire preset shortcuts; **55** dark highlighted Later row time 3.94:1; **56** arrow-key sidebar resize asymmetric. → lane `lane/desktop-fixes-3` (worktree `../wren-lane-df3`); see Resume.
- Known, not filed: `npm run contrast:check` reports one pre-existing pair, light accent on surface-base 4.31 (plain accent used as text on the canvas). Owner call: DIRECTION §3 palette stays; `--wren-accent-on-fill` (#B24054) would clear 5.10 there.
- Owner items left by the device-QA lane, in `wayfinder/tickets/I2-mobile-layer.md` → "Device QA 2026-09-02": duplicated archive/Later/more in thread nav and toolbar; mail bodies not scaling with Dynamic Type; undo toast vs the expanded glass bar; virtualizer re-measure drift under Dynamic Type. Nothing has been re-proved on a physical iPhone tonight.

### Housekeeping

- Stray branch `lane-backup-before-recommit` (left by the mobile-fixes-c lane while rewriting its captures into per-issue commits). The execution-guard hook blocks `git branch -D`; delete it by hand or with `ALLOW_SHARED_WORKTREE_REWRITE=1`.
- `wayfinder/NICK-QUEUE.md` carries the TestFlight install + push check; update it to **0.1.9 (5)**.
- Codex (`gpt-5.6-sol`) is out of credits until 2026-09-06 19:28 PT; every lane tonight ran on Opus subagents.

## Resume

1. Await/land `lane/desktop-fixes-3` (issues 23, 32, 54, 55, 56): two-reviewer pass (reuse/simplification + efficiency/altitude, Opus Explore agents), apply, run `npm run typecheck && npx vitest run && npx vite build && npm run contrast:check`, merge `--no-ff`, push, close the issues, remove the worktree.
2. Confirm TestFlight 0.1.9 (5) is `VALID` and in the group: `node <scratch>/asc.mjs` is session-local; use `GET /v1/builds?filter[app]=6807633550&sort=-uploadedDate&limit=1` with key `G52RSWR37N` (issuer `52f4e617-a4b3-4cee-bcd0-23f8e653d7b5`, `~/.wren-release/AuthKey_G52RSWR37N.p8`).
3. Then either cut desktop **0.1.10** with the wave-3 fixes (bump `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `Cargo.toml`, `Cargo.lock`; tag; run `scripts/release-macos.sh` locally with `APPLE_SIGNING_IDENTITY` and `WREN_OFFICIAL_GOOGLE_CLIENT_ID` from `gh variable get`; `gh release create` with the assets and the Windows run's exe/msi), or leave 0.1.9 as the morning build — owner's call.
4. Wave 4 on both apps only if Nick wants another pass; wave 3 desktop found 3 new (all P2/P3), wave 2 phone found 7. The stop rule (Q7) has not been reached on either app.
5. Fix the tag workflow's certificate import (secrets `APPLE_CERTIFICATE`/`APPLE_CERTIFICATE_PASSWORD` in the repo) so releases regain GitHub attestation — owner supplies the .p12.

## Owner gates (unchanged unless noted)

Install 0.1.9 (5), sign in to the Maru account, open Settings → Notifications → Push diagnostics, press Send test push, then send yourself a mail. Paid-subscription run. Google verification submission. Dossier fields. FlowDeck Accessibility permission. Delete the stray branch. Decide the accent-on-base contrast item and desktop 0.1.10 timing.
