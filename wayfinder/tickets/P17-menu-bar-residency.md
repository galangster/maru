# P17 — Stay resident, and earn a menu-bar icon  `wayfinder:task`

status: queued (2026-08-31) · claimed: — · blocked by: owner sign-off on the menu contents (NICK-QUEUE)

## The ask

Nick, 2026-08-31: "if i close the Maru window by minimizing it, it
should still run in the background. Also, we should have the option of
having a taskbar icon available that's helpful for people using mail.
you can think through what would be the best to have up there for quick
tasks but it should all be value-add. i want to reduce friction and
give people quick access or quick abilities. i want to avoid over
redundancy or features for the sake of features."
(Screenshot was the macOS menu bar, so "taskbar" = menu-bar extra on
macOS, system tray on Windows.)

## Where the code is today

- `src-tauri/tauri.conf.json` declares one window and **no tray**.
- There is **no `on_window_event` / `CloseRequested` handler anywhere**
  in `src-tauri/src/`, so closing the window ends the process. Minimize
  already keeps it alive; closing does not.
- `Cargo.toml` has `tauri = { version = "2", features = [] }` — the
  `tray-icon` feature is off and must be enabled (plus `image-png`).
- No `tauri-plugin-autostart`, so launch-at-login needs it.
- `tauri-plugin-notification` is already a dependency — it is the other
  half of P15's badges.

## Part 1 — residency

- Intercept `CloseRequested`: hide the window instead of exiting, and
  re-show on menu-bar/dock activation. Minimize keeps working as it
  does.
- **Quit must stay reachable** — a menu-bar "Quit Maru" item, and ⌘Q
  keeps quitting for real. An app you cannot quit is a bug, not a
  feature.
- A preference, defaulting **on**: "Keep Maru running when the window
  closes." Off restores today's behavior.
- Pair with an optional **launch at login**.
- Be honest about the cost: resident means still syncing. The sync
  interval governs, and quiet hours (P15) should pause it. Say so in
  the settings copy rather than hiding it.
- Windows: minimize/close to system tray, same preference.

## Part 2 — what the menu earns

The test for every item: *does it do something the window doesn't, or
do it without making you leave what you are doing?* If the answer is
"the app already does this, smaller", it does not ship.

Recommended, in order of value:

1. **The icon itself is the state.** Unread/inbox count per the P15
   badge mode, so the same number the dock shows. Zero clicks, and it
   is the whole reason to look up there.
2. **Quick compose** — a small standalone composer from the menu (and a
   global hotkey), without raising the main window. "Send a two-line
   email" is the most common interruption in a working day, and today
   it costs a full context switch. This is the single highest-value
   item.
3. **Approvals waiting** — Maru's own, and the one no other mail app
   has: an agent has queued a send and needs a human. Approve or reject
   inline from the menu. Actioning it without opening the app is
   exactly the friction Nick means, and it is the product's
   differentiator sitting in the OS chrome.
4. **Pause mail for an hour / until tomorrow** — one toggle. Cheap,
   real, and it is the manual twin of P15's quiet hours.
5. **A short peek list — the newest 3-5 unread**, each row opening that
   thread in the app, with archive inline. Include it only in that
   shape: short, open-or-archive, nothing else. It is the item closest
   to the redundancy line, and it earns its place only as triage, not
   as reading.

Explicitly rejected as redundant — record these so they do not get
re-proposed:

- **Search** — the command palette already owns this and does it
  better.
- **Folder navigation** — that is the sidebar.
- **Settings** — that is settings; the menu gets a link at most.
- **A full thread list, or reading bodies in the menu** — that is the
  app, reimplemented worse, in a surface with no room for it.

## Sequencing

After the verification submission. Part 1 is small and self-contained;
Part 2 shares its state with P15 (one badge-count definition, one quiet
-hours switch) and should land after or with it so the two do not grow
two different answers to "how many are waiting".
