# Public-readiness audit  `2026-08-29`

What flipping galangster/wren public would expose, scanned tree **and**
full git history. Verdict up front: **none of the secret shapes this
project handles appear anywhere — tree or history — so nothing suggests a
rewrite.** Confirmed 2026-08-29: `gitleaks detect --log-opts=--all` over
all 34 commits — **no leaks found** — on top of the shape-based scan
below, making the claim unconditional. Three small items are worth a decision first, none
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

- ~~gitleaks pass~~ — done, clean (34 commits).
- ~~SECURITY.md~~ — written.
- ~~Anron license line~~ — written (all-rights-reserved, Wren-build
  exception, lucide fallback).
- CI badge + `windows-build.yml` will run on a public repo's actions
  minutes — confirm billing posture.
- The delta doc references private-era commit hashes; they resolve once
  public, nothing to do.
