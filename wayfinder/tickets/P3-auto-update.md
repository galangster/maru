# P3 — Auto-update  `wayfinder:task`

status: open · claimed: — · blocked by: P2

## Question → work

Tauri updater plugin against a static, signature-verified manifest on
GitHub Releases (ratified: no Wren server, no telemetry). Auto-check on
launch, always-ask before install, a "Check for updates" surface in
Settings → About. The key ceremony — where the updater private key lives,
who can cut a release — is the fog this ticket burns off; write it down
in docs/DECISIONS.md when settled.
