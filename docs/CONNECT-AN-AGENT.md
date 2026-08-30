# Connect an agent to Maru

Maru hosts an MCP server inside the running app. Agents reach it through a
thin stdio shim, `bin/maru-mcp.mjs`, over a local socket only your own user
account can open. Nothing is exposed on a network port, and nothing works
until you have created an agent and handed it the credential Maru issues.

Maru must be **running** for any of this to work. The shim is a pipe, not a
server: if Maru is closed, the agent gets a clear error and no tools.

Once connected, the first thing worth running is the story the gateway was
built for: **[TRIAGE-MORNING.md](TRIAGE-MORNING.md)** — the agent triages
your overnight inbox, and you wake to drafts waiting on your approval.

---

## 1. Create an agent in Maru

Settings → Agents → **Add an agent**. Give it a name — the name is a label for
you, not a login; it appears on every row that agent writes to the audit log.

Maru issues a credential and shows it **once**. Copy it then. Maru stores only
a SHA-256 digest of it, so "you won't see this again" is a fact about the
database rather than a policy: there is nothing left to show you.

A new agent holds **nothing**. It can connect and it can call `maru_ping`, and
that is all, until you grant it something. That is deliberate — see
[Grants](#4-what-the-agent-can-and-cannot-do).

### Trying it without a real mailbox

Run Maru in demo mode (`?demo=1`) and Settings → Agents shows a fixture agent,
**Scout**, with its credential printed in full. Scout is seeded into an
in-memory store that holds no real mail and reaches no real network, so its
credential is a fixture rather than a secret. Point a real agent at it to
watch the whole flow — including the refusals — before you trust Maru with a
mailbox.

---

## 2. Register the shim with your agent

### Claude Code

```sh
claude mcp add maru -- npx maru-mcp --token <credential>
```

Running from a checkout instead? Point at the file:
`claude mcp add maru -- node /absolute/path/to/wren/bin/maru-mcp.mjs --token <credential>`
(absolute path — the agent host launches the shim from its own working
directory, not from the repo).

If you would rather keep the credential out of your shell history and out of
`~/.claude.json`, drop the `--token` flag and set `WREN_AGENT_TOKEN` in the
environment the agent runs in instead.

### Claude Desktop

Settings → Developer → Edit Config, then add Maru to `mcpServers`:

```json
{
  "mcpServers": {
    "maru": {
      "command": "npx",
      "args": ["maru-mcp"],
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

Run `npx maru-mcp --help`. The shim takes `--token` / `WREN_AGENT_TOKEN`
and, if you have moved the socket, `--socket` / `WREN_GATEWAY_SOCKET`.

---

## 3. Check the connection

Ask the agent to call `maru_ping`. It needs no grant, which is the point of it
— an agent that holds nothing must still be able to find out that it holds
nothing.

```json
{
  "app": "Maru",
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
| 3 | Maru is not running, or the socket is not reachable. |
| 4 | Maru rejected the credential — wrong token, or the agent was revoked. |
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

### The tools

Eleven, and what each one needs:

| Tool | Grant | What it does |
| --- | --- | --- |
| `maru_ping` | — | Who this connection is, and what it currently holds. |
| `list_pending` | — | This agent's own send requests, and how each was resolved. |
| `list_accounts` | read | Account ids, addresses, display names, and each account’s own label names. |
| `search_mail` | read | Compact thread summaries. Never a message body. |
| `read_thread` | read | One thread in full, as plain text, with its attachment list. |
| `get_attachment` | read | One attachment, base64, up to 5 MB. |
| `draft_new` | draft | A normalised new message. Sends nothing, stores nothing. |
| `draft_reply` | draft | A reply, reply-all or forward, using Maru's own reply rules. |
| `request_send` | send | Puts a message — attachments included — in the approval queue. Never dispatches. |
| `archive_thread` | archive / label | archive, unarchive, trash, untrash. |
| `modify_labels` | archive / label | Add or remove `STARRED`, `UNREAD`, or the account’s own labels by name. |

Two shapes run through the whole surface, and a prompt written against it
should expect both.

**Summaries, then detail.** `search_mail` returns a subject, a sender, a date
and a 140-character snippet — never a body, however short the thread. Bodies
arrive only from `read_thread`, one named thread at a time, capped at 40,000
characters per message with `body_truncated` set when a message is longer than
that. That is the convention every large-document MCP server converged on, and
it is what keeps a wide search from silently losing its last results to a
client's response cap.

**Draft, then ask.** `draft_new` and `draft_reply` change nothing anywhere:
they parse the recipients, resolve the sending account, render the body and
hand the normalised message back. `request_send` takes those same fields and
queues them. Maru has no draft store in v1, so a draft an agent does not pass
on is a draft that never existed.

Two rules are worth knowing before you grant anything:

1. **A grant is not a send.** `send` lets an agent put a message in the
   approval queue. A human approves it in Maru before anything leaves the
   machine. There is no setting that skips that.
2. **Revocation wins backwards.** Revoking a capability suppresses every older
   grant of it, so you never have to hunt for a second grant that is quietly
   still live.

Refusals come back to the agent as an ordinary tool result, not a crash, and
every refusal is written to the audit log. An agent quietly probing for
capabilities it does not hold is visible in the timeline rather than invisible
in a return value.

### Where approvals land

In Maru. A pending send raises a count badge in the sidebar footer, and an OS
notification you can tap. The queue itself is the surface behind that badge.
Nothing in MCP can approve anything: there is no deferred-approval primitive
in the protocol, so `tools/call` returns a pending id immediately and the
human resolves it in Maru's own UI.

### Where the record lives

Settings → Agents → **Open the audit log**, or the link from the approval
queue. Every connection, every tool call, every refusal, per agent, append-only.

---

## 5. How it actually connects

Worth knowing if you are auditing this rather than using it. The full
model — identity, grants, evaluation rules, queue, audit — is specified in
[PERMISSION-MODEL.md](PERMISSION-MODEL.md).

```
agent  ──stdio──▶  maru-mcp  ──unix socket──▶  Maru (Rust relay)  ──event──▶  Maru (webview)
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
  **once**, by Maru, before anything else is relayed. Every later frame is
  tagged with the agent id that credential resolved to.
- `clientInfo` from `initialize` — the name an MCP client gives for itself —
  is captured for the audit log and used nowhere else. It is self-reported and
  nothing in the MCP spec authenticates it, so no grant can hang off it.
- Frames are capped at 1 MiB and connections at 8.

---

## Testing-era caveats

Maru is pre-1.0 and this surface is a night old. Honestly:

- **Labels are applied, never invented.** `modify_labels` takes your own
  Gmail labels by name (`list_accounts` shows them), but an agent cannot
  create a new label — an unknown name is refused with the list of what
  exists.
- **Outgoing attachments are small.** `request_send` takes base64
  attachments up to 500 KB per file and 600 KB per message — the whole
  request has to fit the gateway's 1 MiB frame. The approval card shows
  the file list, so what leaves the machine is what a person saw.
- **macOS is the tested path.** The Windows named pipe compiles and is written
  against a cross-platform socket crate, but nobody has run it. Linux is in
  the same position.
- **The credential is a bearer token in a config file.** Anything that can
  read your `~/.claude.json` or your Claude Desktop config can connect as that
  agent. Prefer the environment variable, and revoke an agent the moment you
  suspect its config leaked — revocation takes effect on the next call, with
  no reconnect needed.
- **Maru does not hang up on you.** If you revoke an agent mid-session, its
  socket stays open and every call it makes is refused. The connection closes
  when the agent exits.
- **Consent is a notice, not a gate.** Registering the shim is the consent
  step, exactly as for every other stdio MCP server — and the first time a
  credential is ever used, Maru says so: an OS notification, and an audit
  row in its own words. That first connection is the moment a copied
  credential would surface. Nothing blocks; a new agent holds nothing
  until you grant it something.
- **The shim is `maru-mcp` on npm**, versioned with the app; the file in
  this repo (`bin/maru-mcp.mjs`) is the same code for from-source runs.
