# P7 — Debug-log export  `wayfinder:task`

status: closed · claimed: autonomous run, 2026-08-29 · blocked by: —

## Question → work

The no-telemetry answer to "it broke": Settings → About gains "Export
debug log" — recent app logs, sync statuses, versions, platform — scrubbed
of addresses and tokens by construction, written to a file the user
attaches to a GitHub issue by hand. Nothing ever phones home (ratified).

## Resolution

"Copy debug report" in Settings → About: versions, mode, platform, account
*count*, per-account sync states (positional, never an id), the
report-safe settings (one shared whitelist with P5's transfer module, so
the two cannot drift about what is safe to name), and a 50-line ring of
recent trouble captured by window error/unhandledrejection hooks installed
before first render. The whole text passes an address scrub on the way
out. Clipboard-first with the legacy fallback, and an honest error toast
(report printed to console) when both are refused — verified live in the
browser pane, where the fallback path even recorded its own clipboard
rejection into the report it then printed. Tests pin the scrub, the cap,
and the empty case. No file save: the app has no save path yet
(attachments say "coming soon" too) — clipboard is the honest v1.
