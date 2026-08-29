# M9 — MailService seam growth: user labels + outgoing attachments  `wayfinder:task`

status: closed · claimed: M9 lane, 2026-08-29 · blocked by: —

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

## Resolution

Both gaps closed, additively, inside the existing grant model.

**User labels.** `MailService.modifyLabels(threadKey, { addLabelIds,
removeLabelIds })` joins the contract beside `performAction`, which keeps
the four system flags. The arithmetic is one shared `applyLabelChanges` in
`service/actions.ts` so the optimistic local write and the Gmail modify
agree exactly; the real service updates the thread row optimistically and
rolls back verbatim on failure (per-message rows reconcile on the next
history poll — every user-label reader is thread-level, verified), and the
demo service applies to thread and messages both. `modify_labels` now
takes an account's own labels by name — exact case first, case-folded
fallback, resolved against `listLabels` — refuses unknown names by
listing what exists (Wren does not create labels from an agent), routes
INBOX/TRASH to archive_thread as before, and writes one audit line
however the call mixes flags and labels (`Added Hiring to “X” and marked
it as read.`). Discovery: `list_accounts` now returns each account's
user-label names, so the names the tool accepts are one call away.

**Outgoing attachments.** `request_send` takes base64 attachments —
500 KB per file, 600 KB per message, decoded bytes, with refusals naming
the real numbers and the 1 MiB frame they protect (headroom verified:
600 KB decoded leaves ~229 KB of frame). The queue payload carries them
untouched, `sentRowsFor` already stored them, and the approval card now
shows the file list — name, type-matched icon, size — beside the
recipients, outside the disclosure: what would leave the machine is on
the card. The demo fixture's first pending send gained a small PNG so the
state is capturable (m1-11 updated).

/simplify (two agents) applied: `base64DecodedBytes` extracted to
core/mime.ts, replacing three disagreeing formulas (cap, card, stored
sizeBytes); `triageSummary` reimplemented as a delegation to the widened
`labelSummary` so the two audit voices cannot drift; dead
`MODIFIABLE_LABELS` deleted; attachments parsed before draft assembly and
spread rather than mutated; the card uses `attachmentIcon(mimeType)` and
index-safe keys; exact-case label matching ahead of the fold. Confirmed
by review, no change: caps at the tool layer (the frame is agent-path
only), thread-level optimism, per-account listLabels being a local read.

Both CONNECT-AN-AGENT caveat bullets replaced with the new truths. The
permission spec needed no change — no rule moved.

Gates: typecheck clean · 413 tests green (+6: user-label resolution and
audit voice, attachment carry-through to the sent message, both size
refusals, real-service modifyLabels optimistic + rollback, list_accounts
label discovery) · captures: only m1-11 changed, twice, as expected.
