# M3 — The v1 tool surface  `wayfinder:task`

status: open · claimed: — · blocked by: M2

## Question → work

The ~8 send-gated tools over MailService: list_accounts, search_mail,
read_thread, get_attachment, draft_new, draft_reply, request_send (→
approval queue), archive/label (grant-gated), list_pending. Typed schemas,
result-size discipline (agents get compact thread summaries, not raw
dumps), tests against the demo service.
