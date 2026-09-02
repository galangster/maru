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
