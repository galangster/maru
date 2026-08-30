# P6 — `wren-mcp` on npm  `wayfinder:task`

status: closed · claimed: P6 lane, 2026-08-29 · blocked by: —

## Question → work

The real publish behind P1's name claim: package the shim with a `bin`
entry so `claude mcp add wren -- npx wren-mcp --token …` works, version
in lockstep with the app (the shim prints both on `--help`), publish at
flip, rewrite CONNECT-AN-AGENT's registration section to the npx form
with the repo path as the from-source alternative.

## Resolution

The flip is real (verified from outside: API `public`, anonymous 200s on
the repo and raw README — driven through the in-app browser after two
solo attempts stalled in GitHub's confirm flow). The package in
npm/wren-mcp/ is now the *real* shim: `bin/wren-mcp.mjs` verbatim (fully
self-contained, node builtins only), `bin` entry so `npx wren-mcp`
works, version in lockstep with the app, an npm README that leads with
the model, AGPL. CONNECT-AN-AGENT rewritten to the npx form with
from-source as the alternative; the "nothing is published" caveat
replaced. The `npm publish --access public` itself needs Nick's npm
session (this machine has none) — one login, then the publish runs.

**Published 2026-08-30 (small hours):** wren-mcp@0.1.0 on the registry,
by Nick's hand after the 2FA saga worth recording — npm now refuses
publishes from accounts without two-factor, the account had none (which
was the real cause of every 403, not a failed OTP), the enable flow
offers passkeys rather than authenticator codes, and a passkey means the
CLI's browser hand-off satisfies 2FA with no --otp at all. Verified from
outside: registry metadata correct, and a cold `npx -y wren-mcp --help`
in a clean directory fetched and ran the real shim.
