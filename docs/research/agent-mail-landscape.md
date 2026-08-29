# Agent + Email Landscape (August 2026)

Research for ticket R2b, positioning Wren's "local-first agent gateway to your
own mail" thesis. All facts below are sourced; star counts fetched live from
GitHub and are approximate as of 2026-08-28.

## 1. Bare email MCP servers on GitHub

None of the servers below — including the two most-starred ones — has a
per-action approval, confirmation, or audit-log layer. Safety, where it
exists at all, is a coarse launch-time flag (read-only mode, a disabled-tools
list), not a runtime human-in-the-loop gate.

| Server | Stars/Forks | Capabilities | OAuth handling | Approval/audit layer |
|---|---|---|---|---|
| [taylorwilsdon/google_workspace_mcp](https://github.com/taylorwilsdon/google_workspace_mcp) | 3.1k / 966 | Full Google Workspace incl. Gmail: search, send, draft, labels, filters, attachments (15 Gmail tools) | Bring-your-own Google Cloud OAuth client; OAuth 2.1 PKCE supported; encrypted disk-backed token cache (local dir, GCS+CMEK, or Redis/Valkey) | `--read-only` flag and `--disabled-tools`/`--permissions` allow-list at server launch only. No per-send confirmation, no audit log. Docs explicitly warn about prompt injection from email content. |
| [GongRzhe/Gmail-MCP-Server](https://github.com/GongRzhe/Gmail-MCP-Server) | ~1.2k / 411 | Send (w/ attachments, HTML, CC/BCC), draft, read, search, permanent delete, label CRUD, batch modify/delete, filters | User supplies own Google Cloud Console OAuth JSON; tokens cached at `~/.gmail-mcp/`; scopes undocumented | None documented. Actions execute immediately on model request. **Archived (read-only) March 3, 2026** — unmaintained since Aug 2025 with 72+ open PRs before archival. |
| [ArtyMcLabin/Gmail-MCP-Server](https://github.com/ArtyMcLabin/Gmail-MCP-Server) | active fork | Same as GongRzhe (fork picked up after abandonment); published as `@artymclabin/gmail-mcp` on MCP Registry/Smithery | Inherited from upstream | Inherited — none |
| [shinzo-labs/gmail-mcp](https://github.com/shinzo-labs/gmail-mcp) | ~44–53 / ~20–35 | Standard Gmail API wrapper: send/read/search/manage | Standard Google OAuth | None documented |
| [cablate/mcp-google-gmail](https://github.com/cablate/mcp-google-gmail) | moderate (uncounted) | "Comprehensive Gmail integration with LLM processing" | Standard Google OAuth | None documented |
| [mpalermiti/outlook-mcp](https://github.com/mpalermiti/outlook-mcp) | uncounted, actively promoted | 62 tools / 13 categories: mail, calendar, contacts, tasks, drafts, attachments, delta queries, digest, bulk read | Microsoft Graph OAuth, personal accounts | None documented |
| [elyxlz/microsoft-mcp](https://github.com/elyxlz/microsoft-mcp) | uncounted, widely listed in "awesome MCP" round-ups | "Minimal, powerful" Graph API toolkit: Outlook, Calendar, OneDrive, Contacts | Microsoft Graph OAuth | None documented |
| [codefuturist/email-mcp](https://github.com/codefuturist/email-mcp) | uncounted | Most feature-rich generic IMAP+SMTP server found: 47 tools, 7 prompts, 6 resources, OAuth2 support, scheduling, calendar extraction, analytics | OAuth2 supported | None documented |
| [dominik1001/imap-mcp](https://github.com/dominik1001/imap-mcp) | 14 / 2 | Minimal — only exposes a `create-draft` tool, no send/read/search | Plaintext IMAP password via env vars, no OAuth | None documented |
| [mattias242/mcp-imap-server](https://github.com/mattias242/mcp-imap-server) | small | Markets itself as "secure, **read-only** access" to Gmail/Outlook/Yahoo/custom IMAP | IMAP creds | Read-only-by-design is the one real (if crude) permission floor found among popular servers |

**The one near-exception, at essentially zero adoption:** [outlook-agent](https://github.com/topics/email-agent?o=desc&s=stars) (3 stars) bills itself as a "safety-focused MCP bridge for AI agents accessing Outlook with metadata-first reads and reviewed sends" — the only bare MCP server surfaced in this research that is explicitly built around a review/approval concept. It has not gained traction.

Adoption proxy read: the Google Workspace and Gmail wrappers cluster at
hundreds-to-low-thousands of stars; IMAP-generic and Outlook/Graph servers
trail well behind (tens of stars, fragmented across many near-duplicate
repos, no clear leader). No server in either category has consolidated
adoption the way, say, filesystem or GitHub MCP servers have.

## 2. Cloud AI-mail products

| Product | Agent/API/MCP story | What runs through their servers | Pricing |
|---|---|---|---|
| [Shortwave](https://www.agentys.io/en/blog/shortwave-review) | "Tasklet" agent layer (launched Jan 2026): scheduled/triggered automations that draft-and-send, organize, connect to "thousands of apps." No public developer API/MCP found. Gmail-only — no Outlook/IMAP/Exchange/Yahoo/iCloud. | All mail processing, Gmail API access | Business $24/mo, Premier $36/mo, Max $100/mo (annual, per seat) |
| [Notion Mail](https://efficient.app/apps/notion-mail) | AI auto-labeling and reply drafting bundled into Notion AI (Business plan). Gmail-only. Notion itself ships a broader hosted MCP server (18 tools) but that's for the Notion workspace, not mail-specific agent access. | Google Workspace + Notion servers | Free client; AI features require Notion Business ($20/user/mo). **Notion Mail is shutting down Sept 22, 2026.** |
| [Superhuman](https://fast.io/resources/superhuman-ai-review-2026/) | Auto Drafts (Oct 2025) trains on the user's sent mail to draft in their voice; Summarize, Ask AI, Auto Labels. Framed as individual productivity, not workflow automation; no public agent API/MCP found. Acquired by Grammarly (~$825M, closed Oct 2025), still runs as independent brand. | All mail through Superhuman's servers | $30/mo |
| [Fyxer](https://www.fyxer.com/ai-email-assistant) | Server-side overlay on Gmail/Outlook: inbox triage, reply drafting, meeting notes from calendar invites. Google- and Microsoft-verified apps. No public agent API/MCP found; positions as end-user product, not developer platform. ~180k users, ~$17M ARR, $40M raised (Series B Sept 2025, Madrona, Marc Benioff). | All mail + meeting audio through Fyxer's servers | Not disclosed in sources reviewed |

Common thread: every cloud AI-mail product processes mail through its own
servers, none publish a first-class agent/developer API for mail actions
(beyond generic app-integration webhooks), and none advertise per-action
approval or an audit trail as a feature — the "AI drafts, human sends" model
is implicit UI behavior, not a governance primitive.

## 3. "Agentic email" / "email for agents" claims

- **[AgentMail](https://www.agentmail.to)** is the clearest match: positions itself as "Email Inboxes for AI Agents," giving each agent its own address, persistent inbox object, auto-threading, webhooks/WebSockets. Per [its Resend comparison](https://www.agentmail.to/blog/agentmail-vs-resend): per-inbox API keys/scoped credentials, "Inbox Pods" for tenant isolation, sender allow/blocklists, and explicitly "**Drafts support human-in-the-loop approvals**" — the only product found in this whole survey that names human approval as a feature. No audit-trail claim found. Cloud-only SaaS (SOC 2 Type II for enterprise); no local-first or self-host option. This is agent-owns-an-inbox, not agent-accesses-your-personal-inbox — a different problem from Wren's.
- **[Nylas](https://www.nylas.com/pricing/)**: unified OAuth/API layer across Gmail, M365, Exchange, Yahoo, iCloud, IMAP ($15/mo + $2/account beyond 5). Historically couldn't provision new inboxes — every account needed human OAuth. Closed that gap in 2026 with beta **Agent Accounts**: Nylas-hosted mailboxes provisioned via API (100 sends/day, 1GB, 7-day retention default), custom domains, IMAP/SMTP. Same agent-owns-a-mailbox model as AgentMail, not personal-inbox access.
- **[Resend](https://www.agentmail.to/blog/best-email-api-for-ai-agents-2026)** shipped a first-party MCP server April 7, 2026 (10 tool groups: emails, inbound, contacts, broadcasts, domains, webhooks, segments, topics, properties, API keys) and inbound-via-webhook since Nov 2025. No inbox object, no thread model, no per-agent provisioned address, no approval concept — outbound-delivery-first, not an agentic-mail product.
- **[e2a](https://github.com/topics/email-agent?o=desc&s=stars)** (184 stars, most-starred repo tagged `email-agent`): "open source email gateway for AI agents" — SPF/DKIM-verified inbound, HMAC-signed delivery, webhook+WebSocket fan-out. Infra-layer, no approval/permission model documented.
- **[GmailInbox](https://github.com/topics/email-agent?o=desc&s=stars)** (0 stars): billed as "local-first Gmail command center for queue triage, evidence-backed agent outputs, and approval-gated replies" — conceptually the closest thing to Wren's thesis found anywhere in this research, and it has zero adoption. Strong existence-proof that the idea is obvious but nobody has made it stick yet.
- **ChatGPT (OpenAI)** is the most consequential signal, and not from a mail-focused vendor: OpenAI's native Gmail connector can "search, read, and draft from your inbox," and as of mid-2026 can **send a message you approve** — a real per-message approval gate shipped by a big lab, inside a general chat UI, cloud-hosted, single account. ([source](https://www.dragapp.com/blog/best-ai-agents-for-gmail/), [source](https://www.dragapp.com/blog/connect-gmail-to-chatgpt/)) Gemini, by contrast, is built into Gmail itself (drafting, summaries, inbox Q&A) with no separate agent/approval framing. This means the "approval before send" idea is not unclaimed — it already exists, just not local-first, not multi-account, not audited, not in a real client.

## 4. Gap analysis

**What nobody offers today, found across ~20 products/repos surveyed:** a
local-first store of the user's own mail + graduated/scoped permissions +
a standing human-approval queue (not just per-send) + an audit log + real
multi-account handling, inside an actual mail client (not a chat window
bolted onto one account). The closest conceptual match, GmailInbox, exists
and has zero users. AgentMail/Nylas Agent Accounts solve an adjacent
problem (agent owns its own mailbox) that is architecturally opposite to
"agent operates your real inbox." ChatGPT's send-approval is the only
shipped human-gate in the entire survey, and it's single-account,
cloud-hosted, and outside any real mail client. **Verdict: the gap is real
and currently unclaimed at the intersection of local-first + multi-account +
graduated permissions + audit — but the individual ingredients (approval
gates, unified OAuth, provider abstraction) each already exist elsewhere, so
Wren's pitch must be "the combination nobody assembled," not "approval gates
for email," which OpenAI already shipped.**

**Table-stakes Wren v1 must match to be taken seriously** (drawn from what
the popular bare servers already do):
- Full CRUD parity with GongRzhe/google_workspace_mcp: send (attachments,
  HTML, CC/BCC), draft, read w/ MIME handling, search (provider query
  syntax), label/folder management, batch operations.
- Multi-provider from day one or a credible roadmap — Nylas and AgentMail
  both already unify Gmail/M365/Exchange/Yahoo/iCloud/IMAP; being Gmail-only
  reads as behind, not focused (Shortwave and Notion Mail were both
  criticized/limited for exactly this).
- A real OAuth story: bring-your-own client-credentials is the norm among
  bare MCP servers, but see the policy risk below — Wren needs a path past
  the 7-day test-token wall that none of the surveyed bare servers solve.
- At minimum a read-only / write-disabled mode (the one safety feature that
  does exist among popular servers) as the floor, with graduated
  per-action approval as the actual differentiator above that floor.
- Prompt-injection awareness: google_workspace_mcp's docs explicitly flag
  that email content can carry hidden instructions to the model — Wren's
  approval layer should be positioned partly as a prompt-injection mitigation,
  not just a "don't fat-finger send" feature.

## 5. Policy risk: Google OAuth vs. agentic access

- Google's **restricted-scope verification** (most useful Gmail scopes —
  send, modify, full access — are "restricted") requires an app-review
  process that can take several weeks, plus an annual **CASA** (Cloud
  Application Security Assessment) security audit for apps that store or
  transmit restricted-scope data on their own servers. CASA has three
  tiers — Tier 1 self-assessment, Tier 2 third-party DAST scan, Tier 3 full
  penetration test — and required assurance level can be **raised** based on
  user base or data-handling changes. ([source](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [source](https://deepstrike.io/blog/google-casa-security-assessment-2025))
- **Concrete, immediate risk for every bare MCP server surveyed in §1**:
  Google auto-expires refresh tokens after **7 days** for any OAuth client
  in "Testing" publish status (i.e., unverified — which is what "bring your
  own Google Cloud OAuth client" defaults to). None of the servers reviewed
  document a path around this; users following their setup instructions
  will find their MCP server silently stops working weekly until they
  either add themselves as a permanent test user workaround or the
  developer completes full verification. ([source](https://www.unipile.com/google-oauth-refresh-token/))
  This is a real, current wedge for Wren: **local-first + doesn't store
  restricted-scope data server-side** may reduce or avoid CASA exposure
  entirely (data never leaves the user's machine to a Wren-operated server),
  which none of the cloud AI-mail products in §2 can claim.
  This should be verified precisely against Google's current CASA scoping
  language before being used as a marketing claim — the assessment trigger
  is about data "stored or transmitted... on servers," and a local-first
  architecture's exact exposure needs a security/legal read, not just this
  research pass.
- No direct evidence found of Google specifically tightening policy *for
  agentic use* as a distinct category as of Aug 2026 — the restricted-scope
  and CASA regime is the same one that predates the agent wave and applies
  uniformly to any third-party Gmail-scope app, human-facing or agentic.
  Treat "Google is cracking down on agents specifically" as **unconfirmed**;
  what's confirmed is that the existing restricted-scope/CASA machinery is
  a real cost every Gmail-touching product (agentic or not) already pays or
  routes around, and bare MCP servers currently mostly ignore it.

## Sources consulted

GitHub repos and their README/stats pages (linked inline above); AgentMail
blog (agentmail.to/blog); Nylas CLI guides and pricing page; Google
Developers docs on restricted-scope verification and OAuth production
readiness; deepstrike.io CASA writeup; unipile.com OAuth refresh-token
explainer; dragapp.com ChatGPT/Gmail integration writeups; product review
sites for Shortwave/Superhuman/Fyxer/Notion Mail (agentys.io, fast.io,
fyxer.com, efficient.app) cross-checked against each vendor's own pricing
page where linked.
