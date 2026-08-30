# Shared Google OAuth client: primary-source audit

Date: 2026-08-30. This memo checks `docs/research/shared-oauth-client.md`
against current Google policy, Google OAuth and Gmail documentation, RFC 8252,
and the Wren source tree. It does not rely on vendor blogs or community reports.

## Bottom line

A shared, verified Desktop OAuth client is technically possible, but the current
plan is not ready to treat the security assessment as waived. Three corrections
change the implementation and verification strategy:

1. Wren's current Gmail calls need only `gmail.modify`. That restricted scope
   authorizes reads, label changes, trash/untrash, and `messages.send`.
   `gmail.send` adds no authority. `openid` and `email` also appear unused.
2. RFC 8252 says a native client cannot keep a shared secret. Google's current
   OAuth policy separately says not to commit OAuth client credentials to a
   public repository. The shared build should omit the optional client secret
   and inject the client ID during release packaging, not commit either value.
3. The local socket does not settle the security-assessment question. Wren can
   return message bodies and attachments to arbitrary MCP clients, which may
   send them to third-party model servers. Google's current Workspace policy
   expressly covers MCP and agentic tools. It requires in-context disclosure
   and consent, limited data transfers, prompt-injection protection, and secure
   handling. Google does not publish a ruling that this product shape qualifies
   for the local-client assessment path.

The safe planning assumption is restricted-scope verification plus an explicit
Google review of the complete desktop-and-MCP data flow. Do not budget zero for
CASA or promise that the exemption will apply until Google confirms it.

## What Wren actually does

`src/core/auth/oauth.ts:16-21` requests `gmail.modify`, `gmail.send`, `openid`,
and `email`. It uses an external browser, S256 PKCE, a random `state`, and an
IPv4 loopback callback at `127.0.0.1` (`oauth.ts:59-129`, `368-412`). The Rust
listener binds only to IPv4 loopback and accepts only `/callback`
(`src-tauri/src/lib.rs:150-207`). This matches the core safeguards in
[RFC 8252 sections 7.3 and 8](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)
and Google's [desktop authorization guide](https://developers.google.com/identity/protocols/oauth2/native-app).

The Gmail client calls profile, labels, thread list/get, attachment get,
history list, message/thread batch reads, thread modify/trash/untrash, and
message send (`src/core/gmail/api.ts:241-410`). It does not call Gmail draft,
insert, import, or permanent-delete methods.

The MCP gateway is local transport, not local-only processing. Its Unix socket
is inside a `0700` directory and uses a `0600` socket
(`src-tauri/src/gateway.rs:14-33`). After authentication, `read_thread` returns
message bodies and headers, and `get_attachment` returns attachment bytes to
the MCP client (`src/core/gateway-server/tools-read.ts:316-470`). The README
names Claude Code and Claude Desktop as intended clients (`README.md:27-38`).
Wren cannot infer from the local socket whether the receiving process keeps
those results on-device.

## Scope corrections

Google's current [Gmail scope table](https://developers.google.com/workspace/gmail/api/auth/scopes)
and method references establish these semantics:

| Scope | Classification | Meaning and fit for Wren |
| --- | --- | --- |
| `gmail.modify` | Restricted | Read, compose, and send mail, except immediate permanent deletion. It authorizes Wren's [thread label changes](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/modify) and [message sends](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send). This is the least single Gmail scope for the current product. |
| `gmail.send` | Sensitive | Send only. It is redundant when `gmail.modify` is present. Remove it before verification. |
| `gmail.compose` | Restricted | Manage Gmail drafts and send. Wren does not store drafts in Gmail, so this is not a replacement for its read and mailbox-change requirements. |
| `gmail.insert` | Restricted | Insert a message into the user's mailbox. Wren does not call `messages.insert`. |
| `mail.google.com` | Restricted | Read, compose, send, and permanently delete all mail. Google says to request it only when bypassing Trash is required. Wren uses trash/untrash and must not request it. |

The old claim that `gmail.modify` does not cover `messages.send` is false. The
[`users.messages.send` authorization list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
includes `gmail.modify` directly.

`openid` and `email` do not appear to support a used feature. The token parser
does not consume `id_token`, and Wren gets the address from Gmail `getProfile`.
Google requires minimum scopes and forbids future-proof requests in its
[Workspace user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy#request_the_minimum_relevant_permissions).
Remove these identity scopes unless the implementation adds a documented use.

Google also says installed apps must inspect the token response's granted
`scope` and handle partial grants. Wren's `TokenResponse` omits `scope`
(`oauth.ts:139-168`). Add that check so a user who declines `gmail.modify` gets
a precise consent error instead of a later Gmail profile failure. Google's
[installed-app guide](https://developers.google.com/identity/protocols/oauth2/native-app#step6-examine-scopes)
documents this requirement.

## Native-client credential handling

[RFC 8252 section 8.5](https://www.rfc-editor.org/rfc/rfc8252.html#section-8.5)
says a secret distributed in a native app is not confidential and must not be
accepted as proof of the client's identity. Google's installed-app guide agrees
that installed apps cannot keep a secret and marks `client_secret` optional in
both code and refresh-token exchanges. Wren currently requires and always sends
one (`oauth.ts:171-221`).

This does not authorize publishing it in source. Google's OAuth policy, last
modified 2026-08-05, says developers [must never commit OAuth client credentials
to publicly available repositories](https://developers.google.com/identity/protocols/oauth2/policies#handle_client_credentials_securely).
The claim that an AGPL repository may embed the client ID and secret because
other clients do so is therefore unsupported by current Google policy.

For a shared release client:

- make `clientSecret` optional and omit it from token requests for the shared
  Desktop client.
- Inject the client ID during trusted release packaging. Keep it out of Git.
- Keep BYO client ID and optional secret support for source builds and forks.
- state that release-binary extraction remains possible. PKCE protects an
  intercepted authorization code. It does not prevent client impersonation,
  as [RFC 8252 section 8.6](https://www.rfc-editor.org/rfc/rfc8252.html#section-8.6)
  explains.

Google now also documents optional DPoP for installed-app token exchanges. It
is a defense-in-depth option, not a current requirement. The existing S256 PKCE,
loopback-only listener, callback path check, and `state` check are sound.

## Verification and the security-assessment uncertainty

Wren is a permitted Gmail use case as an email client. Google's policy permits
built-in and web clients that let users compose, send, read, and process mail
through a UI, plus productivity features such as generative summaries
([approved Gmail uses](https://developers.google.com/workspace/workspace-api-user-data-developer-policy#appropriate_access_to_and_use_of_gmail_scopes)).
Because `gmail.modify` is restricted, Wren still needs brand and restricted-
scope verification.

Google's restricted-scope guide ties a third-party assessment to server access.
Storage or transmission of restricted data on servers triggers the assessment
([restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification#security-assessment)).
That supports a local-only path, but it is a condition, not a published approval
of Wren.

The July 2026 Workspace policy is broader. It says restricted-scope applications
must follow CASA and that Google may require a periodic third-party assessment
based on the API and number of grants or users
([secure operating environment](https://developers.google.com/workspace/workspace-api-user-data-developer-policy#maintain_a_secure_operating_environment)).
Google's assessment help now describes risk-selected AL1 and AL2 assurance
levels, not an automatic "CASA Tier 2" for every restricted-scope app
([Security Assessment](https://support.google.com/cloud/answer/13465431)).
Official sources do not publish assessment prices. Delete the dollar estimates,
assessor anecdotes, and claims about solo-developer pass rates.

Annual timing also needs narrower wording. Google requires yearly reassessment
12 months after an assessor letter. Its annual-recertification page measures
the period from the prior validation letter
([Annual Recertification](https://support.google.com/cloud/answer/13463816)).
The primary sources do not explain the annual cycle for an app that Google
explicitly excuses from a third-party assessment. The claim that an exempt
local app still has the same annual reverification is unconfirmed.

### MCP and the local-client path

Confirmed facts:

- Google policy now covers Workspace APIs, MCP servers, and other agent tools.
- It says apps should request data in context and gives granular confirmation
  of an MCP, tool, skill, or agentic invocation as the example.
- Transfers are allowed only for an approved, prominent user-facing feature and
  with user consent. Generalized AI or ML training with Workspace data is
  prohibited. Personalized-model training has separate explicit-consent rules.
- Restricted-scope apps must protect against prompt injection with Model Armor
  or another documented control.

These requirements are in Google's
[Workspace user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy#transparent_and_accurate_notice_and_control)
and its [Limited Use section](https://developers.google.com/workspace/workspace-api-user-data-developer-policy#limited_use_of_user_data).

The current Wren model grants durable `read` access and gates only outbound mail
per action (`docs/PERMISSION-MODEL.md:22-40`). The reviewed source contains no
prompt-injection control. A local socket permission boundary and an append-only
audit do not answer either policy requirement.

**Reviewer-dependent inference:** A reviewer may treat Wren as capable of
accessing restricted Gmail data through a third-party server because the MCP
client can relay tool results to a hosted model. A fully local MCP client and
model would not create that server path, but Wren supports arbitrary clients
and cannot enforce where they process results. Google's public documents do not
settle this fact pattern. Ask the verification team to classify the complete
shipping binary and data flow. Disclose the gateway rather than presenting Wren
as only a local mail client.

The present README and proposed privacy statement are too broad. "No third-party
servers" and "talks only to Google" omit the gateway's transfer to another
process. The privacy policy and in-product disclosure must describe agent
sharing. Wren shares message content and attachments with the chosen MCP client.
That client may also share the data with its service provider.
Consent must precede that sharing. The implementation plan should treat the
required prompt-injection control and the consent granularity as launch gates.

The planned hosted sync service is a separate future trigger. If it stores or
transmits restricted Gmail data, the server condition is plainly met. Revisit
verification and assessment before that feature uses the shared project.

## Production states and user limits

Google's current [App Audience documentation](https://support.google.com/cloud/answer/15549945)
corrects the plan's state table:

- **Testing:** up to 100 listed test users. Authorizations, including offline
  refresh tokens, expire after seven days when Gmail scopes are requested.
- **In production but unverified for requested scopes:** any Google Account can
  reach the flow, but Google shows the unverified-app screen. A lifetime cap of
  100 new users applies after that screen is shown. The cap cannot be reset.
- **Verified for every requested scope:** the unverified-scope cap does not
  apply. Adding an unapproved scope makes users see the warning and subjects
  that request to the cap again.

The cap is a new-user authorization cap. "Every Wren user goes offline at user
101" is too strong. Google says new sign-in can be disabled when the cap is
exhausted. It does not say Google immediately revokes every existing refresh
token.

Use separate Google Cloud projects for development/testing and production.
Submit the exact production scope list. Wren must remove redundant scopes before
recording the demo and before verification.

## Brand, domain, and demo requirements

Google's [verification requirements](https://support.google.com/cloud/answer/13464321)
require:

- a public homepage on a verified domain Wren owns, with an accurate app
  description and the privacy policy link used on the consent screen.
- a privacy policy on that domain that explains Google data access, use,
  storage, and sharing. Wren also needs a prominent in-product privacy notice.
- Search Console ownership verification for every authorized domain by a
  project Owner or Editor.
- Google-compliant branding for the control that starts authorization.
- current project ownership, support, and developer-contact addresses.

Brand verification must be published within seven days of a successful result.
Data-access verification follows published branding.

The unlisted YouTube demo must show the complete English OAuth flow.
It must show Wren's submitted name, branding, and exact requested scopes.
The browser address bar must show the client ID.
The demo must show each feature that uses a sensitive or restricted scope.
If multiple OAuth clients are in the project, show each client. Google's
[restricted-scope submission guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification#how-to-submit-your-app-for-brand-verification)
also says a task-automation platform must show multiple automated workflows and
the directions in which user data flows.

**Reviewer-dependent inference:** The MCP gateway may cause reviewers to apply
the task-automation demo rule even though Wren's primary category is email
client. The demo should therefore include agent search/read, attachment access,
label/archive actions, the send approval queue, revocation, and the downstream
MCP data-flow disclosure.

## Quotas and the 2026 daily threshold

For projects created on or after 2026-05-01, Gmail documents
[1,200,000 units per project per minute and 6,000 per user per project per
minute](https://developers.google.com/workspace/gmail/api/reference/quota).
The same page sets an 80,000,000-unit daily billing threshold per project.
Usage below it is free. It is not a hard quota cap, cannot be increased, and
Google still says full billing details will arrive later in 2026 with at least
90 days' notice.

Wren's fixed "six simultaneous 10,000-message cold syncs" estimate is not
reliable. The current code spends 40 units per `threads.get`, 20 per
`messages.get`, and 100 per send. A mailbox's thread count, messages per thread,
and body hydration determine the actual cost. The per-user limiter is 4,500
units per minute, below Google's 6,000 limit, but independent desktop instances
cannot coordinate the shared 1.2-million-unit project pool. Monitor project
usage and model onboarding bursts from measured sync traces.

## Suspension, recovery, and the shared failure domain

Google's OAuth policy allows suspension or revocation for misrepresented or
deceptive identity. The Workspace policy reserves the right to restrict access
for noncompliance. Google also warns that stale project contact information can
lead to lost API access
([OAuth policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)).

If verification rejects Wren, access to unapproved scopes stops. Google permits
a new submission after compliance fixes, but all required materials must be
resubmitted. If the Cloud project itself is suspended, Google says to resolve
the compliance appeal before resubmitting OAuth verification
([verification FAQ](https://support.google.com/cloud/answer/13463817),
[Cloud Abuse Project History](https://support.google.com/cloud/answer/13804782)).
No primary source promises a recovery time.

A shared client therefore creates one quota, policy, branding, and operational
failure domain. Client impersonation from an extracted release client ID may
consume quota or damage the app's reputation. Suspension for impersonator abuse
is speculation. Google does not document that outcome. Keep BYO OAuth as a
tested recovery path. Maintain at least two project owners. Monitor project
contacts and quota dashboards. Document BYO reauthorization for a shared-client
failure.

## Claims to remove or rewrite in the existing plan

- Replace "`gmail.modify` + `gmail.send` is the minimum" with
  "`gmail.modify` alone covers the implemented Gmail methods."
- Remove the claim that `gmail.modify` cannot send.
- Remove automatic CASA Tier 2, price ranges, assessor price claims, and
  predicted solo-developer outcomes. Google assigns AL1 or AL2 by risk and
  publishes no price.
- Replace "Wren is exactly a local-client exemption" with the reviewer-dependent
  MCP analysis above.
- Remove the promise of zero assessment cost and the unconditional annual
  reverification claim for an assessment-exempt app.
- Replace "ship the ID and secret in cleartext in the AGPL tree."
  Inject the client ID during release. Omit the shared secret. State that users
  can inspect the binary.
- Replace "the app dies at user 101" with the lifetime 100-new-user cap and
  disabled new authorization behavior.
- Replace the 10,000-message quota arithmetic with measured Wren sync costs.
- Treat 80 million units as a daily billing threshold, not a daily hard limit.
- Add MCP disclosure, consent granularity, downstream transfer restrictions,
  prompt-injection protection, hosted-sync reassessment, incident reporting,
  project-owner redundancy, and recovery steps as explicit launch risks.
