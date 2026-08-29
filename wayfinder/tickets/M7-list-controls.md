# M7 — List order, filtering, and sorting controls  `wayfinder:task`

status: open · claimed: — · blocked by: —

## Question → work

Nick, 2026-08-29 (mid-M6, with a screenshot showing mail ordered oldest →
newest): "sort by default with the most recent messages on top… but should
also have some filtering, sorting options. for users."

Audit of the current state first, because the mainline is already right:
every thread list orders `last_message_at DESC` (db.ts:502/545/704, demo
service), and the inbox captures confirm newest-first. The likely surface
in the screenshot is **messages within one thread** — `read/getThread`
orders `date ASC` (db.ts:693), the Gmail convention, so a long thread
opens on its oldest message and the newest sits below the fold.

Work, in order of certainty:

1. Identify the surface Nick screenshotted (confirm with him if the trace
   is ambiguous). If it is the reading pane: the likely right fix is
   Gmail's own answer — keep chronological order but land the scroll on
   the newest (or first-unread) message, with older messages collapsed —
   rather than reversing the conversation.
2. Filtering and sorting controls for the list: unread / starred /
   has-attachment filters, sort by date vs sender vs subject, per-view.
   Decide the surface (list header control vs palette verbs vs both — the
   keyboard-first answer matters as much as the menu), persist the choice
   per view in the ui-store, and keep the default newest-first.
3. `search_mail` (agent surface) inherits whatever ordering contract falls
   out — its docs say newest-first for an empty query; keep the tool and
   the UI telling the same story.

Contracts: `MailService.listThreads` (src/core/types.ts) grows options
only additively; DIRECTION.md governs any new list-header chrome.
