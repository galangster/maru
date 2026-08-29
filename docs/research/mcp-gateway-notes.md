# MCP gateway notes — app-hosted local server + stdio shim (ticket R2a)

Researched 2026-08-28 against the MCP spec (2025-06-18 normative pages, cross-checked
against the 2026-07-28 docs snapshot), Anthropic/Claude Code docs, and real shipping
desktop-app examples. CONFIRMED = stated directly by a primary source (quoted/cited).
UNCERTAIN = synthesis, community convention, or a real example that isn't spec-mandated.

Wren's shape: the app hosts the real MCP server logic; agents launch a thin stdio
binary that *is* the MCP server from the agent's point of view, but is really a shim
forwarding to the running app over some local channel. That channel is below MCP
entirely — the spec has no jurisdiction over it.

## 1. stdio-shim ↔ app channel: transport and auth

CONFIRMED — the security-best-practices doc addresses this shape directly under
"Local MCP Server Compromise": "MCP servers intending for their servers to be run
locally SHOULD implement measures to prevent unauthorized usage from malicious
processes: Use the `stdio` transport to limit access to just the MCP client...
Restrict access if using an HTTP transport, such as: Require an authorization token;
Use unix domain sockets or other Interprocess Communication (IPC) mechanisms with
restricted access." A bare loopback port is explicitly not enough — confirmed
independently by the DNS-rebinding CVEs against the reference SDKs (GHSA-w48q-cv73-mx4w
TS SDK, GHSA-9h52-p55h-vw2f Python SDK, GHSA-wqrj-vp8w-f8vh Apollo MCP server, all
"servers running on localhost" advisories).

Two channel choices, ranked:

1. **Unix domain socket (macOS/Linux) / named pipe (Windows), user-restricted perms
   (0600).** OS ACLs authenticate for free — only processes running as the same logged
   -in user can open it. Best fit for "shim and app run as the same user."
2. **Loopback HTTP port + per-launch random bearer token**, written by the app to a
   restricted-permission file the shim reads at startup. Simpler cross-platform, but
   only as secure as token generation/storage; never a fixed/default token.

UNCERTAIN, real examples for calibration (not spec-mandated):
- **Figma Desktop Dev Mode MCP server** — plain HTTP at `http://127.0.0.1:3845/mcp`,
  toggled on in Dev Mode, no documented token/auth beyond the toggle. A real shipped
  example of the weak pattern the spec warns against.
- **Blender MCP** — plain TCP JSON socket on `localhost:9876`, no auth documented.
- **Docker Desktop MCP Toolkit / `docker mcp gateway`** — defaults to `stdio` (no
  port, no network exposure); only binds TCP (default 8811, SSE) when remote access is
  explicitly turned on, with secrets/OAuth centralized in the gateway. Closest to best
  practice: closed by default, network surface opened on purpose only.

Recommendation for Wren (UNCERTAIN, synthesized): unix socket / named pipe under the
user's own runtime dir, 0600, app-created at launch; fall back to loopback HTTP + a
random per-session token file only if a platform makes sockets impractical. Never rely
on "it's on localhost" alone.

## 2. Client identity (clientInfo) and consent UI

CONFIRMED — `initialize` carries `clientInfo: { name, title, version }`, entirely
self-reported; nothing in the base spec authenticates it (basic/lifecycle page).

CONFIRMED — a fix is proposed but **not merged**: SEP-1289, "Client Identity
Verification in MCP" (github.com/modelcontextprotocol/modelcontextprotocol/issues/1289),
status as fetched: "Proposal (open, dormant, awaiting sponsor)." Would add a
reverse-domain client ID + short-lived JWT against a trust anchor. Until it lands,
**`clientInfo` is a display label, not a security boundary** — treat it that way in
Wren's app-side host.

CONFIRMED — the spec generalizes this distrust: "clients **MUST** consider tool
annotations to be untrusted unless they come from trusted servers" (server/tools) —
symmetric distrust is the spec-wide default.

Consent UI in practice:
- **Claude Desktop**: stdio servers in `claude_desktop_config.json` start silently at
  launch — no "X wants to connect" screen at registration; trust is implicit in the
  user having edited the config themselves. What *is* gated is each tool *call*: a
  per-call approval dialog unless the user sets Always Allow.
- **Claude Code CLI**: project-scoped servers from a cloned `.mcp.json` get a one-time
  explicit approval prompt ("so a repository you clone can't launch processes on your
  machine without your consent"), resettable via `claude mcp reset-project-choices`.
  Closest real analogue to "X wants to connect," and it fires at registration, not
  connection.
- Remote/OAuth servers show the third-party auth server's own consent screen, not an
  MCP-specific one.

Implication: put the real trust boundary at the shim↔app channel (§1); treat
clientInfo as advisory/display-only.

## 3. Tool annotations and conventions

CONFIRMED (server/tools) — `ToolAnnotations`: `title`, `readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`, all optional, all untrusted
unless from a trusted server. Quoted semantics: `destructiveHint` — "may perform
destructive updates (only meaningful when `readOnlyHint` is false)"; `idempotentHint`
— "calling the tool repeatedly with the same arguments has no additional effect (only
meaningful when `readOnlyHint` is false)." `readOnlyHint` default value not stated in
spec text (UNCERTAIN — treat unset as unknown, not false). `openWorldHint` exists in
schema; exact wording not captured this pass (UNCERTAIN, re-check if load-bearing).

Because Wren's server lives inside the user's own app (a trusted-server relationship),
its own annotations can legitimately be relied on by the connecting agent.

UNCERTAIN (community convention, not spec) — naming: `snake_case`, `verb_noun`
(`get_thread`, `search_threads`, `send_message`); >90% adoption reported across
surveyed servers in 2026 write-ups; consistency within one server matters more than
which style is chosen.

Result size / pagination:
- CONFIRMED — `tools/list`/`resources/list`/`prompts/list` use opaque cursor
  pagination (`cursor` in, `nextCursor` out); clients "MUST treat cursors as opaque."
  **This only covers listing tools/resources/prompts — there is no spec-level
  pagination primitive for a single tool's result content** (e.g. page 2 of a thread).
- UNCERTAIN (industry convention) — the converged pattern for large-document tools
  (mirrored by Gmail's own MCP tools) is: a `search`/`list` tool returns IDs + metadata
  only, never full bodies; a separate `get_thread`/`get_message` fetches one item's
  full content on demand. Push "too big" into list-summaries-then-fetch-detail rather
  than truncating one huge result.
- CONFIRMED (Anthropic, "Writing effective tools for AI agents") — Claude Code caps
  tool responses at 25,000 tokens by default; explicit guidance is "pagination, range
  selection, filtering, and/or truncation with sensible default parameter values," and
  descriptions should steer agents toward many small targeted calls over one broad one.

## 4. Elicitation / sampling / approval patterns

CONFIRMED (client/elicitation, introduced 2025-06-18, "design may evolve") —
`elicitation/create` lets a server pause mid-call and request structured input via the
client. Three response actions: `accept` (flat-schema primitives only — no nested
objects/arrays), `decline`, `cancel`. "Servers **MUST NOT** use elicitation to request
sensitive information." A boolean elicitation is a legitimate lightweight "confirm
this?" gate, but it's a data-collection primitive first, not a general approval
workflow.

CONFIRMED (client/sampling) — different primitive: `sampling/createMessage` lets a
server borrow the client's LLM. Spec mandates human review: "there **SHOULD** always
be a human in the loop with the ability to deny sampling requests," reviewed both
before and after the LLM call. For servers needing model access, not for approving a
tool's own side effect.

CONFIRMED (server/tools, "User Interaction Model") — the actual "needs human approval"
mechanism is the ordinary tool-invocation confirmation: "there **SHOULD** always be a
human in the loop with the ability to deny tool invocations... Present confirmation
prompts to the user." **No separate spec-level deferred/async-approval primitive
exists** — no "pending" call state, no callback/webhook concept. `tools/call` is
synchronous request/response only.

UNCERTAIN (synthesis, no named spec feature) — for genuinely deferred/queued
operations (e.g. "draft queued, needs approval before send," possibly cross-session),
the pattern in practice is app-level: the call returns immediately with a status/ID
(`"queued"`, `"pending_approval"`) in structured content; resolution happens in the
app's own UI; the agent polls a follow-up tool (`get_task_status`) or, if the server
supports server-initiated notifications, reuses `notifications/*`/
`resources/subscribe` machinery to push a "resolved" event. Composition of existing
primitives, not a named feature.

Implication: don't make `tools/call` hang on a human — return pending state
immediately and poll/subscribe for resolution. Elicitation can front-load a same-turn
yes/no when the client declares that capability, but never for anything the spec calls
sensitive.

## 5. Distribution norms

CONFIRMED (code.claude.com/docs/en/mcp-quickstart) — `claude mcp add` scopes:

| Scope | File | Available to |
|---|---|---|
| `local` (default) | `~/.claude.json`, project entry | you, this project only |
| `project` | `.mcp.json` in project root | everyone who clones the repo |
| `user` | `~/.claude.json`, top-level `mcpServers` | you, all projects |

Local stdio: `claude mcp add <name> -- <command> <args...>`. Remote/HTTP:
`claude mcp add --transport http <name> <url>`. Hand-written `.mcp.json` entries use
`"type": "stdio"|"http"` plus `command`/`args` or `url`. Project-scoped servers from a
cloned `.mcp.json` require one-time approval before they run (see §2), resettable via
`claude mcp reset-project-choices`.

CONFIRMED — Claude Desktop is a separate app/config: `claude_desktop_config.json`
(macOS `~/Library/Application Support/Claude/`; Windows `%APPDATA%\Claude\`), edited
via Settings → Developer → Edit Config, needs a full app restart to load changes.
Claude Code imports these via `claude mcp add-from-claude-desktop` (macOS/WSL only).

Registry: CONFIRMED to exist, UNCERTAIN on maturity for this use case. An official
community-run registry lives at `registry.modelcontextprotocol.io`
(github.com/modelcontextprotocol/registry) — a meta-registry of `server.json`
manifests (namespace, repo, install packages) while artifacts stay on npm/PyPI/etc.
Names use reverse-DNS namespacing tied to a verified GitHub account/domain — the
closest thing to identity verification anywhere in MCP today, but it's a
publishing/discovery registry, not runtime auth; doesn't change anything in §1.

UNCERTAIN (synthesized from Figma/Docker-desktop examples) — for an app-embedded
server like Wren's, the realistic path is: the app itself, on first run, writes (or
offers to write) the shim's entry into the user's `.mcp.json`/
`claude_desktop_config.json`, pointing at the shim binary it installed alongside
itself — rather than expecting the user to hand-author JSON or discover Wren via the
public registry. Figma's own docs hand the user a copy-pasteable
`claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp` for exactly
this reason.

## Sources

- MCP security best practices — https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
- MCP lifecycle (clientInfo) — https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- MCP tools (annotations) — https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP elicitation — https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
- MCP sampling — https://modelcontextprotocol.io/specification/2025-06-18/client/sampling
- MCP pagination — https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/pagination
- Connect to local MCP servers — https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers
- Claude Code MCP quickstart — https://code.claude.com/docs/en/mcp-quickstart
- SEP-1289 (client identity, unmerged) — https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1289
- Official MCP registry — https://github.com/modelcontextprotocol/registry, https://registry.modelcontextprotocol.io/
- Anthropic, "Writing effective tools for AI agents" — https://www.anthropic.com/engineering/writing-tools-for-agents
- Docker MCP Gateway — https://github.com/docker/mcp-gateway
- Figma Dev Mode MCP server setup — https://developers.figma.com/docs/figma-mcp-server/local-server-installation
- TS SDK DNS-rebinding advisory — https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w
- Python SDK DNS-rebinding advisory — https://github.com/modelcontextprotocol/python-sdk/security/advisories/GHSA-9h52-p55h-vw2f
- Apollo MCP server Host-header advisory — https://github.com/apollographql/apollo-mcp-server/security/advisories/GHSA-wqrj-vp8w-f8vh
