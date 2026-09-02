# I6 — TestFlight and the App Store  `wayfinder:task`

status: **blocked by I3, I4** · map 5

Owner: a reviewer Google account and a comped Maru account (queue). Agent:
privacy nutrition labels (email, device name; no tracking), export compliance
`ITSAppUsesNonExemptEncryption = NO`, screenshots from the captures, the
listing copy, TestFlight internal group, then review.

## App Store Connect record — created 2026-09-01 (agent in Nick's Chrome, Nick's go-ahead)

- App record **"Maru Mail"** (Apple ID 6807633550; iOS, English U.S., bundle `app.getmaru.ios`,
  SKU `maru-ios`) on team 2M8UE59WH7. **The store name "Maru" was already
  taken** by another app, which is the name-collision risk the queue
  flagged; "Maru Mail" matches the Google consent screen. The home-screen
  name (`CFBundleDisplayName`) stays "Maru".
- User access defaulted to all team users (the per-user setting failed to
  save; irrelevant for a one-person team, editable under App Information).
- Still to do before TestFlight: upload a build (needs the A7 workflow or a
  local archive with the iOS distribution profile), an internal tester
  group with Nick's Apple ID, privacy labels, export compliance.

## Agent lane complete — 2026-09-01

Everything an agent can prepare is prepared and sits in
**[`docs/APP-STORE.md`](../../docs/APP-STORE.md)**, written to be pasted field
by field. Status is **ready to paste; blocked on the owner items below**.

### Ready to paste

- [ ] Subtitle (30 chars), with a trademark-safe alternate — §1
- [ ] Promotional text (167 chars) — §1
- [ ] Description (2,240 chars, honest about the beta, push, and Later) — §1
- [ ] Keywords (96 chars, no "gmail"/"google" — 5.2.1) — §1
- [ ] Support URL `https://getmaru.app/support`, marketing URL, privacy URL,
      copyright, Productivity / Utilities — §1
- [ ] Age rating: 4+, every answer written out, two judgement calls recorded — §1
- [ ] App Privacy questionnaire: three collected types with their exact
      justification sentences, and every "not collected" answer with its
      reason. Tracking: no, everywhere — §2
- [ ] Export compliance answer set — §3
- [ ] App Review notes, minus two credentials — §4
- [ ] Screenshots, 6 per size — §5

### Done in the repo

- `ITSAppUsesNonExemptEncryption = NO` now ships in the generated Info.plist.
  `src-tauri/scripts/prepare-ios-oauth.mjs` emits it beside the OAuth URL
  scheme, so it lands through the existing `beforeBuildCommand` hook with no
  new build step. No TestFlight build will stall at "Missing Compliance".
- `site/support/index.html` — the support page the Support URL points at, and
  a link to it from the site nav.
- `scripts/store-screenshots.mjs` → `wayfinder/captures/store/{6.5,6.9}/`,
  six frames each at 1284×2778 and 1320×2868, plus the 1179×2556 sources.
  **The captures in `wayfinder/captures/ios/` are 393×852, not 1179×2556** —
  one pixel per point — so they cannot fill a store canvas and must not be
  upscaled. The script re-captures the same six screens from the same demo
  build at `deviceScaleFactor: 3` and only ever scales the frame *down*.

### Owner-only, still open

- [ ] A dedicated reviewer Google account: address, password, and how the
      reviewer gets a 2FA code. Both `«NICK: …»` slots in §4.
- [ ] Add that address to the Google OAuth consent screen's test users, and
      comp it on the Maru side (`server/scripts/allow.ts comp <email>`).
- [ ] App Review contact: first name, last name, phone, email.
- [ ] The App Store Connect API **issuer id**, and a check that
      `~/.wren-release/AuthKey_PTF7XH7JWF.p8` is an App Store Connect key with
      App Manager access rather than a notarization key. It is the one value
      §6 needs that is recorded nowhere in the repo.
- [ ] An App Store distribution certificate and an `app.getmaru.ios` App Store
      provisioning profile on this Mac.
- [ ] Upload the first build (§6), then create the `Internal` TestFlight group.
      Internal builds skip Beta App Review.
- [ ] A lawyer's read of the privacy policy and terms (A6); both still say
      draft.

### One risk worth naming before the upload

A build carrying the placeholder client id runs on fixture data and would be
rejected under guideline 2.1 as non-functional. The real iOS client id exists
(`docs/IOS.md`); export `VITE_MARU_IOS_GOOGLE_CLIENT_ID` before archiving.

~~Follow-up after I8 merges: retake the six store screenshots from the native
build so they show the Liquid Glass tab bar, not the web one (the composer
in `scripts/store-screenshots.mjs` captures the browser build).~~ **Done
2026-09-01.** All six sources are now full-scale 1179 × 2556 captures from
the demo simulator build on a light iPhone 16, so the inbox and settings
frames carry UIKit's Liquid Glass bar. `scripts/store-screenshots.mjs` grew a
`--from-dir` mode that composes from existing PNGs and refuses a source that
is too small or the wrong shape; the browser path is still there for a quick
recompose. `docs/APP-STORE.md` §5 records how the captures are taken.

## TestFlight lane, attempt 1 — 2026-09-01. Superseded, kept for the errors

The whole path was run end to end on this Mac. It gets as far as a correct,
real-mode App Store archive and stops at code signing. Nothing in the repo is
in the way; one permission on the API key is. Detail and verbatim errors are in
[`docs/APP-STORE.md`](../../docs/APP-STORE.md) §6, which is now a record of a
run rather than a plan.

### Done

- **The archive.** `src-tauri/gen/apple/build/wren_iOS.xcarchive`, release,
  `arm64`, from `npm run tauri -- ios build --export-method app-store-connect`.
  Version **0.1.8**, build number **0.1.8** (`CFBundleVersion` in the tracked
  `src-tauri/gen/apple/project.yml`; increment it there before upload two).
- **Real mode, verified.** The real iOS client id is in `dist/`, no
  `PLACEHOLDER` anywhere in it, and the Rust binary that embeds `dist/` was
  compiled after it. So the guideline 2.1 risk this ticket named is closed for
  this archive.
- **Export compliance, verified in the artifact.** `ITSAppUsesNonExemptEncryption
  = false` is in the archived `Maru.app/Info.plist`, not merely in the hook's
  output. `UIBackgroundModes = remote-notification` and the OAuth callback
  scheme are there with it.
- **The internal tester group exists.** `Maru internal`, id
  `c643921a-f60e-4ab5-8f9a-de40b5c84e34`, internal, feedback on, automatic
  distribution of every new build on. Made over the API with the same key.
- **Two build traps written down** in §6: the generated Info plist must be
  written before Tauri parses the config, and nothing but the Tauri CLI can
  drive this archive.

### The API key, no longer an open question

`~/.wren-release/AuthKey_PTF7XH7JWF.p8` is an App Store Connect API key. Key id
`PTF7XH7JWF`, issuer `52f4e617-a4b3-4cee-bcd0-23f8e653d7b5`.

**It could:** read the app record, builds, certificates, profiles, bundle ids
and users; create, configure and delete TestFlight beta groups; authenticate
`altool` (proved with `--list-apps`, which listed the team's apps).

**It could not:** create a signing certificate. `POST /v1/certificates` with a
locally generated CSR answers `403 FORBIDDEN_ERROR` — "You are not allowed to
perform this operation." And `xcodebuild -exportArchive` with the same key
answers:

> Cloud signing permission error … You haven't been given access to
> cloud-managed distribution certificates. Please contact your team's Account
> Holder or an Admin to give you access.

followed by `No profiles for 'app.getmaru.ios' were found`. There is no iOS
distribution identity in any keychain on this Mac either — `security
find-identity -v` returns only the Developer ID Application certificate — so
the manual route is closed the same way.

### Owner-only, and it is one item

- [ ] **Give the key cloud signing, or put a distribution identity on this Mac.**
      App Store Connect → Users and Access → Integrations → App Store Connect
      API → the `PTF7XH7JWF` row → **Access to Cloud Managed Distribution
      Certificate**. Or Xcode → Settings → Accounts → Manage Certificates →
      **+** → Apple Distribution. Either one, then re-run the block in §6
      verbatim and the export, the upload and TestFlight all follow with no
      further owner step.
- [ ] Add a tester to `Maru internal`. It has none. `nicholasgalang@gmail.com`
      is Account Holder and Admin and qualifies as an internal tester.
- [ ] Test Information on the group — feedback email, marketing URL, privacy
      policy. Not required for internal testing; required before external.

The reviewer-account items further up this page are unchanged and are not on
the TestFlight path — internal builds need no Beta App Review.

## Signing key — 2026-09-02

`wren-notary` (PTF7XH7JWF) holds the Developer role and Apple keys cannot gain
services after creation, so a new team key **"Maru release" `G52RSWR37N`**
(Admin) was generated in App Store Connect with Nick's go-ahead; Admin keys
carry cloud-managed distribution signing. It lives at
`~/.wren-release/AuthKey_G52RSWR37N.p8` once downloaded (never in git). The
export block in `docs/APP-STORE.md` §6 uses it; `wren-notary` stays for
notarization.

## TestFlight lane, attempt 2 — 2026-09-01. Shipped

Build **0.1.8** is on TestFlight and distributed to Nick. The Admin key was the
whole fix; nothing in the repo changed. `docs/APP-STORE.md` §6 is now a record
of a run that completed, with every command verbatim.

| | |
| --- | --- |
| Version / build number | `0.1.8` / `0.1.8` — `CFBundleVersion` in `src-tauri/gen/apple/project.yml`. Apple accepted it, so **no increment was needed**. Increment before the next upload. |
| Archive | `src-tauri/gen/apple/build/wren_iOS.xcarchive` — release, `arm64`, `** BUILD SUCCEEDED **` |
| Export | Succeeded. Cloud signing minted the certificate and the `app.getmaru.ios` App Store profile with `-allowProvisioningUpdates`. No manual certificate, no keychain identity. |
| `.ipa` | `src-tauri/gen/apple/build/arm64/Maru.ipa`, 8,674,600 bytes |
| Upload | `UPLOAD SUCCEEDED with no errors`, Delivery UUID `36f6be5b-2805-4047-9cf7-8f7abbe89bce` |
| Build id | `36f6be5b-2805-4047-9cf7-8f7abbe89bce` — the delivery UUID *is* the build id |
| Processing | `PROCESSING` → `VALID` in under two minutes |
| Export compliance | `usesNonExemptEncryption: false` came back on its own. No `PATCH` needed — the answer is in the binary. |
| Group | Automatic distribution put the build in `Maru internal` with no step taken |
| Tester | Nick, `nicholasgalang@gmail.com`, tester id `6317b3f3-891a-44d4-b373-b9e83872c14b`, state `INVITED` |

### The keys, and which does what

- **`G52RSWR37N` "Maru release", Admin** — signing, export, `altool`, TestFlight.
  Everything on this lane.
- **`PTF7XH7JWF` "wren-notary", Developer** — notarization only. It cannot sign
  a distribution build, which is what stopped attempt 1.

Apple keys cannot gain services after creation, so the Developer key could not
be upgraded. Both are in `~/.wren-release/`, neither in git.

### Two corrections to what attempt 1 wrote down

- **`PLACEHOLDER` does appear in `dist/`.** It is the sentinel the demo-mode
  test compares the configured client id against. "No `PLACEHOLDER` anywhere in
  `dist/`" was never a true statement. Check that the *configured* id is not the
  sentinel instead.
- **`GET /v1/builds/{id}/betaGroups` answers `403`** even on the Admin key. Ask
  the group for its builds.

### Third build trap, now recorded

A failed export leaves `src-tauri/gen/apple/build/` behind, so the next run can
export a stale archive while looking like it succeeded. `rm -rf
src-tauri/gen/apple/build` before every archive.

### Still open — none of it blocks the internal beta

- [ ] **Test Information on the group** — feedback email, marketing URL, privacy
      policy. Required only before an external group.
- [ ] Nick accepts the TestFlight invite on his device. State is `INVITED`.

The reviewer-account items further up this page are unchanged and are not on the
TestFlight path — internal builds need no Beta App Review.
