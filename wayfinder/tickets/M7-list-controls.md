# M7 — List order, filtering, and sorting controls  `wayfinder:task`

status: closed · claimed: M7 lane, 2026-08-29 · blocked by: —

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

## Resolution

The screenshot's real cause was confirmed as hypothesis 1: threads are
chronological (the convention worth keeping) and the reading pane opened at
the top, so a long thread led with its oldest collapsed cards. The pane now
**lands on the newest message** — a `useLayoutEffect` scrolls the last
`[data-message-card]` to 12 px below the header, pre-paint, instantly.
Collapsed cards above are fixed-height, so the offset is stable while the
newest body's iframe is still measuring; a short thread has no scroll range
and the assignment clamps to zero. Verified live both ways (no-op when it
fits; lands at 21 px into view under a short viewport).

**The lens** (the ticket's part 2): per-view sort (newest/oldest) and filter
(everything / unread / starred / has-attachment), state in the ui-store
(`ListPrefs`, sparse per `viewKey`, session-scoped — a filter is a way of
looking, not a setting), the pure transform in
`features/list/list-prefs.ts`, applied in the list layer so j/k, selection
and the virtualizer all see one list. Surfaces: a sliders popover on the
list header (brand-toned while any lens is active), a lens bar naming the
subset with a count and Reset, palette verbs naming end states, and a
filter-empty state that never borrows "Inbox zero" — the celebration tier
reads the *unfiltered* count.

Known limit, documented in `list-prefs.ts` rather than smuggled past: the
lens sees the service's newest page (`DEFAULT_PAGE_SIZE` = 100) of the
90-day window, so "oldest first" on a larger view is the oldest of the
newest hundred. The deeper fix is an `order` option on `ListThreadsOptions`
(a one-word SQL flip) at the cost of a refetch per toggle — deferred until
someone hits the cap for real.

`search_mail` (part 3): unchanged and still true — empty query returns the
newest inbox threads; the tool and the UI tell the same story.

/simplify ran before the seal (two agents). Applied: `SegmentedGroup`
promoted to the kit the day the theme picker's shape got its second user
(both call sites swapped; drift between them was already underway);
`useListPrefs` + `isDefaultPrefs` moved beside the state they read;
`setListPrefs` bails on no-op patches so a re-picked verb re-renders
nothing; both resets pass `DEFAULT_LIST_PREFS` instead of restating it;
the default lens returns the service's array untouched (pinned by an
identity test); lens-bar count hoisted; dead ternary dropped; palette
verbs moved out of the import block, plus the missing "Sort newest first"
for parity. Skipped: pushing sort into SQL (documented above).

Gates: typecheck clean · 397 tests green (+9: the lens suite) · live
browser verification of popover, filters, oldest sort, Reset, landing ·
captures re-run — 12 diffs, all the expected sliders button in the list
header; theme picker verified pixel-faithful in-browser (no capture shows
Appearance) · new capture m7-14-list-lens-light.png sent to Nick.
