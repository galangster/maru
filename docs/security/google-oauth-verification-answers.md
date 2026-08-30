# Google OAuth verification answers

## Assessment determination request

> Wren is an installed desktop email client. Wren fetches Gmail data directly from Google and stores it on the user's device. Wren operates no server that receives Gmail content. Wren also offers an optional local MCP socket. A user can create an agent credential and grant selected capabilities. Wren then returns requested mail data to that user-selected client. Some clients can use a hosted model provider. Wren discloses this path and requires contextual user consent. We request confirmation whether this architecture requires a security assessment.
>
> If Google determines that the optional hosted-agent path requires a security assessment, Wren will complete that assessment or disable shared-client agent access before public launch.

The architecture statement and final sentence above are copied verbatim from `docs/research/shared-client-implementation-plan.md` Part 1 §1 and Part 2 §7.

## Reviewer form answers

### App identity

**App name:** Wren Mail. Source: `site/index.html:6-7` and `site/index.html:31-34`.

**Production Google Cloud project id:**

`«NICK: production project id»`

Enter the immutable project id from the production Google Cloud project.

**Desktop OAuth client id:**

`«NICK: desktop client id»`

Enter the client id for the only production Desktop OAuth client.

**Name-collision and trademark review:**

`«NICK: name-collision and trademark-review receipt — attach the dated approval for the final Wren Mail identity.»`

### Frozen reviewer release

The repository version is currently `0.1.0`. Source: `package.json:5`. The public Download action points to the repository's latest release page. Source: `site/index.html:34`.

`«NICK: fill at submission from the frozen release»`

Enter the exact app version, commit SHA, build SHA-256, signed DMG download link, and notarization result for the frozen reviewer build.

The repository's current release-page pattern is `https://github.com/galangster/wren/releases/latest`. The release workflow produces `src-tauri/target/release/bundle/dmg/*.dmg`. Sources: `site/index.html:34` and `.github/workflows/macos-release.yml:31-45`.

### Public URLs

| Purpose | Submission URL | Repository source |
| --- | --- | --- |
| Homepage | `https://wrenmail.io/` | `site/index.html` |
| Privacy policy | `https://wrenmail.io/privacy` | `site/privacy.html` |
| Security and data flow | `https://wrenmail.io/security` | `site/security.html` |
| Support | `https://wrenmail.io/support/google-data` | `site/support/google-data.html` |
| Local deletion and Google revocation | `https://wrenmail.io/support/google-data` | `site/support/google-data.html:26-53` |

`«NICK: verify all five public URL entries load without authentication or redirects before submission.»`

Record the production check date and attach the result for each URL.

### What Google data does Wren request?

Wren requests only `https://www.googleapis.com/auth/gmail.modify`. The code emits that one scope and rejects a partial grant that omits it. Sources: `src/core/auth/oauth.ts:16-17`, `src/core/auth/oauth.ts:126-151`, and `src/core/auth/oauth.ts:158-225`.

The complete method mapping is in `docs/security/google-oauth-method-scope-matrix.md`.

### Where does Wren store data?

Wren stores its local cache in SQLite on the device. It encrypts content fields with per-account AES-256-GCM keys from the operating-system keychain. OAuth tokens also stay in the keychain. Sources: `src/core/store/db.ts:41-185`, `src/core/crypto/keyring.ts:16-25`, and `src/core/auth/oauth.ts:256-301`.

The complete field inventory is in `docs/security/google-oauth-data-inventory.md`.

### How does a reviewer install and authorize Wren?

1. Open `https://wrenmail.io/` and choose **Download for macOS**.
2. Download the frozen signed DMG identified above.
3. Install and open Wren Mail.
4. On first run, choose **Connect Gmail**. The same flow is available at **Settings → Accounts → Add account**. Sources: `README.md:44-54`, `src/features/onboarding/onboarding.tsx:96`, and `src/features/settings/settings-dialog.tsx:353-363`.
5. Wren opens the system browser. Choose the reviewer Google account. Wren asks Google for offline access and forces account selection and consent. Source: `src/core/auth/oauth.ts:126-151` and `src/core/auth/oauth.ts:410-448`.
6. Confirm that the English Google consent screen shows **Wren Mail** and only `gmail.modify`.
7. Approve the Gmail permission. Google returns to Wren through a `127.0.0.1` loopback callback protected by PKCE and `state`. Source: `src/core/auth/oauth.ts:86-111` and `src/core/auth/oauth.ts:410-448`.
8. Wren reads `users.getProfile`, stores the token under the selected account, and starts sync. Sources: `src/core/auth/oauth.ts:450-457` and `src/core/service/real.ts:258-302`.

`«NICK: verify final consent-screen name, logo, domain, and one-scope display in the frozen reviewer build.»`

Attach the clean-account test record and exact reviewer account instructions.

> NOTE: `README.md:8-10` still describes the current macOS build as unsigned. Submit only the signed and notarized frozen reviewer release recorded above.

> NOTE: `docs/SETUP-GOOGLE-OAUTH.md:26-30` still describes the former two-scope BYO setup. Current code requests only `gmail.modify`. Do not give the outdated scope statement to reviewers.

### How does a reviewer delete local Google data?

Open **Settings → Accounts → Delete local Google data**. Confirm **Delete**. Wren removes every connected account's cached mail, tokens, and encryption keys from the device. Nothing at Google changes. Source: `src/features/settings/settings-dialog.tsx:309-324` and `src/features/settings/settings-dialog.tsx:365-405`.

To revoke Google access, follow `https://wrenmail.io/support/google-data`. Source: `site/support/google-data.html:29-49`.

### Demo video package

`«NICK: link, transcript, shot list — plan §8»`

Add the accessible video link, verbatim transcript, and completed Part 1 shot list after the production consent screen and reviewer build are frozen.
