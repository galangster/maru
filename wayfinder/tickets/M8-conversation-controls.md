# M8 — Conversation-view controls  `wayfinder:task`

status: open · claimed: — · blocked by: M7

## Question → work

Nick, 2026-08-29, after M7 landed the reading pane on the newest message:
"inside conversations i should be able to change sorting! unsure what else
a normal user should be able to do, but would be good to have whatever is
normal for threads as well."

The controls a conversation view normally carries, surveyed against Gmail,
Apple Mail, Outlook, and Superhuman, then built to Wren's bar:

1. **Message order** — chronological (today's default, oldest → newest,
   landing on the newest) versus newest-on-top. A per-user preference,
   not per-thread; Apple Mail and Outlook both treat it as one setting.
   Landing behavior follows the order: newest-on-top lands at the top and
   needs no scroll at all.
2. **Expand / collapse all** — one control (and a keyboard binding) to
   open every message or fold the thread back to its spine. Normal in
   every client; also what makes newest-on-top usable on long threads.
3. Whatever else the survey rates as table stakes at reasonable cost —
   candidates: jump to first unread, per-message collapse states
   remembered while the thread stays open (already partly true via
   `defaultExpanded`).

Placement follows M7's grammar: a control on the reading-pane toolbar,
palette verbs, and the preference beside the other appearance choices if
it is truly global. DIRECTION.md governs the chrome; the M7 lens bar
pattern is the precedent for naming any non-default state.
