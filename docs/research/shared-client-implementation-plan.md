# Shared Google OAuth client: adversarial audit and implementation plan

Date: 2026-08-30

This document audits option A: one verified Google OAuth client for official Wren builds, with bring-your-own OAuth as a supported override.

The audit covers the current implementation in [`oauth.ts`](../../src/core/auth/oauth.ts), the agent model in [`PERMISSION-MODEL.md`](../PERMISSION-MODEL.md), and Wren's [`README`](../../README.md).

## Executive verdict

Option A remains viable, but the current recommendation is not ready for submission.

The plan makes five material errors.

1. It treats the local MCP socket as proof that restricted data stays on-device. That is false for hosted agent clients.
2. It requests redundant scopes. `gmail.modify` alone authorizes every Gmail method Wren currently calls.
3. It does not address Google's 2026 rules for MCP consent, prompt injection, encryption, retention, and deletion.
4. It treats a shared client suspension as a quota problem. It is also an account-wide reauthorization incident.
5. It assumes a notice can keep AGPL forks from reusing the client ID. It cannot prevent deliberate reuse.

Proceed with option A only after the gates in Part 2 pass. Do not submit a categorical local-client exemption claim for the current gateway.

## Evidence and confidence

Google's current pages sometimes use different language for annual reverification and annual CASA reassessment. This plan assumes the stricter operational outcome until Google confirms otherwise.

All probability ranges below are planning estimates. They are speculation, not Google statistics.

| Label | Planning range |
| --- | ---: |
| Low | 10% to 30% |
| Medium | 30% to 60% |
| High | 60% to 85% |

# Part 1: adversarial audit

## Risk register

| Attack | Failure mode | Probability | Cost if it lands | Mitigation |
| --- | --- | --- | --- | --- |
| The gateway voids the CASA exemption | Google treats hosted agent processing as restricted data passing through a third-party server. | High reviewer inquiry. Medium exemption denial. Speculation. | Submission delay, CASA, or removal of shared-client agent access. | Show the complete data path. Request a determination. Do not claim that all agent processing is local. |
| Standing agent grants fail Google's consent rule | A persistent `read` grant lets an agent read mail without a new, contextual user action. | High. Speculation. | Verification rejection or a required gateway redesign. | Add a visible, time-bounded agent session consent before restricted data can pass. |
| Prompt injection controls are insufficient | Email content can direct an agent to read more mail or change mailbox state. | High reviewer concern. Speculation. | Review rejection, security remediation, or reduced gateway features. | Treat mail as untrusted input. Add tested defenses. Gate or remove agent mailbox writes until those defenses pass. |
| The scope set is not minimal | Google sees `gmail.send` as redundant because `gmail.modify` already authorizes `messages.send`. | High. Speculation. | Clarification cycle and resubmission. | Request only `gmail.modify`. Remove `openid` and `email` unless code starts using an ID token. |
| Public claims contradict actual data paths | The site says Wren talks only to Google while agents can receive mail and use hosted models. | High if submitted unchanged. Speculation. | Brand or restricted-scope rejection. A later finding can trigger enforcement. | Replace absolute claims with an exact boundary statement. Disclose agent and provider handling. |
| Local storage fails restricted-data controls | Wren stores message content in ordinary SQLite. The current code does not show app-level encryption. | Medium to high. Speculation. | Security remediation before approval. Possible CASA findings. | Encrypt restricted data at rest or obtain written acceptance of an OS-backed design. |
| Append-only audit conflicts with deletion | Audit rows retain subjects, addresses, filenames, and thread identifiers after account removal. | Medium to high. Speculation. | Privacy-policy rejection or a data-deletion redesign. | Keep event structure append-only, but delete or cryptographically erase Google-derived content. |
| Brand identity is not unique | Reviewers cannot distinguish "Wren" from current products with the same name. | Medium. Speculation. | Rename, new video, new screenshots, and renewed brand review. | Decide a qualified public name before submission. "Wren Mail" is the leading candidate, subject to trademark review. |
| Domain and homepage fail review | A new or sparse site looks unrelated, redirects, or lacks verifiable ownership. | Medium for an incomplete site. Low for a complete site. Speculation. | Brand-review delay. | Verify a DNS Domain Property. Use one stable domain. Publish complete pages before submission. |
| The demo video is rejected | The video omits the complete English consent screen, agent flow, or a scope-backed feature. | Medium. Speculation. | One or more review cycles. | Record the final build, exact branding, complete consent screen, and every restricted-data path. |
| Annual reverification lapses | Project contacts miss Google's notice or the evidence package has gone stale. | Medium without an owner. Low with the runbook. Speculation. | New sign-ins can be blocked. Google warns that API access can be lost. Exact token behavior is not documented. | Assign two project owners. Start the annual package 120 days before the anniversary. |
| The shared client is suspended | Abuse, a fork, or a policy finding disables the project or client. | Low annual probability. Catastrophic impact. Speculation. | Every official-client user can lose authorization. Recovery can require reauthorization. | Preserve BYO access, monitor project state, classify OAuth errors, and maintain an appeal runbook. |
| Launch traffic hits project limits | Many cold starts exhaust the shared minute quota. Later, daily use crosses the billing threshold. | Medium during a launch spike. Speculation. | Slow or failed sync, support load, and future charges. | Stage rollout, jitter cold sync, monitor aggregate quota, and reduce prefetch before requesting minute-quota changes. |
| Forks reuse the official ID | A fork accidentally ships Wren's ID or deliberately extracts it from the binary. | High if the ID is committed. Intentional reuse remains possible. | Quota theft, impersonation, suspension, and brand damage. | Inject the official ID only in official release CI. Make source builds BYO-only unless builders provide their own ID. |
| Client rotation breaks existing accounts | Refresh tokens remain bound to the client that issued them, but Wren currently reads the latest global settings. | Medium over the product lifetime. Speculation. | Reauthentication loops across all accounts after a credential change. | Bind each account to its OAuth credential source. Never refresh with an unrelated client ID. |
| The production project contains test clients | Google reviews every client in the project and finds unused or unfinished clients. | Medium if the current project is reused. Speculation. | Review delay or forced project cleanup. | Use separate test and production projects. Keep only production-ready clients in the verified project. |

## 1. The agent gateway is the decisive exemption risk

Google applies the security assessment when an app can access restricted data "from or through a third-party server." Google also says server storage or transmission triggers the assessment. [Restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) states both tests.

An MCP agent is a third-party program, even when it runs on the same machine. It is not automatically a third-party server. A local model that processes Wren output only on the user's device has the strongest exemption case.

The data transfer question is broader. Wren returns full message bodies and attachments to another process through MCP. That crosses Wren's control boundary, even when the socket is local.

Google's current Workspace policy explicitly covers "MCPs" and other developer tools. It also tells developers to request consent in context for MCP, tool, skill, or agentic invocations. [Google Workspace user data and developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

Most useful MCP clients are local frontends for hosted model services. In that case, the path is:

```text
Google Gmail API
  -> Wren process
  -> local SQLite and memory
  -> local MCP client process
  -> hosted model provider
```

The hosted-model hop is restricted data passing through a third-party server. Wren does not need to operate that server for the reviewer to care.

The human send approval does not resolve this issue. The disputed transfer happens during reads, search, attachments, and mailbox processing.

The Limited Use policy can permit a transfer for a visible user feature with user consent. That permission does not automatically waive the security assessment.

### Recommended reviewer posture

Do not submit this sentence:

> Wren is a local client, so the agent gateway does not transmit restricted data to a third party.

Submit a complete description and request a determination:

> Wren is an installed desktop email client. Wren fetches Gmail data directly from Google and stores it on the user's device. Wren operates no server that receives Gmail content. Wren also offers an optional local MCP socket. A user can create an agent credential and grant selected capabilities. Wren then returns requested mail data to that user-selected client. Some clients can use a hosted model provider. Wren discloses this path and requires contextual user consent. We request confirmation whether this architecture requires a security assessment.

This wording is less convenient. It is also much safer than obtaining approval through an incomplete architecture statement.

## 2. The gateway has a separate consent and prompt-injection problem

The permission model treats an enduring grant as sufficient for every read. Google now asks for contextual consent around agentic behavior.

An agent can connect while the user is absent. It can then search mail, read bodies, fetch attachments, and change labels. Only final sending requires a human.

That design can fail review even if Google grants the local-client assessment exemption.

The same policy now requires prompt-injection protection for restricted-scope integrations. Wren's send approval limits one consequence. It does not protect reads, archives, label changes, or data disclosure.

Required mitigation:

1. Keep capability grants as the durable authorization layer.
2. Add a second, time-bounded consent for each agent run or connection.
3. Show the agent identity, data classes, likely provider path, and allowed actions before consent.
4. Refuse restricted-data tools until the user starts that session.
5. Mark message bodies and attachments as untrusted data in every tool result.
6. Add prompt-injection tests for reads, label changes, attachments, drafts, and send requests.
7. Require human approval for mailbox writes, or disable those writes for shared-client accounts during the first release.

Whether consent must occur for every tool call remains unclear. A per-run approval is a reasonable implementation proposal, not a confirmed Google interpretation.

## 3. `gmail.modify` alone is the minimal honest scope

The current code requests:

```text
gmail.modify
gmail.send
openid
email
```

That set is not minimal.

Google describes `gmail.modify` as permission to read, compose, and send email. It excludes only immediate permanent deletion that bypasses Trash. [Gmail scope list](https://developers.google.com/workspace/gmail/api/auth/scopes)

Google's `messages.send` reference lists `gmail.modify` as an accepted scope. [users.messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)

Wren uses `users.getProfile` to obtain the mailbox address. That method also accepts `gmail.modify`. The current code does not consume an OpenID ID token. [users.getProfile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)

| Candidate set | Covers Wren today | Verification story | Verdict |
| --- | --- | --- | --- |
| `gmail.modify` | Yes. It covers reads, attachments, history, labels, Trash, untrash, and send. | One restricted scope. Every method maps to it. | Best set. |
| `gmail.modify` + `gmail.send` | Yes. | The second scope adds no capability that Wren uses. | Reject as redundant. |
| `mail.google.com` | Yes. It also permits permanent deletion. | Hardest story because Wren never uses that extra power. | Reject. |
| `gmail.readonly` + `gmail.send` | No. | It cannot change thread labels or Trash state. | Reject unless Wren removes mailbox mutation. |
| `gmail.compose` | No. | It manages drafts and sending. It does not provide Wren's mailbox reads and label changes. | Reject. |
| `gmail.insert` | No. | It inserts messages into a mailbox. Wren never calls `messages.insert`. | Reject. |
| `gmail.readonly` + `gmail.labels` + `gmail.send` | No. | `gmail.labels` manages label definitions. It does not authorize thread label mutation. | Reject. |

The easiest verification story is one scope: `https://www.googleapis.com/auth/gmail.modify`.

The scope justification should name Wren's exact methods. It should also explain why each narrower candidate fails.

## 4. Brand verification can fail before Google reaches the exemption

### Domain age

No Google source reviewed for this plan states a minimum domain age. Domain age is not a documented gate.

The documented gates are ownership and presentation. Google requires a public homepage on a verified domain. The page must identify the app, explain its functions, and link the same privacy policy used in Cloud Console. [Verification requirements](https://support.google.com/cloud/answer/13464321)

Google now asks owners to verify a DNS-level Search Console Domain Property. A URL-prefix property can fail recognition. [Domain verification](https://support.google.com/cloud/answer/13804266)

A new domain can still create manual-review suspicion if it is sparse or inconsistent. That is speculation. Publish the complete site before submission and keep its URLs stable.

### Privacy-policy traps

The current public phrases "no third-party servers" and "talks only to Google" are unsafe. They ignore agent clients and any hosted model provider.

The policy must separately state:

- Which Google data Wren reads, changes, and sends.
- Where message data, indexes, tokens, approvals, and audit entries are stored.
- Which data Wren sends to an agent after user consent.
- That an agent or model provider can process data outside the device.
- That Wren does not use Google data to train a generalized model.
- The local retention period and account-removal behavior.
- How a user deletes local data and revokes Google access.
- Which encryption protects each stored data class.
- Wren's compliance with Google's Limited Use requirements.

Google rejects template policies, inaccessible pages, PDF policies, incomplete sharing statements, and missing retention details. It also requires explicit AI-training language for AI use cases. [App Privacy Policy](https://support.google.com/cloud/answer/13806988)

The planned hosted sync service needs separate treatment. Do not describe an unbuilt service in the submitted data flow. Do not promise that mail always stays local after that service launches.

### App-name collisions

Google requires the app name and logo to uniquely identify the brand. It also requires exact consistency across the homepage, consent screen, submission, and demo. [App identity and branding](https://support.google.com/cloud/answer/13804963)

"Wren" already names several current software products. Examples include a [local-first reference manager](https://github.com/thewrenapp/wren), [Wren AI](https://docs.getwren.ai/oss/installation), and a [current Android app](https://play.google.com/store/apps/details?id=com.theaviarylabs.wren).

This does not prove a trademark conflict. It does make an unqualified consent-screen name harder to defend as unique.

Nick should choose a qualified name before domain work and video capture. "Wren Mail" is the cleanest descriptive candidate. A trademark search remains a separate legal task.

### Demo-video rejection reasons

Google lists common failures directly. The video must show the same final app and branding, the complete English consent screen, and every feature that uses each requested scope. The link must also remain accessible. [Demo video guidance](https://support.google.com/cloud/answer/13804565)

For Wren, the video should show:

1. The final signed build and app version.
2. Account addition through the system browser, with the browser address bar and submitted client ID visible where Google requests them.
3. The complete English consent screen with only `gmail.modify`.
4. Thread listing, body reading, and attachment access.
5. Archive, label change, Trash, and untrash.
6. A human-composed send.
7. Agent creation and the new agent-session consent.
8. An agent read through the MCP client.
9. An agent send request and the human approval.
10. Account removal and local data deletion.

If shared-client accounts cannot use agents, the video must state and show that boundary instead.

## 5. Annual reverification is an operational dependency

Google's Help Center says apps requesting restricted data need annual reverification. Its annual recertification page describes the anniversary from a CASA Letter of Validation. [OAuth verification help](https://support.google.com/cloud/answer/13463073) and [annual recertification](https://support.google.com/cloud/answer/13463816)

The pages do not clearly explain the schedule for an assessment-exempt local client. Obtain written confirmation during the first review.

Until then, assume annual work applies. Keep a reusable evidence package and start 120 days before the approval anniversary.

Google warns that stale project contacts can lead to loss of API access. It does not document the exact order of effects after a missed local-client reverification.

Plan for the worst case:

- New grants stop.
- Users see an unverified or disabled sign-in state.
- Existing refreshes or Gmail calls can fail if Google restricts the client or project.
- Users must switch to BYO OAuth or wait for reinstatement.

These user effects are a conservative incident assumption. They are not a confirmed enforcement sequence.

## 6. A shared-client suspension has a large blast radius

### Detection

Wren has no telemetry server. Detection must use Google-controlled signals and local error classification.

- Monitor every project owner and editor inbox.
- Monitor the Cloud Console project state and Gmail API metrics.
- Alert on project-wide increases in `invalid_client`, `unauthorized_client`, `deleted_client`, OAuth 403 responses, and Gmail 403 responses.
- Distinguish project failure from a single user's `invalid_grant`.
- Do not send users into repeated reauthorization when the project is disabled.

Google can suspend a project without advance warning for an emergency security issue. Google directs owners to fix the issue and appeal in Cloud Console. [Policy violations FAQ](https://support.google.com/cloud/answer/7002354)

### Blast radius

Every account authorized under Wren's shared client is affected. BYO accounts use separate projects and remain isolated.

If a client is deleted, Google says existing access and refresh tokens associated with it fail. Authorization requests return `deleted_client`. Deleted clients are usually recoverable for at least 30 days. [Manage OAuth clients](https://support.google.com/cloud/answer/15549257)

A replacement client does not repair old refresh tokens. Users must authorize the replacement client.

### Recovery runbook

1. Freeze credential and scope changes.
2. Confirm whether the incident affects one user, one client, or the whole project.
3. Capture Cloud Console state, error codes, timing, and quota graphs.
4. Inspect the owner email and Cloud Appeals page.
5. Fix the cited abuse, policy, or credential problem.
6. Submit one appeal with the architecture, remediation, and client identifiers.
7. Publish a static status notice that contains no mail data.
8. Tell affected users not to repeat reauthorization until the project state is known.
9. Expose the BYO override from the error screen.
10. Restore the deleted client when Google permits it.
11. If restoration fails, ship a verified replacement client and require reauthorization.
12. Record the cause, affected versions, and prevention changes.

An unused standby client in the same project does not hedge project suspension. A hidden client in another project creates another verification and policy surface.

## 7. Quota and billing need corrected launch math

For projects created on or after May 1, 2026, Google's current shared limits are 1,200,000 units per minute per project and 6,000 units per minute per user. The daily billing threshold is 80,000,000 units per project. Older active projects can remain on the previous quota model. Google says later-2026 charges will receive at least 90 days' notice. The daily threshold cannot be increased. [Gmail API usage limits](https://developers.google.com/workspace/gmail/api/reference/quota)

The R3a note's "six cold-sync users per minute" model is not how Wren behaves.

Wren limits each account to 4,500 units per minute. Project capacity is therefore about 266 simultaneously saturated accounts before other traffic. Backoff and batch pacing spread a large sync across many minutes.

The cold-sync formula is approximately:

```text
10 units per threads.list page
+ 40 units per thread metadata fetch
+ 20 units per prefetched message body
+ small profile and label costs
```

The number of threads matters more than the mailbox's raw message count. The 90-day window also limits Wren's initial work.

The daily threshold can still arrive earlier than expected.

- One idle account polling every minute uses about 2,880 history units per day.
- The threshold equals about 27,700 continuously open, idle accounts before changes or sync work.
- A 200,000-unit cold sync allows about 400 such syncs per day before the threshold.

These examples are arithmetic, not forecasts. Real usage depends on open time, account count, thread count, changes, and body reads.

Mitigation:

1. Create project dashboards before launch.
2. Alert at 50%, 70%, and 90% of minute and daily limits.
3. Add randomized delay to first sync and body prefetch.
4. Keep the per-user 4,500-unit budget.
5. Stage release cohorts instead of opening the shared client to every download at once.
6. Reduce prefetch and polling before requesting a minute-quota adjustment.
7. Treat Cloud budgets as alerts. They do not guarantee a charge stop.
8. Set a Nick gate when Google publishes the price schedule.

## 8. AGPL forks cannot be forced to behave

RFC 8252 treats a distributed native client as public. A client ID and any static secret can be extracted from the official binary. [RFC 8252 section 8.5](https://www.rfc-editor.org/rfc/rfc8252.html#section-8.5)

Google also says not to commit OAuth client credentials to a public repository. [OAuth client credential policy](https://developers.google.com/identity/protocols/oauth2/policies#handle_client_credentials_securely)

No source-code check can prevent a malicious fork from copying that ID. The goal is to prevent accidental reuse and make deliberate reuse obvious.

Use this build contract:

1. Keep the official client ID out of Git history.
2. Inject it only in the official release workflow.
3. Make the source default BYO-only when no build ID exists.
4. Require non-official production builds to provide their own client ID.
5. Fail packaging when a production build has neither an official release identity nor an override.
6. Never export the official client ID through Wren's settings transfer.
7. Show "Official Wren OAuth" or "Custom OAuth" in account diagnostics.
8. Add a repository notice that forks must register their own client.
9. Scan community build artifacts in CI to ensure they do not contain the official ID.

Official CI still embeds the ID in the final bundle. That is required for option A and cannot be made secret.

## 9. Material omissions in the draft plan

### The native client secret is optional

Google classifies desktop apps as public clients. Its installed-app token reference lists `client_secret` as optional. [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)

Wren currently requires a secret, stores it in settings, and exports it between devices. Remove that requirement unless live testing proves a client-specific need.

### Accounts are bound to the issuing client

`StoredAccountTokens` records `clientId`, but `TokenManager` refreshes with the current global settings. A later override can pair an old refresh token with a new client.

The shared-client implementation must resolve credentials per account. A settings change must not silently rebind existing refresh tokens.

### Partial grants need an explicit check

Google tells installed apps to inspect the token response's `scope` field because a user can grant only part of a request. [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)

Wren's `TokenResponse` currently omits that field. Record the returned scope set. Reject account setup with a precise recovery message if `gmail.modify` is absent.

### Local mail is not visibly encrypted

OAuth tokens use the OS keychain. Message data, agent approvals, and audit text use the SQLite store.

Google's current policy requires encryption for restricted data at rest and in external transit. It also requires secure key management. [Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

The submission needs an exact encryption statement. "The device may use FileVault or BitLocker" is weaker than app-controlled encryption because Wren cannot enforce it.

### "Forever" audit history conflicts with deletion

Removing an account deletes cached mail and tokens. It does not delete Google-derived subjects, addresses, filenames, and thread keys from agent audit rows.

Preserve append-only event integrity without preserving restricted content forever. One option is field encryption with per-account keys, followed by key destruction on account deletion.

### Production and test projects must be separate

Google recommends separate projects and expects every OAuth client in the submitted project to be production-ready. [Restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

Do not submit a project that also contains experimental clients, abandoned redirect tests, or future scopes.

### Reviewer access is a release artifact

Google can request in-app testing instructions and sufficient access to the OAuth workflow. [In-app testing guidance](https://support.google.com/cloud/answer/13807382)

The current README says the macOS build is unsigned. Prepare a signed and notarized reviewer build before submission.

### Unverified production is not a scalable fallback

The R3a draft overstates the immediate user impact at user 101. A testing app supports up to 100 listed test users, and its refresh tokens normally expire after seven days. An unverified app in production has a lifetime cap of 100 new authorizations before Google disables new sign-ins. Google's page does not say that crossing the cap revokes every existing user's token. [OAuth app audience](https://support.google.com/cloud/answer/15549945)

This correction does not make an unverified shared client viable. It means the failure is a new-user freeze and support incident, not proven instant extinction for every installed user.

# Part 2: optimized implementation plan

## 1. Freeze the product truth

Nick makes four decisions before implementation starts.

**Gate N1: agent data path.** Choose one of these positions:

1. Shared OAuth supports hosted agent clients. Wren discloses the transfer and accepts possible CASA.
2. Shared OAuth supports only the human mail client. Agent access requires BYO OAuth.
3. Option A pauses until Google gives a written assessment determination.

The first position preserves the product. The second position creates the strongest local-client exemption case.

**Gate N2: public name.** Choose the final consent-screen name and domain. Use the same name everywhere.

**Gate N3: scope.** Approve `gmail.modify` as the only Google data scope.

**Gate N4: data controls.** Approve app-level encryption, deletion semantics, and the agent-session consent design.

## 2. Correct the OAuth implementation before submission

Implement these changes as one bounded product workstream.

1. Change `GOOGLE_SCOPES` to `gmail.modify` only.
2. Remove `openid` and `email` because `users.getProfile` supplies the mailbox address.
3. Make `client_secret` optional in code exchange and refresh requests.
4. Make the official client ID a release-time build input.
5. Keep source and development builds BYO-only by default.
6. Add an explicit custom-client override in Settings.
7. Store each account's OAuth source and issuing client ID.
8. Refresh each account with its issuing client ID.
9. Never export the official client ID in a settings transfer.
10. Export a custom client only after an explicit warning.
11. Split account revocation errors from project or client failures.
12. Add direct recovery actions for BYO OAuth and account reauthorization.
13. Parse the token response's granted `scope` field.
14. Refuse account setup if `gmail.modify` was not granted.

Prepare these code artifacts:

- `src/core/auth/client-config.ts` for build and override resolution.
- A revised `src/core/auth/oauth.ts` with one scope and optional secret fields.
- An account credential-source migration for existing settings and tokens.
- Unit tests for scope output, partial grants, secret omission, source resolution, refresh binding, and client rotation.
- Release-workflow checks that fail when official credentials are missing.
- Community-build checks that fail when the official client ID appears.

Do not put the production client ID or secret in a repository file.

## 3. Close the restricted-data gaps

Complete these controls before the demo video.

1. Encrypt mail, approvals, and Google-derived audit content at rest.
2. Store encryption keys in the OS keychain or equivalent hardware-backed storage.
3. Document key creation, rotation, recovery, and deletion.
4. Add a complete "Delete local Google data" action.
5. Delete or cryptographically erase Google-derived audit fields during account removal.
6. Preserve non-sensitive audit structure and timestamps where possible.
7. Add the agent-session consent described in Part 1.
8. Add prompt-injection defenses and adversarial tests.
9. Put the agent disclosure in the normal connection flow, not only in Settings.
10. Add user help for data deletion, Google revocation, and agent revocation.

**Gate N5:** Nick approves the revised meaning of "append-only" before the permission-model document changes.

## 4. Create a clean production Google project

Create a production project that is separate from development and reviewer testing.

Configure:

- Gmail API enabled.
- External audience.
- Production publishing status.
- One Desktop OAuth client for the official desktop release.
- Only `gmail.modify` on the Data Access page.
- Two durable project owners.
- Current owner, editor, support, and developer contact addresses.
- A Cloud billing account only after Nick accepts the billing exposure.
- Gmail API minute and daily quota dashboards.
- Alerts for quota, OAuth errors, and project state.

Delete unused clients from the production project before submission.

## 5. Settle the brand and domain

Prepare these public artifacts before brand verification:

1. A final app name and logo.
2. A stable root domain owned by the publisher.
3. A Search Console DNS Domain Property verified by a project owner.
4. `https://<domain>/` as the public homepage.
5. `https://<domain>/privacy` as a dedicated HTML privacy policy.
6. `https://<domain>/security` as the security and data-flow summary.
7. `https://<domain>/support/google-data` as the deletion and revocation guide.
8. A monitored support address on the same brand.

The homepage must describe the desktop mail client and optional gateway. It must not imply that every agent stays local.

Use this boundary wording:

> Wren stores your mailbox data on this device and connects directly to Google for Gmail. Wren operates no mail server. If you connect an agent and grant access, Wren sends the selected data to that agent through a local socket. The agent or its model provider may process that data outside this device. Review that provider's terms before granting access.

The privacy policy must include an affirmative Limited Use statement. It must also prohibit generalized AI or ML training with Google data.

**Gate N6:** Nick approves the exact public data-flow statement and the final name before Cloud brand verification.

## 6. Prepare the submission dossier

Create these exact internal artifacts:

- `docs/security/google-oauth-data-flow.md`
- `docs/security/google-oauth-data-inventory.md`
- `docs/security/google-oauth-method-scope-matrix.md`
- `docs/security/google-oauth-encryption-and-deletion.md`
- `docs/security/google-oauth-agent-consent.md`
- `docs/security/google-oauth-verification-answers.md`
- `ops/google-oauth/INCIDENT.md`
- `ops/google-oauth/QUOTA.md`
- `ops/google-oauth/REVERIFICATION.md`
- `ops/google-oauth/CONTACTS.md`

The dossier must contain:

- The production project ID and desktop client ID.
- The exact app version, commit, build hash, and download link.
- The homepage, privacy, security, support, and deletion URLs.
- A method-to-scope matrix from Wren source to Google references.
- A complete data-flow diagram, including the possible hosted-model hop.
- A restricted-data inventory with storage, encryption, retention, and deletion.
- The agent consent and prompt-injection design.
- Proof that account removal deletes local mail and tokens.
- The revised audit-log deletion behavior.
- The quota calculation and alert screenshots.
- The incident and annual owner roster.
- A name-collision and trademark-review receipt.
- The demo video, transcript, and shot list.
- Reviewer installation and OAuth instructions.

## 7. Use precise submission wording

### Assessment determination request

Use the architecture statement in Part 1. Do not call the result an exemption before Google confirms it.

Add this final sentence:

> If Google determines that the optional hosted-agent path requires a security assessment, Wren will complete that assessment or disable shared-client agent access before public launch.

### Scope justification

Use this draft:

> Wren is an installed desktop Gmail client. It uses `gmail.modify` to list and read threads, messages, headers, bodies, and attachments. It uses the same scope to read mailbox history and labels, add or remove thread labels, and move threads to and from Trash. Wren also sends messages that a person composes or explicitly approves. Google's `users.messages.send` method accepts `gmail.modify`. Wren does not request `gmail.send` because that scope would be redundant. Wren does not request `mail.google.com` because Wren never permanently deletes messages or bypasses Trash. `gmail.compose` and `gmail.insert` cannot support Wren's mailbox reads and thread-label changes.

### Agent-use statement

Use this draft if shared OAuth supports agents:

> The user must create an agent identity, grant capabilities, and approve a time-bounded agent session. Wren discloses that the selected client may use a hosted model provider. Wren sends mail data only after that contextual consent. Every send still requires separate human approval in Wren.

Do not claim that send approval is consent for prior mail reads.

## 8. Record one final demo

Record only after the build, site, scope, name, logo, and disclosures are frozen.

Use an accessible YouTube or Google Drive link. Set the Google consent screen to English.

Use voice or text narration. Show the exact scope at the moment of consent.

Show the browser address bar and client ID where the review guide requests them. Do not crop away identity evidence.

Record every item in the Part 1 shot list. Show the privacy notice immediately before agent-session consent.

Record account deletion and token removal. Reviewers need to see the complete lifecycle, not only sign-in.

## 9. Run one pre-submission review

Use a clean Google account and a clean OS user profile.

Confirm:

1. The consent screen shows the final name, logo, domain, and one scope.
2. Every public URL loads without authentication or redirect.
3. Search Console ownership belongs to a project owner.
4. The signed build matches the video.
5. Reviewer instructions reproduce the OAuth flow.
6. The privacy policy matches actual network and storage behavior.
7. The official client ID is absent from source and present in the official bundle.
8. A source build defaults to BYO OAuth.
9. The custom override remains reachable after a shared-client error.
10. The project contains no unreviewed clients or scopes.

**Gate N7:** Nick approves the final answers, video, and public text before submission.

## 10. Submit and parallelize the wait

Submit brand verification first. Google says brand review typically takes two to three business days when branding changed. Restricted-scope review can take several weeks. [Restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

After gates N1 through N6, parallelize these tracks:

| Track | Work | Dependency |
| --- | --- | --- |
| Product | OAuth resolution, encryption, deletion, agent consent, prompt-injection controls | N1, N3, N4 |
| Brand | Name, domain, homepage, privacy, security, support | N2 |
| Cloud operations | Production project, owners, dashboards, incident and annual runbooks | N1, N3 |
| Evidence | Method matrix, data inventory, reviewer instructions | Product architecture frozen |

Do not record the final video until the product and brand tracks are complete.

During Google review:

- Keep the submitted build and URLs unchanged.
- Reply on the existing review email thread.
- Answer each question with one source or artifact.
- Do not add scopes, clients, redirects, or branding.
- Continue shipping BYO-only builds and demo mode.
- Do not expose the unverified shared client to public users.

## 11. Expected timeline

Google publishes only two useful timing statements: brand review typically takes two to three business days, and restricted review can take several weeks.

The ranges below are planning estimates and therefore speculation.

| Phase | Expected time |
| --- | ---: |
| Nick gates, name, and architecture freeze | 1 to 3 days |
| OAuth, encryption, deletion, and agent controls | 2 to 6 weeks |
| Site, policy, Cloud project, and dossier | 1 to 3 weeks in parallel |
| Final preflight and video | 2 to 4 days |
| Google brand verification | 2 to 3 business days, per Google |
| Google restricted-scope review | 3 to 8 weeks planning range |
| CASA if required | Add 4 to 12 or more weeks, subject to Google and assessor scheduling |

Expected total without CASA: about 6 to 12 weeks from the architecture decision.

Expected total with CASA: about 10 to 24 or more weeks.

Do not reuse the R3a fixed Tier 2 price as a budget. Google's current assessment page uses dynamic AL1 and AL2 assurance levels. Obtain current quotes only after Google assigns the path. [Security Assessment](https://support.google.com/cloud/answer/13465431)

## 12. Launch in controlled cohorts

Launch only after Google approves the exact scope and architecture.

1. Release the official shared-client build to a small cohort.
2. Watch minute quota, daily units, OAuth errors, support reports, and sync duration.
3. Increase the cohort only after two stable quota windows.
4. Keep BYO OAuth visible in Settings and recovery screens.
5. Do not remove BYO documentation after shared OAuth succeeds.
6. Record the verification approval date and any assessment anniversary.
7. Start the annual runbook 120 days before that date.

**Gate N8:** Nick authorizes each launch expansion and any future billing exposure.

## 13. Fallback tree

```text
Submission starts
  |
  +-- Brand rejected
  |     +-- Fix domain, page, name, or logo
  |     +-- Re-record the video if visible identity changed
  |     +-- Resubmit brand verification
  |
  +-- Scope questioned
  |     +-- Provide the method-to-scope matrix
  |     +-- Keep gmail.modify only
  |     +-- Never expand to mail.google.com
  |     +-- If Google requires narrower access, remove mailbox mutation or stop option A
  |
  +-- Local-client assessment status questioned
  |     +-- Provide the complete MCP and hosted-model path
  |     +-- Request a written determination
  |     +-- If assessment is required, choose one Nick gate:
  |           1. Complete CASA
  |           2. Restrict shared OAuth to the human UI and require BYO for agents
  |           3. Keep all public builds BYO-only
  |
  +-- Review stalls
  |     +-- Reply once with an artifact-indexed answer
  |     +-- Keep shipping BYO-only
  |     +-- Do not launch an unverified shared client
  |
  +-- Minute quota blocks launch
  |     +-- Reduce prefetch and polling
  |     +-- Increase rollout jitter
  |     +-- Request a minute-quota adjustment
  |
  +-- Daily billing becomes material
  |     +-- Nick chooses to pay, reduce sync cost, limit rollout, or return to BYO
  |     +-- The 80,000,000-unit threshold cannot be increased
  |
  +-- Shared client is suspended
        +-- Run the incident playbook
        +-- Offer BYO immediately
        +-- Appeal and restore the same client when possible
        +-- If replacement is required, ship it and require reauthorization
```

## Final recommendation

Build option A, but separate the easy OAuth work from the hard policy work.

The OAuth code change is small. The true launch blockers are agent data transfer, contextual consent, prompt injection, encryption, deletion, and operational ownership.

The clean submission is one restricted scope, one production client, one qualified brand, and one complete data-flow story. BYO OAuth remains permanent.
