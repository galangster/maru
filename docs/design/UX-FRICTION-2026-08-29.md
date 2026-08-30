# UX friction audit  `2026-08-29`

Nick's directive at P3's close: "get rid of that multiple-question
password prompt… what other things do we have now that aren't a good user
experience? We should figure that out now." This is that figuring — every
known gap between Wren today and the map's "nothing feels unfinished"
bar, ranked by how hard it bites and who it bites.

## Fixed in the same breath

- **The keychain password storms.** Root cause: keychain item ACLs trust
  the app that *created* them, and every differently-signed dev build was
  a stranger to the last one's items — so prompts never stuck.
  Three-part fix, shipped: the app is now stably signed (approvals
  finally persist); `secret_set` recreates items instead of updating
  in place, so every token refresh re-anchors the ACL to the current
  identity and a user's keychain **self-heals within a session**; and dev
  builds moved to their own keychain service (`dev.wren.app.dev`), so
  development can never again churn real tokens' ACLs. Expect at most
  one final Allow per account, then silence.

## P0 — blocks the stranger (all already on map 3)

1. **The OAuth console safari** — creating a Google Cloud project is the
   single biggest abandonment point imaginable. R3a's recommendation
   (shared verified client, CASA local-client exemption) is decision-
   ready; P4 builds whichever way Nick calls it.
2. **The 7-day re-auth** — a mail client that signs you out weekly is a
   prototype by definition. Dies with the production flip (P4).
3. **Unsigned Windows builds** — SmartScreen scare on half the audience.
   Honest note now; cert when Windows earns its turn.

## P1 — bites daily users, not yet ticketed

4. **Attachments can't be saved.** The chip literally toasts "coming
   soon" — receiving a PDF and being unable to open it is the sharpest
   daily edge in the app. Needs a save path (and P7's file-save gap
   noted the same missing primitive). Biggest single P1.
5. **Drafts don't survive.** Close the composer — or the app — and the
   text is gone. A crash mid-reply loses real work. Needs a draft store
   (also unlocks agent-visible drafts someday; the queue's "draft an
   agent does not pass on never existed" stays true for agents).
6. **Humans can't apply labels.** Agents now can (M9); the person
   reading the thread still has no label affordance — chips render but
   nothing adds or removes them. The seam exists; the UI doesn't.
7. **No bulk actions.** No multi-select, no "archive all", no mark-all-
   read on a folder. Triage of a 200-thread backlog is 200 keystrokes.
8. **Search is bare.** Two-character minimum, no `from:`/`to:`/`has:`
   operators, and the lens caps at the newest-100 page (documented in
   M7). Fine for month one, wrong for the archive.

## P2 — polish and power

9. **mailto: / default-mail-app registration** — Wren can't be the
   system's mail app yet; clicking an email link opens the wrong thing.
10. **Undo-send window is fixed at 4 s** — should be a setting (0/4/10/30).
11. **No signature block.**
12. **Snooze / send-later** — table stakes in every peer; genuinely new
    engine surface, likely map 4.
13. **Notification taps** — new-mail notifications should land on the
    thread, not just the app.
14. **Trash never empties** — no manual "empty trash", relying on
    Gmail's 30 days; fine, but say so in the UI.
15. **Fullscreen traffic lights** — verify the re-parented buttons
    behave in native fullscreen (carried check from the lights saga).

## Where this lands

Items 1–3 are P4's existing spine. Items 4–6 are one new ticket's worth
of daily-driver dignity — proposed as **P10 "daily polish": save
attachments, persistent drafts, human labels** — with 7–8 as P11 if the
map has room, and P2 items feeding the map-4 grill. Nick prioritizes;
nothing here starts without the map saying so.
