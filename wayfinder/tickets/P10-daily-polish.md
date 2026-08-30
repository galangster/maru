# P10 — Daily polish: the triage hand feel  `wayfinder:task`

status: closed · claimed: P10 lane, 2026-08-29 · blocked by: —

## Question → work

The P1 block of UX-FRICTION-2026-08-29 plus two rulings Nick added on
claim (with a screenshot of the listbox focus ring):

1. **No giant focus ring on the list.** The whole-listbox ring reads as
   "weird box around everything". Focus indication moves to the active
   row itself; the container stops drawing one. Keyboard users keep a
   visible focus — on the thing that is actually active.
2. **Archive/delete advances to the next thread.** One keystroke per
   message, repeatable: acting on the selected thread selects the next
   one (previous when acting on the last), so triage is e-e-e, not
   e-j-e-j. Applies to every trigger: keys, row hover cluster, reading
   toolbar.
3. **Save attachments** — the "coming soon" toast dies; a real save path
   in Tauri, a download in the browser demo.
4. **Drafts survive** — the docked composer persists its draft across
   close and crash, restoring on reopen; send/discard clears it.
5. **Humans can apply labels** — the M9 seam gets its UI: toggle an
   account's own labels from the reading pane.

## Resolution

All five, live-verified in the demo:

1. **The ring is gone from the container** and lives on the active row
   (`group-focus-visible/listbox`), with the virtualization hole closed:
   focusing the list scrolls the selection into view, so keyboard focus
   is never invisible (WCAG 2.4.7).
2. **e-e-e triage.** `nextAfterRemoval` (pure, tested) advances the
   selection before the row leaves, from all three triggers — keys, row
   hover cluster, reading toolbar — and the keyboard's list finally goes
   through the M7 lens (a latent j/k bug: it walked the unfiltered
   list). One event-time accessor, `visibleThreadsSnapshot`, is the
   single spelling of "the list the person is looking at."
3. **Attachments save.** The chip downloads for real: Tauri opens the
   save dialog *on the Rust side* — the webview sends a filename and
   bytes, never a path, so a compromised page can't aim a write at
   LaunchAgents — and the browser demo downloads via anchor. Verified
   live ("Saved lanternhouse-msa-redlines.pdf").
4. **Drafts survive crashes.** The dirty draft mirrors to localStorage
   (text only — attachment bytes would blow the quota and strand a stale
   mirror), clears on the confirmed close and on send, and the next
   blank Compose restores it. Verified through a hard reload.
5. **Humans apply labels.** "+ Label" in the thread header toggles the
   account's own labels through the same M9 seam agents use; chips
   follow the service's own event.

/simplify (two agents) applied: `base64EncodeBytes` reused from
core/mime (a duplicate encoder died on arrival); `OptionRow` promoted to
the kit at the label menu — its second character-identical site (filter
menu migrated too); the lensed-snapshot accessor replacing two verbatim
copies and a whole-pane query subscription; `blankInit` reduced to the
empty-object test its callers actually make; the useMemo-feeding-a-ref
contortion flattened; the save path hardened as above (the reviewer's
threat-model note, taken as a fix). Noted, accepted: per-keystroke
stringify of a text-only mirror.

Gates: typecheck · 430 tests (+3 advance-helper) · cargo clean · live
verification of all five behaviors · captures: the three reading-pane
shots (the "+ Label" chip), nothing else.
