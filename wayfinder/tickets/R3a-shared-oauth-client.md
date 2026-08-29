# R3a — A shared OAuth client?  `wayfinder:research` (AFK)

status: in progress · claimed: autonomous run, 2026-08-29 · blocked by: —

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
