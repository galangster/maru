# M2 — MCP server in-app + stdio shim  `wayfinder:task`

status: open · claimed: — · blocked by: M1, R2a

## Question → work

Host the MCP server inside the running Wren app; ship the thin stdio shim
(`wren-mcp`) that agents launch, connecting to the app (local socket/port,
authenticated). Agent identity + connection consent flow ("Claude Code
wants to connect to Wren"). Server enforces M1 grants on every call.
