# P6 — `wren-mcp` on npm  `wayfinder:task`

status: closed (publish pending npm login) · claimed: P6 lane, 2026-08-29 · blocked by: —

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
