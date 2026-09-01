# Production access and two-factor inventory

Every production account must use two-factor authentication. A password alone
does not meet this requirement. Prefer a hardware security key or passkey.
Keep recovery codes offline and separate from the primary operator's device.

| Account | Production capability | Required second factor | Primary access | Second-operator access | Last verified |
| --- | --- | --- | --- | --- | --- |
| GitHub | Source, Actions secrets, releases, Pages | Security key or passkey | Owner must confirm | Required and tested | Pending |
| Apple Developer | Signing, notarization, App Store, push | Security key or trusted device | Owner must confirm | Required where Apple permits | Pending |
| Google Cloud | OAuth client, Pub/Sub, production project | Security key or passkey | Owner must confirm | Required owner role | Pending |
| Railway | Sync service, Postgres, backups, variables | Security key or authenticator | Owner must confirm | Required and tested | Pending |
| Stripe | Prices, billing, refunds, payouts, webhooks | Security key or authenticator | Owner must confirm | Required administrator role | Pending |
| npm | Package publication | Platform-required two-factor authentication | Owner must confirm | Required publisher role | Pending |
| Registrar | DNS, domain transfer, mail routing | Security key or authenticator | Owner must confirm | Required and tested | Pending |

## Second operator

The second operator must use a separate account and a separate second factor.
Do not share passwords, passkeys, recovery codes, or email accounts.

Before public launch, the second operator must prove access to GitHub,
Railway, and the registrar without help from the primary operator. The second
operator must also hold an emergency owner or administrator role for Apple
Developer, Google Cloud, Stripe, and npm when each platform permits it.

Test access with read-only actions first. Record the date and operator in the
table. Do not expose account identifiers or recovery material in this file.

## Quarterly review

Review this inventory every quarter and after any operator or recovery-method
change. The next scheduled review is December 1, 2026.

For each review:

1. Confirm both operators can sign in with their own second factors.
2. Remove former people, unused tokens, old deploy keys, and stale sessions.
3. Confirm recovery codes are current and stored offline.
4. Review GitHub secrets, Railway variables, Stripe webhooks, and DNS changes.
5. Record the date in the table and open a ticket for each failed check.
