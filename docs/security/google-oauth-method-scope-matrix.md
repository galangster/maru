# Gmail method and scope matrix

## Current scope

Wren requests only `https://www.googleapis.com/auth/gmail.modify`. The code checks the granted `scope` field and rejects account setup when that scope is absent. Source: `src/core/auth/oauth.ts:16-17` and `src/core/auth/oauth.ts:158-225`.

Google describes `gmail.modify` as permission to read, compose, and send Gmail messages, except permanent deletion that bypasses Trash. The [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes) and each method reference below list the accepted authorization scopes.

## Matrix

| Gmail API method | Wren source line | Wren use | Why `gmail.modify` covers it |
| --- | --- | --- | --- |
| [`users.getProfile`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile) | `src/core/gmail/api.ts:241-243`; initial OAuth profile read at `src/core/auth/oauth.ts:450-457` | Gets the mailbox address and current history id. | The method accepts `gmail.modify`. No OpenID scope is needed for this Gmail profile. |
| [`users.labels.list`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/list) | `src/core/gmail/api.ts:245-247` | Lists system and user label definitions for display, sync, and label changes. | The method accepts `gmail.modify`, which includes label reads. |
| [`users.threads.list`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list) | `src/core/gmail/api.ts:250-261` | Lists thread ids for the 90-day cache window and searches Gmail query results. | The method accepts `gmail.modify`, which includes mailbox reads. |
| [`users.threads.get`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get) | Direct call at `src/core/gmail/api.ts:263-265`; batched calls at `src/core/gmail/api.ts:375-379` | Reads thread metadata and messages. Full format supplies bodies when the reading view requests them. | The method accepts `gmail.modify`, which includes thread and message reads. |
| [`users.messages.attachments.get`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get) | `src/core/gmail/api.ts:267-273` | Fetches one attachment's bytes when the user or an authorized agent requests it. | The method accepts `gmail.modify`, which includes attachment reads. |
| [`users.history.list`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list) | `src/core/gmail/api.ts:275-285` | Reads message and label changes after the stored history id for incremental sync. | The method accepts `gmail.modify`, which includes mailbox history reads. |
| [`users.messages.get`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get) | Batched calls at `src/core/gmail/api.ts:361-366` | Fetches message metadata or full message bodies in small batches. | The method accepts `gmail.modify`, which includes message reads. |
| [`users.threads.modify`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/modify) | `src/core/gmail/api.ts:384-389` | Adds or removes thread labels for archive, read state, stars, and user labels. | The method accepts `gmail.modify`, which includes mailbox label changes. |
| [`users.threads.trash`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/trash) | `src/core/gmail/api.ts:391-393` | Moves a thread to Trash. | The method accepts `gmail.modify`. Wren uses Trash instead of permanent deletion. |
| [`users.threads.untrash`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/untrash) | `src/core/gmail/api.ts:395-401` | Restores a thread from Trash. | The method accepts `gmail.modify`. |
| [`users.messages.send`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) | `src/core/gmail/api.ts:403-409` | Sends a human-composed message or an agent draft that a person approved in Wren. | The method explicitly accepts `gmail.modify`. A separate `gmail.send` request would add no capability. |

The batch endpoint at `src/core/gmail/api.ts:289-359` transports `users.messages.get` and `users.threads.get` calls. It does not add another Gmail method. The unused quota constants for `messages.list` and `messages.modify` at `src/core/gmail/api.ts:52-66` are not API calls and do not appear in the matrix.

Wren does not call Gmail draft, insert, import, or permanent-delete methods. Its implemented mutations use labels, Trash, untrash, and send. Source: `src/core/gmail/api.ts:239-409`.

> NOTE: Part 1 §3 and Part 1 §9 of `docs/research/shared-client-implementation-plan.md` describe the former multi-scope request and missing granted-scope check. Current code requests only `gmail.modify` and checks Google's granted scope. This matrix follows current code.

## Submission text

> Wren is an installed desktop Gmail client. It uses `gmail.modify` to list and read threads, messages, headers, bodies, and attachments. It uses the same scope to read mailbox history and labels, add or remove thread labels, and move threads to and from Trash. Wren also sends messages that a person composes or explicitly approves. Google's `users.messages.send` method accepts `gmail.modify`. Wren does not request `gmail.send` because that scope would be redundant. Wren does not request `mail.google.com` because Wren never permanently deletes messages or bypasses Trash. `gmail.compose` and `gmail.insert` cannot support Wren's mailbox reads and thread-label changes.

The submission text above is copied verbatim from `docs/research/shared-client-implementation-plan.md` Part 2 §7.
