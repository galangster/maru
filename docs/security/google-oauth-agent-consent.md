# Google OAuth agent consent

## Two authorization layers

Maru uses two separate layers for agent access.

The first layer is a durable, revocable grant. A new agent starts with no capability. A person can grant `read`, `draft`, `archiveLabel`, or `send`. Each capability is independent. A send grant permits only a request for human approval. It never permits dispatch. Sources: `src/core/agents/grants.ts:11-32`, `src/core/agents/gateway.ts:133-187`, and `docs/PERMISSION-MODEL.md:104-116`.

The second layer is a time-bounded session. Sessions live only in memory. An app restart ends all sessions. The available durations are 15 minutes, 1 hour, and 8 hours. A person can end a session early. Sources: `src/core/agents/sessions.ts:1-15`, `src/core/agents/sessions.ts:33-89`, and `src/features/agents/agents-settings.tsx:330-368`.

A capability grant does not replace session consent. A live session does not add a capability. A mail tool runs only when both checks allow it. Source: `src/core/gateway-server/tools.ts:116-140`.

## Consent surface

Before a session starts, Settings shows:

- The agent name and creation date.
- Every currently allowed capability and its description.
- The mail data classes the current grants can expose.
- A warning that mail can leave Maru for the model or service used by the agent.
- A duration choice and a clear **Start session** action.

The data summary distinguishes message content, addresses, subjects, attachments, draft content, thread keys, and labels. The current warning says mail leaves Maru for the model or service used by the agent. Sources: `src/features/agents/agents-settings.tsx:264-368` and `src/features/agents/identity.tsx`.

> NOTE: Part 1 §2 requires the consent surface to show the likely provider path. The current session warning does not explicitly say that a hosted provider can process data outside the device. The public site does say this at `site/privacy.html:48-50`, but the in-app consent surface must state it before submission.

## Session-gated tools

These tools require an active session:

- `list_accounts`
- `search_mail`
- `read_thread`
- `get_attachment`
- `draft_new`
- `draft_reply`
- `request_send`
- `archive_thread`
- `modify_labels`
- `list_pending` (its queued reply drafts can quote mail content)

Only `maru_ping` works without a session. It exposes connection state, held capabilities, and session state — no mail data. Sources: `src/core/gateway-server/tools.ts`, the `restricted` field on every spec in `src/core/gateway-server/tools-read.ts` and `tools-write.ts`.

If no session is active, Maru refuses the tool, writes a blocked audit row, and requests that the person start a session. Source: `src/core/gateway-server/tools.ts:116-127`.

## Untrusted mail content

Maru tells the agent that message content and attachments are external data, not instructions. It wraps mail text between `[BEGIN UNTRUSTED MAIL CONTENT]` and `[END UNTRUSTED MAIL CONTENT]`. It strips matching markers from hostile mail before adding its own boundary. Sources: `src/core/gateway-server/tool-support.ts:28-31` and `src/core/gateway-server/tool-support.ts:76-82`.

Search snippets and message bodies use this wrapper. Attachment results include the same untrusted-data notice. A draft reply marks quoted message content as untrusted. Sources: `src/core/gateway-server/tools-read.ts:180-266`, `src/core/gateway-server/tools-read.ts:288-304`, `src/core/gateway-server/tools-read.ts:338-372`, `src/core/gateway-server/tools-read.ts:399-495`, and `src/core/gateway-server/tools-write.ts:243-335`.

Untrusted content cannot change grants. Every later tool call still passes through the session check and its own capability check. Agent sends still stop at the approval queue. Sources: `src/core/gateway-server/tools.ts:90-170` and `src/core/agents/gateway.ts:236-254`.

## Prompt-injection proof

`tests/injection.test.ts` contains these named cases:

- `wraps every body and neutralizes a spoofed boundary marker`
- `does not let hostile content change grants or authorize follow-up tools`
- `records the hostile subject as data and never copies body text into the audit row`
- `returns a hostile-named attachment as marked data and audits only its filename`

The fixture includes text that impersonates system instructions and JSON-RPC tool calls. The tests prove that it remains data, cannot grant `send` or `archiveLabel`, and leaves blocked audit rows. Source: `tests/injection.test.ts:19-28` and `tests/injection.test.ts:62-154`.

## Send approval boundary

Do not claim that send approval is consent for prior mail reads. Session consent authorizes restricted-data access for its stated duration. Send approval is a later, separate decision about one exact queued message. Sources: `src/core/agents/approvals.ts:50-83`, `src/core/agents/approvals.ts:110-149`, and `docs/research/shared-client-implementation-plan.md` Part 1 §1.

## Submission text

> The user must create an agent identity, grant capabilities, and approve a time-bounded agent session. Maru discloses that the selected client may use a hosted model provider. Maru sends mail data only after that contextual consent. Every send still requires separate human approval in Maru.

The submission text above is copied verbatim from `docs/research/shared-client-implementation-plan.md` Part 2 §7.
