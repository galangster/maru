# P5 — Settings export/import  `wayfinder:task`

status: closed · claimed: autonomous run, 2026-08-29 · blocked by: —

## Question → work

The free sync stopgap (ratified) and the seed of map 4's sync schema.
Enumerate what "settings" is (theme, sounds, poll, conversation order,
keybindings when they exist, image policy — the list is the work), a
versioned signed-file export, import with a preview-and-confirm surface.
Hard lines from G2, unchanged: OAuth tokens and agent credentials never
leave the keychain; agent grants never travel — a grant is a trust
decision made per machine. Mail never syncs; each device syncs Gmail.

## Resolution

Clipboard-shaped, deliberately: export copies a versioned JSON envelope
(whitelisted fields, canonical-form SHA-256 checksum, a note on its face
saying what it carries and never will); import is paste → parse → a
field-by-field diff preview (client secret masked) → one Apply. The G2
hard lines hold: tokens, agents, grants, mail never travel. The OAuth
*client pair* does — the user's own registration, non-confidential for a
desktop PKCE client (RFC 8252 §8.5, R3a doc), and most of a second
device's friction — declared in the module header, the envelope itself,
the UI explainer, and the toast. Parsing refuses whole-file on any known
field with a wrong shape or a failed checksum, and drops unknown fields
silently so newer exports import into older Wrens. The whitelist is
map 4's sync-schema seed, as charted. Tests: round-trip, tamper, shape
refusal, forward-compat, version naming, masked diff.

/simplify (two agents, combined over P5+P7) applied: sha256Hex promoted
to lib/hash.ts (registry's duplicate deleted), `textButtonClass` promoted
to the kit at its sixth call site (the used-twice rule, overdue), the
debug report reuses the transfer whitelist, agents-settings' credential
copy adopts lib/clipboard, TransferBlock derives its preview rows at
render instead of storing them, and the invented pollIntervalSec floor
dropped to positive-finite. Noted, accepted: per-keystroke parse (paste
is the real usage), About's sync-tick re-render (dialog-only).
