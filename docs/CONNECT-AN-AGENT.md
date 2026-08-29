# Connect an agent to Wren

Wren hosts an MCP server inside the running app. Agents reach it through a
thin stdio shim, `bin/wren-mcp.mjs`, over a local socket only your own user
account can open. Nothing is exposed on a network port, and nothing works
until you have created an agent and handed it the credential Wren issues.

Wren must be **running** for any of this to work. The shim is a pipe, not a
server: if Wren is closed, the agent gets a clear error and no tools.

---

## 1. Create an agent in Wren

Settings → Agents → **Add an agent**. Give it a name — the name is a label for
you, not a login; it appears on every row that agent writes to the audit log.

Wren issues a credential and shows it **once**. Copy it then. Wren stores only
a SHA-256 digest of it, so "you won't see this again" is a fact about the
database rather than a policy: there is nothing left to show you.

A new agent holds **nothing**. It can connect and it can call `wren_ping`, and
that is all, until you grant it something. That is deliberate — see
[Grants](#4-what-the-agent-can-and-cannot-do).

### Trying it without a real mailbox

Run Wren in demo mode (`?demo=1`) and Settings → Agents shows a fixture agent,
**Scout**, with its credential printed in full. Scout is seeded into an
in-memory store that holds no real mail and reaches no real network, so its
credential is a fixture rather than a secret. Point a real agent at it to
watch the whole flow — including the refusals — before you trust Wren with a
mailbox.

---

## 2. Register the shim with your agent

### Claude Code

```sh
claude mcp add wren -- node /absolute/path/to/wren/bin/wren-mcp.mjs --token <credential>
```

Use an absolute path: the agent host launches the shim from its own working
directory, not from the repo.

If you would rather keep the credential out of your shell history and out of
`~/.claude.json`, drop the `--token` flag and set `WREN_AGENT_TOKEN` in the
environment the agent runs in instead.

### Claude Desktop

Settings → Developer → Edit Config, then add Wren to `mcpServers`:

```json
{
  "mcpServers": {
    "wren": {
      "command": "node",
      "args": ["/absolute/path/to/wren/bin/wren-mcp.mjs"],
      "env": {
        "WREN_AGENT_TOKEN": "<credential>"
      }
    }
  }
}
```

Claude Desktop needs a full restart to pick up config changes. The file lives
at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS
and `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

### Anything else that speaks MCP over stdio

Run `node bin/wren-mcp.mjs --help`. The shim takes `--token` / `WREN_AGENT_TOKEN`
and, if you have moved the socket, `--socket` / `WREN_GATEWAY_SOCKET`.

---

## 3. Check the connection

Ask the agent to call `wren_ping`. It needs no grant, which is the point of it
— an agent that holds nothing must still be able to find out that it holds
nothing.

```json
{
  "app": "Wren",
  "version": "0.1.0",
  "agent": { "id": "…", "name": "Scout" },
  "capabilities": ["read", "draft", "archiveLabel", "send"],
  "summary": "Connected as Scout. Holds read, draft, archiveLabel, send."
}
```

If the shim exits instead, the reason is on stderr and in the exit code:

| Code | Meaning |
| --- | --- |
| 2 | No credential was given. |
| 3 | Wren is not running, or the socket is not reachable. |
| 4 | Wren rejected the credential — wrong token, or the agent was revoked. |
| 5 | The connection dropped before the handshake finished. |

---

## 4. What the agent can and cannot do

Every capability is an explicit toggle in Settings → Agents, per agent:

- **read** — search and read mail.
- **draft** — compose drafts. A draft is not a send.
- **archive / label** — move mail out of the inbox and tag it.
- **send** — ask to send. Scoped: everyone, named domains, or named
  addresses. Every recipient of a message — to, cc *and* bcc — has to be
  admitted by one single grant, so one stranger on the cc line refuses the
  whole message.

Two rules are worth knowing before you grant anything:

1. **A grant is not a send.** `send` lets an agent put a message in the
   approval queue. A human approves it in Wren before anything leaves the
   machine. There is no setting that skips that.
2. **Revocation wins backwards.** Revoking a capability suppresses every older
   grant of it, so you never have to hunt for a second grant that is quietly
   still live.

Refusals come back to the agent as an ordinary tool result, not a crash, and
every refusal is written to the audit log. An agent quietly probing for
capabilities it does not hold is visible in the timeline rather than invisible
in a return value.

### Where approvals land

In Wren. A pending send raises a count badge in the sidebar footer, and an OS
notification you can tap. The queue itself is the surface behind that badge.
Nothing in MCP can approve anything: there is no deferred-approval primitive
in the protocol, so `tools/call` returns a pending id immediately and the
human resolves it in Wren's own UI.

### Where the record lives

Settings → Agents → **Open the audit log**, or the link from the approval
queue. Every connection, every tool call, every refusal, per agent, append-only.

---

## 5. How it actually connects

Worth knowing if you are auditing this rather than using it.

```
agent  ──stdio──▶  wren-mcp.mjs  ──unix socket──▶  Wren (Rust relay)  ──event──▶  Wren (webview)
                                    0600, in a 0700 dir                             MCP server
                                                                                    grants, audit
```

- The channel is a unix domain socket at
  `~/Library/Application Support/dev.wren.app/gateway.sock` on macOS,
  `$XDG_DATA_HOME/dev.wren.app/gateway.sock` on Linux, and the named pipe
  `\\.\pipe\dev.wren.app-gateway` on Windows. Never a loopback TCP port: the
  MCP security guidance is explicit that a localhost port is not an
  authentication story, and the DNS-rebinding advisories against the reference
  SDKs are what happens to people who assumed otherwise.
- The first frame of every connection is the credential, and it is resolved
  **once**, by Wren, before anything else is relayed. Every later frame is
  tagged with the agent id that credential resolved to.
- `clientInfo` from `initialize` — the name an MCP client gives for itself —
  is captured for the audit log and used nowhere else. It is self-reported and
  nothing in the MCP spec authenticates it, so no grant can hang off it.
- Frames are capped at 1 MiB and connections at 8.

---

## Testing-era caveats

Wren is pre-1.0 and this surface is a night old. Honestly:

- **Two tools ship today**: `list_accounts` and `wren_ping`. The real surface
  — search, read, draft, request_send, archive/label, list_pending — is M3.
  Connecting now proves the pipe, not the product.
- **macOS is the tested path.** The Windows named pipe compiles and is written
  against a cross-platform socket crate, but nobody has run it. Linux is in
  the same position.
- **The credential is a bearer token in a config file.** Anything that can
  read your `~/.claude.json` or your Claude Desktop config can connect as that
  agent. Prefer the environment variable, and revoke an agent the moment you
  suspect its config leaked — revocation takes effect on the next call, with
  no reconnect needed.
- **Wren does not hang up on you.** If you revoke an agent mid-session, its
  socket stays open and every call it makes is refused. The connection closes
  when the agent exits.
- **No connection consent screen yet.** Registering the shim is the consent
  step, exactly as it is for every other stdio MCP server. The map still lists
  a "Claude Code wants to connect to Wren" prompt as unbuilt.
- **Nothing is published.** There is no npm package and no registry entry; the
  shim is a file in this repo and the path in your config points at it.
