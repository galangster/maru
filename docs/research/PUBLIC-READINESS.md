# Public-readiness audit  `2026-08-29`

What flipping galangster/wren public would expose, scanned tree **and**
full git history. Verdict up front: **none of the secret shapes this
project handles appear anywhere — tree or history — so nothing suggests a
rewrite.** The scan is shape-based (the patterns below), not
entropy-based: run `gitleaks` over history at flip time to make the claim
unconditional. Three small items are worth a decision first, none
blocking.

## Scanned

- Secret shapes: `GOCSPX-` (Google client secrets), `AIza…` (API keys),
  long `wren_agent_…` tokens, `client_secret` values — tree and
  `git log -S` over all history.
- Personal data: real email addresses, real names, machine paths.
- Credential fixtures and captures.

## Findings

**Clean:**

- No real Google OAuth client id or secret anywhere, in any revision. The
  only `GOCSPX` strings are a test fixture (`GOCSPX-testsecret`) and the
  settings placeholder (`GOCSPX-…`). Users bring their own client per
  SETUP-GOOGLE-OAUTH.md — nothing baked in.
- The only full agent credential in tree is Scout's, which is *designed*
  to be public (`…demo-scout-fixture-not-a-secret`, printed by demo mode).
- No real mailbox data. Every capture and fixture is the invented demo
  cast; the real-account era left no addresses, tokens, or message
  content in the repo or its history.
- Nick's personal email appears nowhere in tree or history.

**Decisions before the flip (Nick):**

1. **Handoffs and wayfinder are the build's inner monologue.** They name
   local paths (`/Users/galangster/…`), spend figures' context, rulings,
   and process. Nothing secret — but it is a different register than the
   docs. Options: keep them (radical transparency reads well for this
   project's thesis), or move `handoffs/` + `wayfinder/` out before the
   flip. Recommendation: keep; they are the audit log of the audit-log
   app.
2. **Anron icons.** `src/assets/icons/anron/` ships 42 glyphs from your
   own Figma library. The README now says "by the author's permission" —
   before public, that needs a real license line (keep them proprietary
   with a named exception for Wren builds, or license them outright).
3. **The demo cast uses "Nick Galang" as the account owner's name.**
   Fictional context, your real name. Fine if intended (it reads as a
   signed demo); one grep to rename if not.

**Housekeeping (no decision needed, do at flip time):**

- Run `gitleaks detect --source . --log-opts=--all` once (not installed
  on this machine today) to upgrade the shape-scan into a full ruleset +
  entropy pass.
- Add a `SECURITY.md` (where to report, what the socket trusts).
- CI badge + `windows-build.yml` will run on a public repo's actions
  minutes — confirm billing posture.
- The delta doc references private-era commit hashes; they resolve once
  public, nothing to do.
