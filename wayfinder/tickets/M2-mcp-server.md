# M2 — MCP server in-app + stdio shim  `wayfinder:task`

status: closed · claimed: M2 lane, 2026-08-29 · blocked by: —

## Question → work

Host the MCP server inside the running Wren app; ship the thin stdio shim
(`wren-mcp`) that agents launch, connecting to the app (local socket/port,
authenticated). Agent identity + connection consent flow ("Claude Code
wants to connect to Wren"). Server enforces M1 grants on every call.

## Resolution

Shipped, in three layers with the protocol entirely in TypeScript.

`src-tauri/src/gateway.rs` is a dumb authenticated frame relay and holds no
MCP knowledge at all. It listens on a unix domain socket at
`<app-data>/gateway.sock` — 0600, inside a 0700 directory, stale file unlinked
on boot — and on a named pipe under `cfg(windows)`, both through one
`interprocess` listener so the Windows path is a maintained crate's problem
rather than hand-rolled FFI. Frames are newline-delimited JSON, capped at
1 MiB before the allocation rather than after, with eight concurrent
connections. Never a loopback port: `docs/research/mcp-gateway-notes.md` §1 is
explicit, and the DNS-rebinding advisories against the reference SDKs are what
happens to people who read it differently. Four commands
(`gateway_auth_result`, `gateway_reply`, `gateway_close`, `gateway_info`) and
three events carry everything.

`src/core/gateway-server/` is the app's half: a session manager that resolves
the first frame's credential through `AgentRegistry.verifyCredential` exactly
once per connection, then runs an MCP SDK `Server` per session over a custom
`RelayTransport`. The relay tags every later frame with the agent id that
credential resolved to, so no frame can name its own agent — the discipline
M1's registry.ts asked for, in one file where it can be read. `clientInfo`
from `initialize` reaches the audit log and nothing else.

Two tools ship as transport proof, M3 owns the real surface: `list_accounts`
(`readOnlyHint`, gated on the `read` grant through `AgentGateway.authorize`)
and `wren_ping` (no grant — an agent holding nothing must still be able to
find out that it holds nothing). A refusal is an ordinary `isError` tool
result, not a protocol error, so the model can read it and say what to ask a
human for. `authorize` writes the blocked row, so no denial is logged twice.

`bin/wren-mcp.mjs` is the shim: plain Node, no dependencies, no build step,
because an agent host launches it with whatever node is on PATH. It sends the
auth frame, waits for the relay's `auth_ok` ack before piping either
direction, and exits 2/3/4/5 with one clear stderr line for no-credential,
no-socket, rejected and dropped.

Consent: registering the shim is the consent step, exactly as it is for every
other stdio MCP server (notes §2 — Claude Desktop and Claude Code both gate at
registration, not at connection). The "Claude Code wants to connect" prompt
the map names is not built and stays open.

Demo mode is the dev affordance: Settings → Agents prints Scout's fixture
credential, which resolves against the seeded in-memory store exactly as a
real one resolves against SQLite, so the whole path — including the refusals —
is exercisable before Wren has been trusted with a mailbox.

Gates: typecheck clean · 334 tests green (310 + 24 new: framing round-trip and
both cap paths, transport isolation, auth accept/reject/revoked over a mocked
relay, the full MCP handshake, and tool authorisation including the denial and
a mid-session revoke) · build clean · `cargo build` clean, no warnings · live
smoke through the real socket: `node bin/wren-mcp.mjs --token …` driving
initialize, tools/list, wren_ping and list_accounts, all four asserted, and a
bad credential refused with exit 4.

Follow-on for M3: the tool surface plugs into `callTool` in
`gateway-server/tools.ts`; every new tool needs its `authorize` call and its
audit row, and `request_send` should go through `AgentGateway.requestSend`
rather than composing the two gates again. Windows and Linux compile but are
unverified by hand. `docs/CONNECT-AN-AGENT.md` carries the setup instructions
and the Testing-era caveats.
