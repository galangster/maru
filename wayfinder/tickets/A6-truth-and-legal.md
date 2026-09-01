# A6 — Truth and legal  `wayfinder:task`

status: **complete in lane D; legal review remains an owner gate** · map 4

1. The four sentences G2 lists (README ×2, site, dossier) rewritten for a
   world with an optional, paid, ciphertext-only account. Ship in the same
   release as the vault, not before.
2. `site/privacy.html` and `site/terms.html`: plain-English drafts. Privacy
   states exactly what the service stores (ciphertext, email, device names,
   Stripe customer id) and what it cannot read. Terms carry the trial, the
   refund line, and the "lost recovery key = lost vault" sentence.
3. Support macros in `docs/SUPPORT.md`: lost recovery key, revoke a device,
   delete account, refund.

## Public truth audit, 2026-09-01

Changed public sentences:

- `site/support/google-data/index.html`: “Everything Maru Mail stores lives on
  your own device” now says that mail stays on the device and optional account
  data is deleted through the app.
- `site/status/index.html`: “Maru Mail runs entirely on your device” now says
  that mail stays on the device and names Google and the optional account
  service as shared incident boundaries.
- `site/privacy/index.html`: “optional sync stores only an encrypted vault” now
  names the complete service data set: unreadable vault ciphertext, email,
  device names, and a Stripe customer id.
- `site/privacy/index.html`: “The optional sync service receives encrypted
  settings, account addresses, and refresh tokens” now distinguishes the
  encrypted vault contents from the account data that the service stores.
- `site/privacy/index.html`: “The sync service stores only the encrypted
  account vault needed to provide sync” now uses the complete service data set.
- `SECURITY.md`: “Email the maintainer (address on the GitHub profile)” now
  names `security@getmaru.app` and states that the address delivers.

The remaining server, network-peer, and token statements in `site/`,
`SECURITY.md`, and `docs/security/` match the account design. The README still
says that Google is Maru's only remote host. This lane cannot edit `README.md`.
The owning lane must replace that sentence when it integrates its earlier
account wording.

Legal drafts:

- `site/privacy/index.html` includes service data, retention, sub-processors,
  export, deletion, operator identity, and the legal-review marker.
- `site/terms/index.html` includes account pricing, trial, Stripe billing,
  refunds, key-loss consequences, acceptable use, termination, operator
  identity, and the legal-review marker.
- `docs/SUPPORT.md` contains all six required support replies.
