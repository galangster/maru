# wren-mcp

The stdio shim that connects an MCP client — Claude Code, Claude Desktop,
anything speaking MCP over stdio — to a running
[Wren](https://github.com/galangster/wren) app.

Wren must be running: the shim is a pipe to the app's local gateway
socket, not a server. Create an agent in Wren (Settings → Agents), copy
its credential, then:

```sh
claude mcp add wren -- npx wren-mcp --token <credential>
```

Prefer `WREN_AGENT_TOKEN` in the environment to keep the credential out
of config files. Every capability an agent holds is an explicit,
revocable grant, every send waits for human approval in Wren, and every
call lands in an append-only audit log — the full model is specified in
[PERMISSION-MODEL.md](https://github.com/galangster/wren/blob/main/docs/PERMISSION-MODEL.md).
