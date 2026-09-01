# Grill 4 — the account, the phone, and production  `wayfinder:grilling`

Held 2026-09-01. Nick's framing: "one sign in account for people where all
of their accounts sync and login automagically across devices, a full-blown
perfectly designed iOS app, and then doing whatever else necessary after that
to make this production quality." Two rounds, twenty-four questions, every
recommendation accepted verbatim ("ill take all of your recommendations").
A mid-execution ruling added billing (Q25).

Facts established before round 1: the Google verification submission had
not been sent; the site download and updater still served v0.1.0 while
0.1.7 existed only on this Mac; G2 was ruled (b) with nothing server-side
built; there was no iOS work; ~29k lines of TypeScript and ~900 of Rust, so
nearly all logic ports.

## Round 1

| # | Decision | Ruling |
| --- | --- | --- |
| Q1 | Sequencing against the Google submission | Build sync and iOS now; submit later describing the real architecture. One honest submission, not two. |
| Q2 | What a Maru account is | Bitwarden shape: one master password split by KDF into an auth proof and an encryption key, plus a 12-word recovery key. |
| Q3 | Custody preconditions (Google determination, reproducible builds, second operator) | Gate strangers, not the build. Private beta on Nick's devices now; the three become launch criteria. |
| Q4 | iOS technology | Tauri-iOS with a purpose-built mobile React layer. Feel risks named so we can switch to React Native early if a spike fails. |
| Q5 | iOS v1 scope | Read, triage, reply and compose, push. Approving agent drafts from the phone is the first thing after. |
| Q6 | Push relay | In the sync map. Content-free pushes; the phone fetches from Gmail. |
| Q7 | Server stack | TypeScript on Railway with Postgres. |
| Q8 | What never syncs | Mail: never. Grants: never. Audit log: not in v1. |
| Q9 | Money | Free private beta, subscription field in the model — **superseded by Q25**. |
| Q10 | Production exit criteria | Signed reproducible macOS builds; Windows hand-smoked; iOS on TestFlight then the App Store; sync service with backups, status page, second operator, incident runbook; Google verification granted; site and updater current; **a written account-deletion path**. |
| Q11 | The audit deliverable | Written audit with keep/rework/retire verdicts, plus a fresh mechanical run. No desktop redesign. |
| Q12 | Lanes | Parallel worktree lanes under the three-lane cap. |

## Round 2

| # | Decision | Ruling |
| --- | --- | --- |
| Q13 | Is the sync server open source? | Yes. AGPL, `server/` in this repo. The business is running it. |
| Q14 | Cross-platform token truth | Refresh tokens are client-id bound. The vault covers desktops; the first iPhone does one directed consent per account, then iPhones and iPads share. Say it plainly. |
| Q15 | Recovery and reset | The 12-word key is forced at signup and confirmed before activation. No email reset. Reset without it wipes the vault. |
| Q16 | Email at signup | Username only during the beta; a mail provider before strangers. |
| Q17 | Beta gating | Server allowlist, Nick's addresses only, until the Q3 gates pass. |
| Q18 | Device management | Named devices, last-seen, remote sign-out, unlimited in beta. |
| Q19 | iOS form factor and floor | iPhone only, iOS 17+. iPad later. |
| Q20 | iOS design posture | Apple's structure (tab bar, navigation stack, sheets, swipe actions, system share) with Maru's palette, type and character. |
| Q21 | App Store identity | New bundle id `app.getmaru.ios`. The desktop keeps `dev.wren.app`. |
| Q22 | Phone sync window and push | 30 days on the phone. Push is content-free. |
| Q23 | Desktop instant mail via the relay | After iOS ships. |
| Q24 | Physical iPhone and beta devices | Assumed: one iPhone plus this Mac. Nick to correct if there is a Windows machine or a second Mac. |

## Q25 — billing (mid-execution ruling)

Nick, during dispatch: "you know exactly how much we should charge for it,
you know exactly how to hook it up correctly so we can charge people via
Stripe. i know you know it all. make it happen."

Ruling recorded as made by the agent under that instruction:

- **$5 a month or $50 a year.** Fourteen-day trial from signup, no card up
  front. The app is free and AGPL; the account is the product.
- **Why that number.** It sits in the band people pay for
  infrastructure-shaped subscriptions without deliberating (Obsidian Sync,
  Bitwarden, iCloud+), it is above the level at which a single custodian can
  fund backups and a second operator, and annual at ten months is the
  standard two-months-free shape. Stripe's fixed 30¢ takes 6% of a $5
  charge, so the product steers to annual.
- **Stripe Checkout and the Customer Portal, web only.** The iOS app never
  sells; Apple's in-app-purchase rule and its 30% never apply. Stripe Tax on.
- **Reads are never locked.** An expired account still pulls its vault,
  lists devices, signs out and deletes itself. Writes and push need an
  entitlement. Seven-day grace on a failed payment.
- **Beta testers are comped.** The allowlist script sets it.

Spec: `docs/spec/MARU-ACCOUNT.md` §12.

## Things Nick had not raised, decided or queued by the agent

Recorded in `wayfinder/AUDIT-2026-09-01.md` §4 so they are not lost: legal
pages (terms, privacy) required by the App Store, Stripe and the Google
review; a breach-notification plan, which a custodian owes; backup restore
drills; operator two-factor on every account that can ship a build; export
compliance for encryption on the App Store; a reviewer account for App
Review; vault version history for the day a sync overwrites something.
