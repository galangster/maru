# M9 — MailService seam growth: user labels + outgoing attachments  `wayfinder:task`

status: open · claimed: — · blocked by: —

## Question → work

The two gaps M3 recorded rather than worked around, both of which need the
`MailService` contract (src/core/types.ts) to grow additively:

1. **User-label mutation.** `performAction` moves only the system labels
   (INBOX/TRASH/STARRED/UNREAD), so `modify_labels` refuses user labels
   and the human applies `Receipts` by hand. Work: an additive
   `modifyLabels(threadKey, add, remove)` (or a widened action type) on
   the contract, implemented in both services (Gmail: users.threads.modify
   with label-id resolution + creation; demo: in-memory), then
   `modify_labels` widened to accept user labels by name, with the audit
   summary naming them. The UI's label chips gain add/remove affordances
   only if trivially reachable — the agent path is the ticket.
2. **Outgoing attachments.** `ComposeDraft.attachments` exists and the
   MIME builder already sends them from the composer; the agent path
   refuses because `request_send` never accepts them. Work: an
   `attachments` arg on `request_send` (base64 in, size-capped well below
   the 1 MiB frame — refuse with the real number), threaded through the
   approval queue payload untouched, and the approval card showing the
   attachment list so the human approves what actually goes out.

Both stay inside the grant model: labels under `archiveLabel`,
attachments under `send` — no new capability. Every widened surface gets
schema, refusal copy, tests against the demo service, and a line in
CONNECT-AN-AGENT's caveats section removing the two "cannot yet" bullets.
The permission spec is unaffected (no rule changes). Gmail-path work must
be verifiable against fixtures (tests/fixtures/gmail.ts) since no live
mailbox runs in an autonomous session.
