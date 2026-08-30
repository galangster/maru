# Google OAuth data flow

## Architecture

Maru is an installed desktop client. The app uses a system browser and a loopback callback for OAuth 2.0 with PKCE. It requests only `gmail.modify`. The OAuth authorization, token, and Gmail endpoints are Google endpoints. OAuth tokens stay in the operating-system keychain. Sources: `src/core/auth/oauth.ts:1-17`, `src/core/auth/oauth.ts:126-151`, and `src/core/auth/oauth.ts:410-457`.

Maru fetches Gmail data directly from Google over TLS. It stores the local mail cache in SQLite. Content columns use AES-256-GCM with one key per account. The operating-system keychain stores those keys. Sources: `src/core/gmail/api.ts:40-42`, `src/core/gmail/api.ts:188-228`, `src/core/store/db.ts:41-185`, `src/core/store/db.ts:253-269`, and `SECURITY.md:29-40`.

The optional MCP gateway uses a user-restricted local socket or named pipe. It is not a TCP listener. A user-created agent client can receive selected mail data only during an active, time-bounded session. Some agent clients send their tool results to a hosted model provider. Maru discloses that possible provider path before session consent. Sources: `SECURITY.md:17-20`, `src/core/agents/sessions.ts:1-15`, `src/core/gateway-server/tools.ts:116-127`, and `src/features/agents/agents-settings.tsx:264-368`.

An agent cannot dispatch mail. An agent send request enters Maru's approval queue. A person must approve the exact queued message in Maru before Maru calls Gmail. Sources: `src/core/agents/gateway.ts:236-254`, `src/core/agents/approvals.ts:50-83`, and `src/core/agents/approvals.ts:110-149`.

## Complete flow

```mermaid
flowchart LR
  Google[Google OAuth and Gmail APIs]
  Hosted[Possible hosted model provider]

  subgraph Device[User device]
    Browser[System browser and loopback OAuth callback]
    Maru[Maru desktop process]
    Keychain[(OS keychain\nOAuth tokens and per-account keys)]
    SQLite[(Local SQLite cache\ncontent columns encrypted)]
    Gateway[Local MCP socket or named pipe]
    Agent[User-selected local agent client]
    Queue[Maru send approval queue]
    Human[Human approval in Maru]
  end

  Maru --> Browser
  Browser -->|OAuth authorization and callback| Google
  Maru <-->|TLS Gmail API calls| Google
  Maru --> Keychain
  Maru --> SQLite
  Maru -->|session-gated selected data| Gateway
  Gateway --> Agent
  Agent -.->|possible disclosed provider hop| Hosted
  Agent -->|request_send| Gateway
  Gateway --> Maru
  Maru --> Queue
  Queue --> Human
  Human -->|approve exact queued message| Maru
  Maru -->|users.messages.send over TLS| Google
```

## Network boundary

Maru has no telemetry server and no Maru-operated mail server. Maru opens no other network path for Gmail data. Its direct remote peers are Google's OAuth and Gmail endpoints. The OAuth callback and agent gateway are local endpoints. A hosted-model transfer is a separate hop made by the user-selected agent client after Maru's session consent. Source: `SECURITY.md:10-20`.

> NOTE: `site/index.html:46` and `site/privacy.html:46` say that Google is the only network peer for mail. Those absolute sentences can hide the disclosed agent-provider hop. The same pages disclose that hop at `site/index.html:39-40` and `site/privacy.html:48-50`. Review the absolute sentences before submission. This document follows the complete current path.
