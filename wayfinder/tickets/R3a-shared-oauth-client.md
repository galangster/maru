# R3a — A shared OAuth client?  `wayfinder:research` (AFK)

status: closed · claimed: autonomous run, 2026-08-29 · blocked by: —

## Question

Can Wren ship one published Google OAuth client id so strangers skip the
Cloud console entirely? Facts needed: Google's verification requirements
for gmail.readonly/send/modify scopes on a desktop PKCE public client
(client secrets are non-confidential for this type — R2b + gmail-api
notes already say so); the restricted-scope CASA assessment cost and
timeline; quota ceilings per client id; what open-source apps
(Thunderbird's approach) actually do; the abuse surface of a public
client id and its mitigations. Findings → docs/research/, with a
recommendation P4 can act on.

## Resolution

Closed 2026-08-29. Findings in `docs/research/shared-oauth-client.md`.
Answer: yes — ship one shared client id, but it must be *verified*.
Wren's `gmail.modify` scope is restricted (gmail.send is only sensitive),
and the 100-user hard cap applies to published-unverified apps too, so
"eat the warning screen" dies at user 101. The CASA security assessment
($540–$4,500/yr via Google-empanelled labs) has a **local-client
exemption**: apps that keep restricted data on-device are exempt from the
assessment, though annual verification (domain, privacy policy, demo
video, weeks of review) still applies — this is Thunderbird's path, whose
client id+secret sit in cleartext in its open tree (fine per RFC 8252
§8.5; Wren keeps PKCE + loopback binding). Recommendation for P4: pursue
verified shared client via the local-client exemption, keep BYO client id
as fallback and fork path, add a build-time id override.
