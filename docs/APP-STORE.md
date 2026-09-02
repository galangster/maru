# App Store Connect — "Maru Mail"

Ticket I6. Everything on this page is ready to paste into App Store Connect
as written. Anything an agent must not invent is marked `«NICK: …»` and is
listed again at the end.

| | |
| --- | --- |
| App name (store) | **Maru Mail** — "Maru" was taken by another app |
| Home-screen name | **Maru** (`CFBundleDisplayName`; unchanged) |
| Apple ID | 6807633550 |
| Bundle id | `app.getmaru.ios` |
| SKU | `maru-ios` |
| Team | 2M8UE59WH7 |
| Primary language | English (U.S.) |
| Version at first upload | 0.1.8 (`src-tauri/tauri.conf.json`) |

---

## 1. Listing copy

### Subtitle (30 characters)

```
One quiet inbox for your Gmail
```

Exactly 30. "Gmail" is a Google trademark; this is descriptive, referential
use of the kind Google's brand guidelines allow and the same shape other
Gmail clients ship with. If App Review objects under 4.1 or 5.2.1, the
drop-in replacement — also exactly 30 — is:

```
Your mail, quiet and on-device
```

### Promotional text (170 characters)

Editable without a new build, so this is the field to change when the beta
opens up or push lands.

```
Every Gmail account in one quiet inbox. No telemetry, no ads, nothing reading over your shoulder. Free and open source; the optional sync account is billed on the web.
```

167 characters.

### Description (4,000 max — this is 2,240)

Sentence case throughout. Every "not yet" below is load-bearing: it is what
keeps the listing honest while push (I4) and Google's verification are still
outstanding, and it is cheaper than a rejection under 2.3.1.

```
Maru Mail is a quiet mail client for Gmail. It puts every Gmail account you have into one inbox, keeps that mail on your iPhone, and asks nothing else of you.

It is not trying to be a productivity system. It is trying to be a good inbox.

WHAT IT DOES

• One unified inbox across all your Gmail accounts, and a view for each account on its own.
• Swipe to archive. Swipe the other way for Later, and the thread comes back when you asked rather than when it feels like it.
• Threads read as a conversation: the newest message open, the older ones folded away until you want them.
• Write, reply, reply all and forward, with attachments, from the account you meant to send from.
• Search with real operators — from:, to:, subject:, has:attachment, is:unread.
• Pull to refresh, offline reading, Dynamic Type, VoiceOver, dark mode.

WHERE YOUR MAIL LIVES

On your phone, and at Google. Maru runs no mail server, and your mail never passes through anything of ours. There is no telemetry in this app: no analytics, no crash reporter phoning home, no advertising identifier. Remote images in a message load by default and can be switched off in Settings in one tap.

THE MARU ACCOUNT, WHICH IS OPTIONAL

One email and one password that carry your settings and your Gmail account list to a new device. They travel as a vault the service cannot read, because it holds no key that opens it. Your mail is never in that vault.

The account is $5 a month or $50 a year after a fourteen-day trial with no card up front, and it is bought and managed on getmaru.app. There is nothing to buy inside this app. Maru works completely without an account.

BEING STRAIGHT WITH YOU

Maru is weeks old and in a private beta.

• You need a Gmail account. Maru does not support other mail providers.
• Gmail sign-in is invitation-only while Google finishes reviewing Maru's sign-in.
• There are no background push notifications yet. Mail arrives when you open the app or pull to refresh.
• Later is kept on the device that deferred the thread, so a thread you put off here is still in the inbox on your Mac.

FREE, AND OPEN

Maru is free software under the AGPL. Every claim on this page can be checked, because the source is public at github.com/galangster/maru.
```

### Keywords (100 max, comma-separated, no spaces after commas)

```
email,inbox,mail client,unified inbox,snooze,triage,privacy,local,offline,agent,mcp,quiet,secure
```

96 characters. **No "gmail" and no "google".** App Store Review Guideline
5.2.1 and the Search Optimization rules treat another company's trademark in
the keyword field as misuse, and it is a common metadata rejection. The word
belongs in the subtitle and the description, where it is referential and
descriptive, not in the field whose only purpose is search capture. Do not
add competitor names either ("superhuman", "spark", "hey") for the same
reason.

### URLs and identity

| Field | Value |
| --- | --- |
| Support URL | `https://getmaru.app/support` — page shipped at `site/support/index.html` |
| Marketing URL | `https://getmaru.app` |
| Privacy Policy URL | `https://getmaru.app/privacy` |
| Copyright | `2026 The Creative Co. Marketing Firm LLC` |
| Primary category | Productivity |
| Secondary category | Utilities |
| Contains ads | No |
| Content rights | Contains no third-party content |

Productivity primary, Utilities secondary: Apple lists no "Mail" category, and
every comparable client (Spark, Mimestream, Edison) sits in Productivity.

### Age rating — 4+

Answer every content question **None** and every yes/no **No**. The full set:

| Question | Answer |
| --- | --- |
| Cartoon or fantasy violence · realistic violence · prolonged graphic violence | None |
| Profanity or crude humor · mature/suggestive themes · horror/fear themes | None |
| Sexual content or nudity · graphic sexual content | None |
| Alcohol, tobacco, or drug use or references | None |
| Simulated gambling · contests | None |
| Medical/treatment information | None |
| Unrestricted web access | **No** |
| Gambling and contests | No |
| Age Assurance / age verification in app | No |
| In-app purchases | No |
| Capabilities: messaging, user-generated content sharing | see below |

Two answers are judgement calls, both recorded rather than left implicit:

- **Unrestricted web access — No.** Maru has no in-app browser. A link in a
  message opens in the system browser through the opener plugin, which is
  outside the app. The message body itself renders in a sandboxed frame with
  no scripts, no frames, and no navigation.
- **Messaging / user-generated content.** Apple's newer questionnaire asks
  whether people can communicate or share content. For an email client the
  literal answer is yes, and Apple still rates Mail, Gmail and Spark 4+;
  person-to-person mail is not the "user-generated content" of guideline 1.2,
  which means content published to other users of the app. Answer the
  capability questions truthfully if asked, keep the rating at 4+, and if
  App Review pushes back, the reply is that Maru shows a person only their
  own mailbox and publishes nothing.

---

## 2. App Privacy — the nutrition label

The questionnaire asks, per data type: is it **collected**, is it **linked to
the user's identity**, is it used for **tracking**, and what are the
**purposes**. Answers below are for the iOS app only.

**Tracking: No, for every data type.** Maru shows no ads, embeds no ad or
analytics SDK, never touches the advertising identifier, shares nothing with
data brokers, and therefore presents no App Tracking Transparency prompt.

### Collected

| Data type (Apple's category) | Collected | Linked to identity | Tracking | Purposes | The justification, as written |
| --- | --- | --- | --- | --- | --- |
| Contact Info → **Email Address** | Yes | Yes | No | App Functionality, Account Management | "The email address identifies the optional Maru account. It is used to sign in, to send account and billing mail, and to answer support. It is collected only if a person creates an account; the app is fully usable without one." |
| Identifiers → **Device ID** | Yes | Yes | No | App Functionality | "When a person signs in to a Maru account, the app registers a device name and a device identifier so the account's device list can show which devices hold a session and so any of them can be revoked. It is not used for advertising or measurement." |
| Other Data → **Other Data Types** | Yes | Yes | No | App Functionality | "An encrypted vault holding the person's app settings, their Gmail account list and their Gmail sign-ins. It is encrypted on the device before it is sent. The service stores ciphertext and holds no key that can open it, so it cannot read any of it." |

### Not collected — and why each one is a real answer, not an omission

| Data type | Answer | Why |
| --- | --- | --- |
| User Content → **Emails or Text Messages** | Not collected | Mail moves between the device and Google over the person's own OAuth grant. No message, header, body, attachment, subject, or message id ever reaches a Maru server. Nothing is proxied. |
| User Content → Photos, Videos, Audio, Gameplay, Customer Support, Other | Not collected | Attachments are handled on the device and go to Google with the message. Support is ordinary email to `support@getmaru.app`, outside the app. |
| Contacts | Not collected | Recipient suggestions come from mail already on the device. The app never reads the iOS address book. |
| Usage Data (product interaction, advertising data) | Not collected | There is no analytics of any kind in the app. |
| Diagnostics (crash data, performance, other) | Not collected | No crash reporter and no performance SDK. The debug log stays on the device and is exported only if a person exports it. |
| Identifiers → User ID | Not collected | The account id is generated by the service and never leaves it as an identifier the app reports. |
| Purchases / Financial Info | Not collected | The app sells nothing and shows no purchase control. Checkout runs on getmaru.app in the browser. **The Stripe customer id is created and stored server-side and is never handled by the app**, so it is not collected by the app. |
| Location, Health & Fitness, Sensitive Info, Browsing History, Search History | Not collected | None of it is touched. In-app search runs against the local index only. |

### Third parties, for the "data collected by third-party partners" question

- **Google.** Mail flows directly between the device and Google's API under
  the person's own OAuth grant. Google's handling is governed by the
  person's Google account, not by Maru. This is disclosed on the privacy
  policy page rather than declared as Maru's own collection, because Maru
  neither receives nor stores it.
- **Stripe.** Web only. The app never opens a payment sheet, never posts a
  payment field, and never sees a card.
- **No advertising, attribution, analytics, or A/B SDK is present.** Grep the
  dependency list: there is nothing to declare.

---

## 3. Export compliance

**Answer set for the "Does your app use encryption?" flow:**

| Question | Answer |
| --- | --- |
| Does your app use encryption? | **Yes** |
| Does it qualify for any of the exemptions in Category 5, Part 2? | **Yes** |
| Does your app use only encryption exempt under Note 4 / limited to authentication, or standard encryption algorithms accepted as international standards? | **Yes — standard algorithms only** |
| Does your app implement any proprietary or non-standard encryption? | **No** |
| Is your app designed to use cryptography for a purpose other than protecting the app's own data and communications? | **No** |
| Is your app available in France? | Yes (no separate French declaration is required for an exempt app) |
| Result | Exempt. No CCATS, no year-end self-classification report. |

**What Maru actually uses:** AES-GCM through the platform's own crypto
(CryptoKit / CommonCrypto by way of the system `crypto.subtle`) for the
account vault, PBKDF2/HKDF key derivation from the same source, and HTTPS/TLS
through the system networking stack for every request to Google and to the
Maru service. All of it is standard and published. Maru implements no cipher
of its own.

**Where it is set — and it is already set.** `ITSAppUsesNonExemptEncryption`
is now written into the generated Info.plist by the existing iOS build hook,
beside the OAuth URL scheme:

- `src-tauri/scripts/prepare-ios-oauth.mjs` emits the key as `<false/>`.
- The hook runs from `beforeBuildCommand` in `src-tauri/tauri.ios.conf.json`.
- The output lands in `src-tauri/Info.ios.generated.plist`, which
  `bundle.iOS.infoPlist` merges into the app.

The comment in the hook records why, and says what would invalidate it. With
the key present, App Store Connect stops asking on every upload and no
TestFlight build is ever held at "Missing Compliance".

Verify after any hook change:

```sh
node --import tsx src-tauri/scripts/prepare-ios-oauth.mjs \
  && plutil -p src-tauri/Info.ios.generated.plist | grep ITSAppUsesNonExemptEncryption
```

---

## 4. App Review — the Notes field

Paste as-is once the two placeholders are filled.

```
WHAT YOU WILL SEE

Maru Mail is a mail client for Gmail, and only for Gmail. It supports no other
mail provider, so the app cannot be reviewed without signing in to a Google
account. On first launch the app offers a demo built on fixture data; the
review account below reaches the real product.

Google has not finished verifying Maru's OAuth client, so Google restricts
sign-in to an allow-list. The reviewer address below has been added to it. If
Google shows an "unverified app" warning, choose Advanced and continue — the
warning is about Google's review of our client, not about this app.

SIGN-IN

  Google account: «NICK: reviewer Google address»
  Password:       «NICK: password»

  Two-factor: «NICK: how the reviewer receives the 2FA code, or "disabled on
  this account">

WHAT TO DO

1. Open the app. Go to Settings, then "Add Gmail account".
2. Sign in with the address above in the Google sheet that appears.
3. The inbox fills from that mailbox. Tap a thread to read it, swipe a row
   left to archive, swipe right for Later, and use the compose button to
   write.

THE OPTIONAL MARU ACCOUNT

Settings > Maru account is a paid sync service for settings and sign-ins, sold
and managed only on getmaru.app in a web browser. The app contains no purchase
control and no price; the account screen links out to the website to manage a
subscription, which is why guideline 3.1.1 does not apply — nothing digital is
unlocked inside the app by that purchase, and the app is fully functional
without an account. The account above is comped, so no payment is needed to
review any of it.

WHAT IS NOT IN THIS BUILD

There are no push notifications yet; mail arrives on open and on pull to
refresh. "Later" is stored per-device on purpose in this version.

PRIVACY

Mail moves directly between the device and Google. It does not pass through
any server of ours, and there is no analytics of any kind in the app. The
source is public at github.com/galangster/maru.

Questions: support@getmaru.app
```

**Also on the App Review page:** "Sign-in required" — Yes. Contact first name,
last name, phone and email are `«NICK: review contact details»`. Attach no
demo video; the flow above is enough.

---

## 5. Screenshots

Six frames per size, in this order, produced by `scripts/store-screenshots.mjs`:

| # | Screen | Caption |
| --- | --- | --- |
| 01 | Inbox | Every Gmail account in one quiet inbox. |
| 02 | Thread | A conversation, not a pile of replies. |
| 03 | Compose (a prefilled reply) | Write from the account you meant to write from. |
| 04 | Later sheet | Not now. Bring it back when you asked. |
| 05 | Maru account | One password carries your setup to a new device. |
| 06 | Settings | No telemetry. Mail goes only to Google. |

Output, all light theme, Maru's ground `#F6F4F3`, captions in Open Runde
Semibold over DM Sans sub-lines, per `docs/design/DIRECTION.md` §3 and §4:

| Directory | Size | Apple slot |
| --- | --- | --- |
| `wayfinder/captures/store/6.5/` | 1284 × 2778 | 6.5" display |
| `wayfinder/captures/store/6.9/` | 1320 × 2868 | 6.9" display |
| `wayfinder/captures/store/device/` | 1179 × 2556 | source frames, not for upload |

**One thing to know about the source pixels.** The simulator captures in
`wayfinder/captures/ios/` are 393 × 852 — one pixel per point, not the
1179 × 2556 an iPhone 16 actually renders. Nothing at that size can fill a
6.5" or 6.9" canvas, and upscaling a screenshot is the one thing a store
asset must never be. So every source frame is 1179 × 2556 of real pixels, and
the composer only ever scales it *down* (to 1040 px and 1070 px wide) onto
the canvas beneath its caption. No pixel in either set is invented.

**The shipped frames come off the phone, not the browser.** The bottom chrome
on iPhone is UIKit's Liquid Glass tab bar, and only the native build draws it
— a browser capture shows the web tab bar that the phone no longer uses. So
the six sources are taken from the demo simulator build (`docs/IOS.md`,
"Build and run") on a light-appearance iPhone 16, and `--from-dir` composes
from them. FlowDeck's own screenshot returns 393 × 852 points and its frame
capture goes through a lossy video codec, so neither can produce a store
source pixel; drive Simulator.app's own **File ▸ Save Screen** instead
(`flowdeck ui mac hotkey cmd+s --app com.apple.iphonesimulator`), which
writes a lossless 1179 × 2556 PNG to the Desktop. Set a clean status bar
first with `flowdeck simulator status-bar override -S "iPhone 16" --time
"9:41"`. The composer rejects any source that is too small or the wrong
shape, so a 393 × 852 capture cannot reach a canvas by mistake.

```sh
node scripts/store-screenshots.mjs --from-dir <dir-with-the-six-pngs>
```

The browser path still works for a quick recompose when no simulator is at
hand, and it shows the web tab bar, so it is not what ships:

```sh
node scripts/store-screenshots.mjs
```

It runs its own vite on port 1436 — not 1420 — so a sibling worktree's dev
server can never be captured by mistake.

Apple accepts the 6.9" set alone and derives the rest, but supplying both
avoids letter-boxed thumbnails on older devices. No 5.5" set is needed: the
minimum deployment target is iOS 17.0, which no 5.5" device runs.

---

## 6. TestFlight — the first upload from this Mac

**Done 2026-09-01.** Build **0.1.8** is on TestFlight, `VALID`, distributed to
the internal group, with Nick invited. Xcode 26.6, tauri-cli 2.11.4. Everything
below ran; the commands are verbatim.

The first attempt this day got a correct archive and then failed the export
with "Cloud signing permission error", because the key it used
(`PTF7XH7JWF`, Developer role) cannot mint distribution certificates. The fix
was a new key, not a repo change.

### The API key, settled

Two keys, and they do different jobs. Never mix them up.

| Key | Role | Use it for |
| --- | --- | --- |
| `G52RSWR37N` "Maru release" | **Admin** | Everything here — archive signing, export, `altool`, TestFlight |
| `PTF7XH7JWF` "wren-notary" | Developer | Notarization only. It cannot sign a distribution build |

Both live in `~/.wren-release/` and neither is in git. Issuer for both is
`52f4e617-a4b3-4cee-bcd0-23f8e653d7b5`.

Apple keys cannot gain services after they are created, so the Developer key
could not be upgraded — the Admin key had to be new. Admin carries
cloud-managed distribution signing, which is the one permission the export
needs. With it, `-allowProvisioningUpdates` mints the certificate and the
`app.getmaru.ios` App Store profile on its own. No certificate and no profile
had to be made by hand, and no distribution identity had to be put in the
keychain.

### The three traps, in the order you meet them

**1. The prepare hook must run before Tauri, not inside it.** On a clean tree
`npm run tauri -- ios build` dies before it does anything:

```
failed to parse plist from Info.ios.generated.plist:
  Io(Os { code: 2, kind: NotFound, message: "No such file or directory" })
```

Tauri reads `bundle.iOS.infoPlist` while it parses the config, which is
*before* it runs `beforeBuildCommand` — and `beforeBuildCommand` is the only
thing that writes that file. The file is generated, so it is not in git, so
every fresh clone and every fresh worktree hits this. Run the hook by hand
once first. It is idempotent and the build runs it again.

**2. Nothing but the Tauri CLI can drive this archive.** The Xcode project's
"Build Rust Code" phase talks to a live Tauri CLI socket (`docs/IOS.md`), so a
bare `xcodebuild … archive` on `wren.xcodeproj` cannot compile it. Drive the
archive with `tauri ios build` and, if you need a different export, re-export
the archive it leaves behind.

**3. A failed export leaves the archive behind.** `src-tauri/gen/apple/build/`
survives a failed run, so the next run can hand you a stale `wren_iOS.xcarchive`
and an even staler `Maru.ipa` while looking like it succeeded. `rm -rf
src-tauri/gen/apple/build` before every archive, and check the mtimes after.

### What actually ran

```sh
export PATH="$HOME/.cargo/bin:$PATH"
export VITE_MARU_IOS_GOOGLE_CLIENT_ID="537601059334-302klho3gdlj3kloseb6akr96o26r855.apps.googleusercontent.com"

# Trap 1. Writes src-tauri/Info.ios.generated.plist.
node --import tsx src-tauri/scripts/prepare-ios-oauth.mjs

# Trap 3.
rm -rf src-tauri/gen/apple/build

# Tauri turns these three into
#   -allowProvisioningUpdates -authenticationKeyID
#   -authenticationKeyPath -authenticationKeyIssuerID
# on both the xcodebuild archive and the -exportArchive.
export APPLE_API_KEY=G52RSWR37N
export APPLE_API_ISSUER=52f4e617-a4b3-4cee-bcd0-23f8e653d7b5
export APPLE_API_KEY_PATH="$HOME/.wren-release/AuthKey_G52RSWR37N.p8"
export CI=true

npm run tauri -- ios build --export-method app-store-connect
```

It ends with `** BUILD SUCCEEDED **`, then:

```
Signing …/build/wren_iOS.xcarchive/Products/Applications/Maru.app/Maru
Exported wren_iOS to: …/src-tauri/gen/apple/build
    Finished 1 iOS Bundle at:
        …/src-tauri/gen/apple/build/arm64/Maru.ipa
```

The archive lands at `src-tauri/gen/apple/build/wren_iOS.xcarchive` and the
`.ipa` — 8,674,600 bytes — beside it under `arm64/`. Verified in the archived
`Maru.app/Info.plist`, not in the hook's output:

| | |
| --- | --- |
| `CFBundleIdentifier` | `app.getmaru.ios` |
| `CFBundleShortVersionString` | `0.1.8` |
| `CFBundleVersion` (the build number) | `0.1.8` for the first build. **Set it in `src-tauri/tauri.ios.conf.json` as `bundle.iOS.bundleVersion`.** `tauri ios build` rewrites `wren_iOS/Info.plist` on every run from the Tauri config, so an edit to `project.yml` or to the plist itself is overwritten and ships the old number (learned 2026-09-02: two build-2 uploads carried `0.1.8` again and App Store Connect dropped both without a build row). The second build is `2`, the third `3`. |
| `ITSAppUsesNonExemptEncryption` | `false` |
| Real mode | `dist/assets/env-*.js` carries the real client id, and the Rust binary that embeds `dist/` was compiled after it (22:06:23 → 22:08:13) |

**`PLACEHOLDER` in `dist/` is not a failure.** The env bundle defines
`` `PLACEHOLDER${`.apps.googleusercontent.com`}` `` as the sentinel that the
demo-mode test compares against. Real mode means the *configured* client id is
not that sentinel, which is what to check — an earlier note in this section
said "no `PLACEHOLDER` anywhere in `dist/`", and that was never true. Also do
not go looking for the client id with `grep` inside `Maru.app`: Tauri embeds
the web assets in the binary compressed, `Maru.app/assets/` is empty, and the
string is not there to find.

### The upload

`altool` searches `./private_keys`, `~/private_keys`, `~/.private_keys`,
`~/.appstoreconnect/private_keys` and `$API_PRIVATE_KEYS_DIR` for
`AuthKey_<key id>.p8`. Copy the key, never `cat` it:

```sh
mkdir -p ~/.private_keys
cp ~/.wren-release/AuthKey_G52RSWR37N.p8 ~/.private_keys/AuthKey_G52RSWR37N.p8

xcrun altool --upload-app -t ios \
  -f src-tauri/gen/apple/build/arm64/Maru.ipa \
  --apiKey G52RSWR37N \
  --apiIssuer 52f4e617-a4b3-4cee-bcd0-23f8e653d7b5
```

Verbatim:

```
UPLOAD SUCCEEDED with no errors
Delivery UUID: 36f6be5b-2805-4047-9cf7-8f7abbe89bce
Transferred 8674600 bytes in 0.333 seconds (26.1MB/s, 208.615Mbps)
```

The delivery UUID **is** the build id. Poll
`GET /v1/builds?filter[app]=6807633550` on the same key and read
`processingState`. It went `PROCESSING` → `VALID` in **under two minutes**,
well inside the ten the old note guessed.

Export compliance needed no API call. `usesNonExemptEncryption` on the build
came back `false` on its own, because the answer is in the binary. If a future
upload ever stalls at "Missing Compliance", the fix is
`PATCH /v1/builds/{id}` with `{"data":{"type":"builds","id":"{id}",
"attributes":{"usesNonExemptEncryption":false}}}`.

### The internal group

Group `Maru internal`, id `c643921a-f60e-4ab5-8f9a-de40b5c84e34`, internal,
feedback on, and **automatic distribution of every new build on**.

```
POST /v1/betaGroups
{ "data": { "type": "betaGroups",
    "attributes": { "name": "Maru internal",
                    "isInternalGroup": true,
                    "hasAccessToAllBuilds": true },
    "relationships": { "app": { "data": { "type": "apps",
                                          "id": "6807633550" } } } } }
```

`hasAccessToAllBuilds` is create-only. A `PATCH` carrying it is refused with
`409 ENTITY_ERROR.ATTRIBUTE.NOT_ALLOWED`, so if that flag is ever wrong the fix
is to delete the group and make it again.

**Automatic distribution worked.** `GET /v1/betaGroups/{group}/builds` lists
build `36f6be5b-…` with no step taken to put it there.

Nick was added as the first internal tester, before the build landed:

```
POST /v1/betaTesters
{ "data": { "type": "betaTesters",
    "attributes": { "email": "nicholasgalang@gmail.com",
                    "firstName": "Nick", "lastName": "Galang" },
    "relationships": { "betaGroups": { "data": [ { "type": "betaGroups",
                        "id": "c643921a-f60e-4ab5-8f9a-de40b5c84e34" } ] } } } }
```

`201`, tester id `6317b3f3-891a-44d4-b373-b9e83872c14b`, state `INVITED`. An
internal tester must hold an App Store Connect role; Nick is Account Holder and
Admin, so he qualifies. Find the user with `GET /v1/users` — emails are visible
there. Up to 100 internal testers, 30 devices each.

`GET /v1/builds/{id}/betaGroups` answers `403` even on the Admin key. Ask the
group for its builds instead, not the build for its groups.

Still open on the group, and not on the path to an internal build:

- **Test Information.** Feedback email `support@getmaru.app`, marketing URL
  `https://getmaru.app`, privacy policy `https://getmaru.app/privacy`. Not
  required for internal testing; required before any external group.

Builds expire after 90 days. Move to an **external** group only when the beta
widens — that one needs Beta App Review, and the "Google restricts sign-in to
an allow-list" caveat has to reach the testers, or the first three of them
will report the unverified-app screen as a bug.
---

## 7. What is owner-only

Nothing below can be done by an agent, and nothing below should be guessed.

| | |
| --- | --- |
| `«NICK: reviewer Google address»` | A dedicated Google account for App Review. Needs a phone number to create. |
| `«NICK: password»` | Its password, and how the reviewer gets a 2FA code — or 2FA disabled on that account. |
| Allow-list the reviewer | `server/scripts/allow.ts` for the Maru side; the Google Cloud OAuth consent screen's test-user list for the Google side. |
| Comp the reviewer's Maru account | `server/scripts/allow.ts comp <email>`. |
| `«NICK: review contact details»` | First name, last name, phone, email on the App Review page. |
| ~~API issuer id, and the key's kind~~ | **Settled 2026-09-01.** Issuer `52f4e617-a4b3-4cee-bcd0-23f8e653d7b5`. `AuthKey_G52RSWR37N.p8` (Admin) signs, exports, uploads and manages TestFlight. `AuthKey_PTF7XH7JWF.p8` (Developer) is notarization only. |
| ~~Cloud signing on the API key~~ | **Closed 2026-09-01.** The Admin key `G52RSWR37N` carries cloud-managed distribution signing, so the export, the upload and TestFlight all ran with no owner step. §6. |
| A lawyer's read | The privacy policy and terms are still marked draft (ticket A6). Apple requires the URL, not the review — but it is the same text Google's OAuth verification reads. |
