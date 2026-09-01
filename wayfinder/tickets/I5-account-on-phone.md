# I5 — The Maru account on the phone  `wayfinder:task`

status: **complete** · map 5

Sign in / sign up / recovery on the phone reusing `src/core/account/`;
restore settings and the address list; the ios family's credentials file
silently. Entitlement shown; "Manage on getmaru.app" instead of any purchase.

## Delivered

- Settings opens a native-shaped Maru account flow for sign-in, sign-up, and recovery.
- Sign-up requires 12 characters and finishes through the gated twelve-word recovery ceremony.
- Signed-in settings show entitlement, sync state, devices, history restore, password, sign-out, and deletion controls.
- Subscription management opens `https://getmaru.app/account`. The iPhone has no purchase control.
- The account store reports the iOS platform and family without changing desktop identity.
- Restored Gmail addresses explain that Gmail sign-in arrives with I3.

## Proof

- Repository gate: `npm run typecheck && npm test && npm run build`
- Simulator: iPhone 16, debug demo build, driven with FlowDeck
- Flow: sign-up, recovery copy, activation, rename, sign-out, and sign-in
- Captures: `wayfinder/captures/ios/account-{signed-out,ceremony,signed-in}-{light,dark}.png`
