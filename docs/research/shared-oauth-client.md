# R3a — Can Wren ship one shared Google OAuth client id?

Researched 2026-08-29 against Google's primary docs, RFC 8252, and shipping
open-source precedents. Context: Wren is an AGPL, local-first desktop Gmail
client. It is a native/installed app using the loopback redirect + PKCE flow
(`src/core/auth/oauth.ts`), requesting `gmail.modify` and `gmail.send`.

## Facts

### 1. Scope classification: Wren is a "restricted" app

Google's official restricted-scope list for Gmail
([support.google.com/cloud/answer/13464325](https://support.google.com/cloud/answer/13464325)):

- **Restricted**: `https://mail.google.com/`, `gmail.readonly`,
  `gmail.metadata`, `gmail.modify`, `gmail.insert`, `gmail.compose`,
  `gmail.settings.basic`, `gmail.settings.sharing`.
- **Sensitive (not restricted)**: `gmail.send` is absent from the restricted
  list — it is a sensitive scope.
- Classification follows the most-restrictive scope requested. Wren requests
  `gmail.modify` + `gmail.send`, so the app is **restricted**. A send-only
  app would be merely sensitive; a mail client cannot be send-only.

### 2. Restricted-scope verification and the CASA assessment

Source: [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
and [Security Assessment help](https://support.google.com/cloud/answer/13465431).

- Restricted scopes require brand verification (app name/logo/homepage,
  privacy policy on a verified domain, demo video of the OAuth flow) plus, in
  the general case, an annual third-party security assessment under the
  App Defense Alliance **CASA** framework (Tier 2 for restricted scopes).
- The assessment must be **reverified every 12 months** after the assessor's
  Letter of Assessment date. Assessors are Google-empanelled labs (TAC
  Security, DEKRA, Leviathan, etc.). The developer pays.
- Current cost (secondary sources; labs do not publish list prices):
  roughly **$540–$4,500/year** for CASA Tier 2 via approved labs — TAC
  Security advertises $540–$1,800/yr, other reports cluster at $500–$4,500
  ([deepstrike.io CASA 2025 overview](https://deepstrike.io/blog/google-casa-security-assessment-2025),
  [bright-softwares cost breakdown](https://bright-softwares.com/blog/en/google-workspace/the-50000-gmail-add-on-myth-what-google-s-casa-certification-really-costs)).
  The old "$15k–$75k audit" figure predates CASA self-scan tiers and is a
  myth today. A solo developer can realistically pass Tier 2: it is largely
  an automated DAST/SAST scan plus a self-attestation questionnaire, and
  small teams report passing on first submission.
- **The local-client exemption — the decisive fact.** Google's verification
  docs state the security assessment applies to apps that access restricted
  data "**from or through a third-party server**." Local client applications
  — where restricted-scope data is run, stored, and processed **only on the
  user's device** — are exempt from the security assessment (not from
  verification itself). An app forfeits local-client status if it transmits
  restricted-scope data to the developer's or a third party's servers
  without explicit user-initiated action. (Restricted-scope verification
  doc above; echoed in the [OAuth App Verification Help Center](https://support.google.com/cloud/answer/13463073).)
  Wren is exactly this shape: mail is synced to a local store, no Wren
  server exists, and the MCP gateway is a local socket. The AI-agent surface
  needs care — if a future feature sends message content to a hosted LLM,
  that is user-initiated per-action, but Google's reviewers decide, not us.
- Even with the assessment waived, restricted-scope verification itself
  remains: annual reverification, a homepage domain Wren must own and
  verify via Search Console, an in-scope privacy policy, a scope-usage
  justification, and a demo video. Review "can take several weeks."

### 3. Verification states and their limits (2025–2026 rules)

Sources: [OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview),
[Manage App Audience](https://support.google.com/cloud/answer/15549945).

| State | Who can auth | Warning UI | Token expiry |
|---|---|---|---|
| Testing | Only listed test users, **hard cap 100** | "App is in testing" interstitial | **Refresh tokens expire after 7 days** |
| Published, unverified | Any Google user, **100-user hard cap** for sensitive/restricted scopes | Full "Google hasn't verified this app" danger screen; no app name/logo | Normal token lifetime |
| Published, verified | Unlimited | Clean consent screen with name/logo | Normal token lifetime |

So option (b) — ship unverified and eat the warning — is not actually
available at scale: the 100-user cap applies to the published-unverified
state too, not just testing. An unverified shared client dies at user 101.

### 4. Gmail API quota per client project

Source: [Gmail API usage limits](https://developers.google.com/gmail/api/reference/quota).

- **Per project: 1,200,000 quota units/minute.** Per user per project:
  6,000 units/minute. `messages.get` = 20 units, `messages.list` = 5,
  `messages.send` = 100.
- The per-user quota protects any one mailbox; the per-project pool is the
  shared ceiling. A full initial sync of a 10,000-message mailbox costs
  ~200k units, so roughly six users can cold-sync simultaneously per minute
  before project-level 429s (steady-state incremental sync via `history.list`
  is far cheaper). Thousands of active users fit; big onboarding spikes
  throttle. Quota increases can be requested for verified apps.
- New in 2026: an **80,000,000 units/day** per-project threshold, free below
  it, with billing details "to be shared later in 2026." A popular shared
  client could eventually be a paid line item; watch this.

### 5. Precedents: everyone ships an embedded client id

- **Thunderbird** ships its Google client id and (non-confidential) secret
  in cleartext in the open-source tree:
  `mailnews/base/src/OAuth2Providers.sys.mjs` — clientId
  `406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com`,
  secret present, scope `https://mail.google.com/` (the broadest restricted
  scope) ([searchfox](https://searchfox.org/comm-central/source/mailnews/base/src/OAuth2Providers.sys.mjs)).
  Thunderbird is a verified local client; there is no evidence of a special
  contract beyond normal verification — it fits the local-client exemption
  the same way Wren would. Mozilla's tb-planning archives show they went
  through the standard registration path.
- **GNOME Online Accounts** builds with an embedded id
  (`-D google_client_id=595013732528-…`), used by Evolution/Geary via GOA
  ([BLFS build page](https://www.linuxfromscratch.org/blfs/view/svn/gnome/gnome-online-accounts.html)).
  Distros (Fedora, Debian, Ubuntu) each maintain their own client ids for
  their GOA builds — a pattern AGPL forks of Wren would repeat.
- **Mailspring** routes Gmail OAuth through its own id (historically via a
  small auth proxy); other Electron clients (e.g. the old WMail) embedded
  ids directly. The pattern is universal: no desktop mail client makes
  users create a Cloud project.

### 6. Abuse surface of a published client id (RFC 8252)

Source: [RFC 8252 §8.4–8.5](https://datatracker.ietf.org/doc/html/rfc8252#section-8.5).

- §8.5: "Secrets that are statically included as part of an app distributed
  to multiple users should not be treated as confidential secrets." Google's
  installed-app docs say the same — the "secret" of a Desktop-type client is
  not a secret, and Google treats the client as public.
- Risk: **client impersonation** — malware presenting Wren's client id gets
  Wren's consent screen branding and quota. Mitigations: the user still sees
  a real Google consent screen and must approve; PKCE (§8.1, Wren already
  does S256) prevents code interception; loopback redirect with exact-match
  binding (§7.3/§8.4) prevents code exfiltration to another host. Residual
  risk is reputational (a phisher borrowing the verified name) and
  quota-exhaustion; Google can and does suspend abused client ids, which
  would take every Wren user offline at once — the single-point-of-failure
  cost of a shared id. Keeping BYO-client supported hedges this.
- AGPL wrinkle: the id in an AGPL repo is world-readable by design. That is
  policy-compatible (Thunderbird, MPL, does the same), but forks must not
  reuse Wren's id — a NOTICE line and a build-time override keep forks
  honest, as GOA's build flag does.

## Recommendation

**Option (a), via the local-client path: ship one shared, verified client id,
and keep bring-your-own-client as a supported fallback.** Option (b) is a
dead end — the 100-user cap applies to published-unverified apps, so the
warning screen is not the price, extinction at 101 users is. Option (c) as
the *only* path contradicts Wren's public-readiness goal: no mainstream user
will create a Cloud project, enable an API, and paste a client id.

Concretely for P4:

1. Stand up the prerequisites Google demands: a homepage domain Wren owns
   (verified in Search Console), a privacy policy stating that mail data
   stays on-device, and a demo video of the OAuth flow.
2. Submit restricted-scope verification claiming the **local-client
   exemption** from the CASA assessment. Honest expectation: several weeks
   of review, possible back-and-forth, and an annual reverification chore.
   Budget **$0 if the exemption is granted; $540–$4,500/yr for CASA Tier 2
   if a reviewer decides Wren's agent features void it**. Both are viable
   for a solo project; the real cost is process time, not money.
3. Until verification lands (and forever, for forks and the distrustful),
   keep BYO client id working with better in-app guidance — P4's other half.
   This is also the escape hatch if the shared id is ever throttled or
   suspended.
4. Ship the id embedded in cleartext (per RFC 8252 §8.5 it is not a secret),
   keep PKCE S256 + exact loopback binding, add a build-time override for
   forks, and note in the README that forks must register their own id.
5. Watch two ledgers: per-project quota during launch spikes (request an
   increase once verified) and the 2026 Gmail API daily-threshold billing
   announcement.
