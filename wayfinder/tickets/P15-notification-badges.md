# P15 — Notification badges, with modes that sync  `wayfinder:task`

status: queued (2026-08-31) · claimed: — · blocked by: owner mode/default decision (NICK-QUEUE)

## The ask

Nick, 2026-08-31: "we should have notification badges for mail and
options for how people want to see them and for what they want to see
them for. by default, probably should have notification badges for new
mail, but when read the badge goes away. another option would be a
badge for any mail in the inbox. you can think of more if you want to,
but yeah this should be able to sync with the ios version we make"

## Modes

The two Nick named, plus the ones this app specifically earns:

1. **Unread in Inbox** — *the default he specified*. Counts unread
   threads in the unified inbox; reading clears it.
2. **Everything in Inbox** — counts every inbox thread regardless of
   read state, so only triage clears it. The inbox-zero-as-practice
   model, and the one that makes P13's celebration mean something.
3. **Dot only** — presence, no number. Says "something arrived" without
   the count pressure. Cheap to offer and the one many people actually
   want.
4. **Off**.
5. **Approvals waiting** — Maru's own: agent actions queued for your
   approval. This should be an *overlay on top of any mode*, not a
   fifth choice — a queued send waiting on you is a different urgency
   class from an unread newsletter, and the app already has the badge
   surface for it (`ApprovalsBadge`, sidebar footer). Recommend: when
   approvals are pending, the badge shows those instead, in the accent.

Scoping, orthogonal to the mode:

- **Per-account opt-in** — the app is multi-account and "work mail must
  not badge after hours" is the common real need.
- **Quiet hours** — suppress the badge on a schedule.
- Deliberately NOT recommended: "only from starred senders". It sounds
  good and it silently hides mail; VIP filtering belongs in the list,
  not in a number.

## The one hard constraint: how this syncs to iOS

macOS draws its own badge from local state (Tauri dock badge). iOS does
not — **the badge number on iOS arrives inside the APNs payload**, so
whoever sends the push decides it. That is map 4's Gmail-watch relay.

Two ways to reconcile that, and they are not equivalent:

- **(a) Relay computes the badge.** The user's mode and per-account
  scoping have to be stored server-side so the relay can apply them.
  Simple to build, but it puts user preferences and per-account mail
  counts on the server — which cuts against the verification story that
  the sync service carries Maru state only and never mail.
- **(b) Relay sends facts, device decides.** *Recommended.* The push
  carries raw counts (unread, inbox total, pending approvals); an iOS
  notification service extension applies the local preference and sets
  the badge. The relay stays dumb, the preference stays device-local
  (or rides ordinary settings sync), and no preference data leaves the
  device. Costs one extension and a slightly richer payload.

Option (b) is a **design requirement on map 4's relay payload**, so it
should be settled before that relay is built, not after. See
docs/research/multi-device-strategy.md and the multi-device queue item.

## Implementation notes

- One definition of "unread", shared with the sidebar count — reuse
  `useUnreadCount` (src/features/mail/queries) so the dock and the
  sidebar can never disagree.
- macOS: Tauri dock badge. Windows: taskbar overlay icon. Both behind
  one small platform seam, the way `openExternalUrl` handles this.
- Settings UI joins the existing settings surface; the preference must
  be covered by P5's settings export/import.
- Demo mode must not badge the dock.

## Sequencing

After the current visual pass and the verification submission. The
payload decision (a vs b) is worth ratifying earlier, because map 4's
relay design depends on it.
