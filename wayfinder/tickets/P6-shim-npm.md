# P6 — `wren-mcp` on npm  `wayfinder:task`

status: open · claimed: — · blocked by: P1 (flip)

## Question → work

The real publish behind P1's name claim: package the shim with a `bin`
entry so `claude mcp add wren -- npx wren-mcp --token …` works, version
in lockstep with the app (the shim prints both on `--help`), publish at
flip, rewrite CONNECT-AN-AGENT's registration section to the npx form
with the repo path as the from-source alternative.
