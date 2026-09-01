# Google OAuth verification answers

## Assessment determination request

> Maru is an installed desktop email client. Maru fetches Gmail data directly from Google and stores it on the user's device. Optional Maru Sync stores an end-to-end encrypted vault containing settings, account addresses, and Gmail refresh tokens. The service receives ciphertext but no key that can open it, and it never receives Gmail message content. Maru also offers an optional local MCP socket. A user can create an agent credential and grant selected capabilities. Maru then returns requested mail data to that user-selected client. Some clients can use a hosted model provider. Maru discloses both paths and requires contextual user consent. We request confirmation whether ciphertext-only refresh-token custody or the optional hosted-agent path requires a security assessment.
>
> If Google determines that ciphertext-only refresh-token custody requires a security assessment, Maru will complete that assessment or disable Maru Sync before public launch. If Google determines that the optional hosted-agent path requires one, Maru will complete it or disable shared-client agent access before public launch.

This statement amends the earlier local-only determination request with the ratified encrypted-vault architecture in `docs/spec/MARU-ACCOUNT.md`.

## Reviewer form answers

### App identity

**App name:** Maru Mail. Source: `site/index.html:6-7` and `site/index.html:31-34`.

**Production Google Cloud project id:**

`maru-mail-prod` (project number 537601059334). Created 2026-08-30 with the agent driving; Gmail API enabled; separate from the Wren dev project.

**Desktop OAuth client id:**

`537601059334-su62jrimhnfg3lg5ql21uet30135mdll.apps.googleusercontent.com` — the only client in the project, type Desktop app, name "Maru Mail Desktop". The client secret was never stored anywhere: Maru's desktop OAuth is a public client (PKCE) and omits it.

**Name-collision and trademark review:**

Collision search run 2026-08-31 (web + Apple App Store + registered-mark
lookup; a search record, not a legal opinion):

- No existing product named "Maru Mail" in any store or search result.
- "MARU/MATCHBOX" (reg. 2018) is a market-research services mark; its owner
  rebranded to The Harris Poll UK in 2025. Different class, different field.
- "Maru OS" (maruos.com) is a dormant open-source Android/Linux convergence
  project — software, but not email, and no registered mark found.
- "Maru" is a common Japanese word (丸) used by many coexisting products
  across categories, which limits any single claim outside its own class.

Conclusion: no email-adjacent collision; impersonation risk to a reviewer is
low. The domain getmaru.app and consent-screen branding are consistent.

`«NICK: dated approval of the final Maru Mail identity on this evidence.»`

### Frozen reviewer release

The frozen reviewer build is `0.1.7` (source: `package.json:5`) — built,
signed, and notarized locally 2026-08-31 with the official client id baked
in; not yet published as a GitHub release. The public Download action points
to the repository's latest release page. Source: `site/index.html:34`.

`«NICK: fill at submission from the frozen release»`

Enter the exact app version, commit SHA, build SHA-256, signed DMG download link, and notarization result for the frozen reviewer build.

The repository's current release-page pattern is `https://github.com/galangster/maru/releases/latest`. The release workflow produces `src-tauri/target/release/bundle/dmg/*.dmg`. Sources: `site/index.html:34` and `.github/workflows/macos-release.yml:31-45`.

### Public URLs

| Purpose | Submission URL | Repository source |
| --- | --- | --- |
| Homepage | `https://getmaru.app/` | `site/index.html` |
| Privacy policy | `https://getmaru.app/privacy/` | `site/privacy.html` |
| Security and data flow | `https://getmaru.app/security/` | `site/security.html` |
| Support | `https://getmaru.app/support/google-data/` | `site/support/google-data.html` |
| Local deletion and Google revocation | `https://getmaru.app/support/google-data/` | `site/support/google-data.html:26-53` |

Verified 2026-08-31 by production curl: every URL above returns HTTP 200
with no authentication and zero redirects (the trailing-slash forms are
canonical; the bare forms 301 to them, which is why the table submits the
trailing-slash URLs). Re-run the same check on submission day.

### What Google data does Maru request?

Maru requests only `https://www.googleapis.com/auth/gmail.modify`. The code emits that one scope and rejects a partial grant that omits it. Sources: `src/core/auth/oauth.ts:16-17`, `src/core/auth/oauth.ts:126-151`, and `src/core/auth/oauth.ts:158-225`.

The complete method mapping is in `docs/security/google-oauth-method-scope-matrix.md`.

### Where does Maru store data?

Maru stores its local cache in SQLite on the device. It encrypts content fields with per-account AES-256-GCM keys from the operating-system keychain. OAuth tokens stay in the local keychain. If the user enables Maru Sync, the desktop refresh tokens also enter an end-to-end encrypted vault. The sync service stores only ciphertext and never receives its account key. Sources: `src/core/store/db.ts`, `src/core/crypto/keyring.ts`, `src/core/auth/oauth.ts`, and `src/core/account/`.

The complete field inventory is in `docs/security/google-oauth-data-inventory.md`.

### How does a reviewer install and authorize Maru?

1. Open `https://getmaru.app/` and choose **Download for macOS**.
2. Download the frozen signed DMG identified above.
3. Install and open Maru Mail.
4. On first run, choose **Connect Gmail**. The same flow is available at **Settings → Accounts → Add account**. Sources: `README.md:44-54`, `src/features/onboarding/onboarding.tsx:96`, and `src/features/settings/settings-dialog.tsx:353-363`.
5. Maru opens the system browser. Choose the reviewer Google account. Maru asks Google for offline access and forces account selection and consent. Source: `src/core/auth/oauth.ts:126-151` and `src/core/auth/oauth.ts:410-448`.
6. Confirm that the English Google consent screen shows **Maru Mail** and only `gmail.modify`.
7. Approve the Gmail permission. Google returns to Maru through a `127.0.0.1` loopback callback protected by PKCE and `state`. Source: `src/core/auth/oauth.ts:86-111` and `src/core/auth/oauth.ts:410-448`.
8. Maru reads `users.getProfile`, stores the token under the selected account, and starts sync. Sources: `src/core/auth/oauth.ts:450-457` and `src/core/service/real.ts:258-302`.

`«NICK: verify final consent-screen name, logo, domain, and one-scope display in the frozen reviewer build.»`

Attach the clean-account test record and exact reviewer account instructions.

> NOTE: `README.md:8-10` still describes the current macOS build as unsigned. Submit only the signed and notarized frozen reviewer release recorded above.

> NOTE: `docs/SETUP-GOOGLE-OAUTH.md:26-30` still describes the former two-scope BYO setup. Current code requests only `gmail.modify`. Do not give the outdated scope statement to reviewers.

### How does a reviewer delete local Google data?

Open **Settings → Accounts → Delete local Google data**. Confirm **Delete**. Maru removes every connected account's cached mail, tokens, and encryption keys from the device. Nothing at Google changes. Source: `src/features/settings/settings-dialog.tsx:309-324` and `src/features/settings/settings-dialog.tsx:365-405`.

To revoke Google access, follow `https://getmaru.app/support/google-data`. Source: `site/support/google-data.html:29-49`.

### Demo video package

`«NICK: link, transcript, shot list — plan §8»`

Add the accessible video link, verbatim transcript, and completed Part 1 shot list after the production consent screen and reviewer build are frozen.
