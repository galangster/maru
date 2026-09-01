# M3 — The v1 tool surface  `wayfinder:task`

status: closed · claimed: M3 lane, 2026-08-29 · blocked by: —

## Question → work

The ~8 send-gated tools over MailService: list_accounts, search_mail,
read_thread, get_attachment, draft_new, draft_reply, request_send (→
approval queue), archive/label (grant-gated), list_pending. Typed schemas,
result-size discipline (agents get compact thread summaries, not raw
dumps), tests against the demo service.

## Resolution

Eleven tools ship, and one path through all of them.

`gateway-server/tools.ts` is now a registry and a shared path rather than a
switch: `callTool` is the only place that authorises and the only place that
writes to the audit log. A handler returns the row it wants written and never
appends one itself, so a success logs once, a refusal logs once, and a grant
denial logs once — inside `AgentGateway.authorize`, which already wrote it.
Two rows for one call is the failure that shape exists to make impossible; the
timeline is the human's only account of what an agent did, and one that
double-counts is one nobody can read for a number. `tests/tools.test.ts` pins
it across thirteen representative calls, refusals included.

The surface, and the grant each tool needs:

    search_mail      read          summaries, never bodies
    read_thread      read          one thread, plain text, capped at 40k/message
    get_attachment   read          one file, base64, capped
    list_accounts    read          ids, addresses, display names
    draft_new        draft         a normalised draft, stored nowhere
    draft_reply      draft         the composer's own reply rules
    request_send     send*         queues for a human; never dispatches
    archive_thread   archiveLabel  archive, unarchive, trash, untrash
    modify_labels    archiveLabel  STARRED and UNREAD
    list_pending     —             an agent's own submissions
    wren_ping        —             am I connected, and what do I hold

`request_send` is the starred one: it is authorised *inside*
`AgentGateway.requestSend`, per recipient, because M1 rule 9 needs the whole
recipient list and one grant has to admit every address on it. Checking the
capability again in the shared path would evaluate the scope twice and log the
refusal twice. Its denial names the addresses that failed and nothing else, so
a model can drop them and retry instead of guessing.

Result-size discipline is the research notes' §3 convention, taken literally.
`search_mail` returns a subject, a sender, a date and a 140-character snippet
and never a body, however short — a search that returned bodies would be a
search whose last results silently do not exist behind a client's 25k-token
cap, with nobody told which ones. Bodies arrive only from `read_thread`, one
named thread at a time, as plain text through the existing `htmlToText`, cut at
40,000 characters per message with `body_truncated` and `body_total_chars` set.
`get_attachment` carries two caps rather than one: the 5 MB product rule the
ticket asks for, and a second, tighter one — base64 is four bytes out for every
three in and the whole response is one 1 MiB frame, so a 900 KB PDF cannot be
delivered whatever the product rule says. Refusing with the real number beats
encoding a frame `encodeFrame` throws on, which would take the answer down
without telling the agent why.

Nothing was duplicated to build it. `draft_reply` calls the same
`deriveRecipients`, `replySubject` and `quoteOriginal` the reply button calls,
with the same `fullTimestamp` formatter, and a test asserts the tool's output
equals the composer's computation rather than merely resembling it. Addresses
are parsed by the composer's own parser, so a chip the UI would reject is a
chip the gateway rejects. `body_text` renders through `paragraphsToHtml`, now
exported from `lib/compose.ts` and shared with the quote builder. `body_markdown`
is a documented subset — paragraphs, breaks, lists, quotes, bold, italic, code
and links — escaped first and pattern-matched after, with hrefs restricted to
http, https and mailto; a full CommonMark engine is a dependency and a much
larger surface for one field.

Two things the seam does not offer, recorded rather than worked around.
`MailService` has no label-mutation method, so `modify_labels` handles the two
labels `performAction` can actually move — `STARRED` and `UNREAD` — refuses
`INBOX` and `TRASH` by pointing at `archive_thread`, and says plainly that user
labels are still added by hand. And an agent can read an attachment but cannot
attach one to a message it asks to send.

Gates: typecheck clean · 382 tests green (334 + 46 tool suites + 2 live smoke:
schema validation and closed schemas, grant denial for all four capabilities,
both size caps, recipient-scope denial naming the culprit, one-row-per-call, and
hydration) · build clean · no Rust touched · live smoke green over a real unix
socket and the real `bin/wren-mcp.mjs` shim, driving
search_mail → read_thread → draft_reply → request_send, asserting the approval
in the queue, approving it programmatically, and finding the message in the demo
Sent list. Its trail, in order: connected · initialize · search_mail ·
read_thread · draft_reply · request_send (pending) · list_pending · send.
`/simplify` ran before the seal and found five things, all applied: `fromLine`
now calls the list view's own `correspondents`; `textToHtml` is the composer's
`paragraphsToHtml`; the two triage clause tables became one; `draftFromArgs`
resolves the account once instead of twice; and `getThread` hydrates only for
the two tools that read a body — which caught a real defect, since `draft_reply`
would have quoted an empty original on the Gmail path.

The live smoke stands in one thing only: `src-tauri/src/gateway.rs`, which
cannot run inside a Node test. `SocketRelay` in `tests/smoke-live.test.ts` is
the same wire contract in sixty lines. It is what lets the test assert the two
steps no tool can reach — a person approving a queued send, and the mail
actually going out. The running dev app was pointed at a real mailbox, so the
arc was not re-run through the Tauri window; the frames, the socket and the
shim are real either way.

Follow-on: user labels and outgoing attachments both need a `MailService`
change, which M3 was scoped out of. `list_pending` writes an audit row per
call like every other tool, so an agent that polls it will fill the timeline —
worth a look if M4's triage loop polls.
## Later is deliberately NOT a tool (P21, 2026-09-01)

`MailService.defer` exists and no MCP tool wraps it. This is a decision, not a
gap, and it is written here because the alternative is a future agent finding
a service method with no tool and "fixing" it.

**An agent hiding mail from you is precisely the trust failure
`docs/PERMISSION-MODEL.md` exists to prevent.** Archive is recoverable and
visible — the thread is in All Mail, the toast said so, and ⌘Z was offered for
ten seconds. A deferral is neither: the person never saw the thread, so there
is no moment at which they could have objected, and no undo affordance can be
attached to something that was never on screen. It fails silently by
construction, which is the one failure mode this surface must not have.

The read side is fine and stays open: an agent can already see a deferred
thread through `read_thread`, because `thread_defer` changes what the INBOX
VIEW lists and not what the mailbox contains.

Revisit only with a real answer to "how does the person find out", and not
before.
