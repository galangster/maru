# M8 — Conversation-view controls  `wayfinder:task`

status: closed · claimed: M8 lane, 2026-08-29 · blocked by: M7

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

## Resolution

Both halves of the survey shipped; the third candidate resolved itself.

**Message order** is `Settings.conversationOrder` — `chronological`
(default, landing on the newest, M7's behavior) or `newestFirst` — a
persisted reading preference, deliberately not per-thread, exactly as
Apple Mail and Outlook treat it. The types.ts comment records the
persist-vs-lens split: a filter is a way of looking (session, ui-store);
how a conversation reads is a preference (settings). Surfaces: a toolbar
toggle on the reading pane (chevron, active while newest-first), palette
verbs naming end states, and an order-aware landing (newest-first lands at
the top and needs no hunt). `useSaveSettings` was promoted from the
settings dialog to the mail hub the day it got its second consumer — the
promotion rule again.

**Expansion** was lifted out of MessageCard into the ui-store as
`ReadingExpansion` ('default' — the newest open, the derived rule — |
'all' | 'none' | a manual Set), reset whenever the selection moves, which
is what lets the keymap (`o` toggles expand/collapse all), the palette,
and the toolbar all reach it. MessageCard became controlled; its expanded
header is now a real button that collapses — the same click both
directions. Pure helpers in `features/reading/conversation.ts`
(displayMessages, expandedIds, toggleExpanded, normalizeExpansion), each
pinned by tests.

Jump-to-first-unread (candidate 3) is subsumed: opening a thread marks it
read before the pane could use the flag, and landing-on-newest already
serves the intent.

/simplify (two agents) applied: a dead `keys` import from the
useSaveSettings move; the real find — the keymap and the toolbar held two
definitions of "everything is open" (raw state vs derived), unified by
`normalizeExpansion` folding a hand-built all-open Set into the named
'all' state so both toggles read one spelling, pinned by test; the
expanded header's aria-label dropped so its content (name, address, time)
names it for screen readers; an unused type export trimmed. Skipped as
defensive-but-harmless: the redundant expansion reset in `setView`.
Noted from review, accepted: an order flip reloads expanded body iframes
(keyed reorder) — rare, user-initiated; and MessageBody's srcDoc memo
means sibling toggles never touch an iframe.

Gates: typecheck clean · 407 tests green (+10) · live browser
verification (default/all/none/header-collapse/order-flip/reset-on-
selection) · captures: only t3-02 and t4-05 changed (the two showing the
reading toolbar) + new m8-15, sent to Nick.
