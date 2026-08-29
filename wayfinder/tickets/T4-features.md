# T4 — Features  `wayfinder:task` (AFK)

status: closed · claimed: fable-orchestrator · blocked by: T3

## Resolution

Closed 2026-08-28, commit f0a4b0a. Composer (glass sheet, chips, Tiptap,
reply/reply-all/forward prefill, attachments), command palette with live
search, list-header search, settings (accounts/appearance/Google API/sync),
onboarding, notifications, full shortcut set + "?" overlay. 216 tests green;
8 captures. Fixed in-lane: glass position bug that beat Tailwind fixed
positioning; scrim double-blur; WKWebView window.prompt null.

## Work

Composer (Tiptap, To/Cc/Bcc chips, From picker, attachments, docked sheet),
command palette, Gmail-style shortcuts, settings (accounts, appearance,
client-ID entry), onboarding (connect Google / demo), notifications, unread
counts, mail actions wired end to end. Gate: typecheck + scripted
screenshots of composer, palette, onboarding, settings.
