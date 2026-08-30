# Shared Google OAuth incident runbook

## Purpose

This runbook covers a failure or suspension of Wren's shared production OAuth client. A shared-client incident can affect every account authorized through that client. Accounts that use a custom client remain isolated under their own Google projects. Sources: `docs/research/shared-client-implementation-plan.md` Part 1 §6 and `src/core/auth/client-config.ts:22-58`.

Wren has no telemetry server. Detection depends on Google Cloud signals, project-contact mailboxes, support reports, and errors visible on each device. Sources: `SECURITY.md:10-14` and `docs/research/shared-client-implementation-plan.md` Part 1 §6.

## What users see

The OAuth token path classifies `invalid_client`, `deleted_client`, and `unauthorized_client` as `OAuthClientError`. The sync engine marks those errors as client failures. Settings then shows this account-row text:

> Google rejected the OAuth client — the account is fine. Set up your own client to reconnect.

The row also shows **Use your own client**. Sources: `src/core/auth/oauth.ts:38-58`, `src/core/auth/oauth.ts:167-187`, `src/core/sync/engine.ts:111-120`, and `src/features/settings/settings-dialog.tsx:465-486`.

A single user's `invalid_grant` is different. Wren marks it as a reauthorization problem and shows **Sign in again**. Do not declare a project incident from one `invalid_grant`. Sources: `src/core/auth/oauth.ts:181-187` and `src/features/settings/settings-dialog.tsx:467-495`.

> NOTE: A project suspension can also appear as an OAuth or Gmail 403. Current code does not classify a generic 403 as `OAuthClientError`. It can appear as a raw sync error without the **Use your own client** action. This is a gap against the error-classification work in `docs/research/shared-client-implementation-plan.md` Part 2 §2.

## Detection checklist

Treat the event as a possible shared-client incident when any of these signals appear across accounts:

- Google sends a policy, abuse, deletion, or suspension notice to a project contact.
- Cloud Console shows a disabled project, disabled OAuth client, or policy appeal.
- Gmail API metrics show a project-wide increase in OAuth 403 or Gmail 403 responses.
- Multiple users report `invalid_client`, `deleted_client`, or `unauthorized_client` in the same period.
- The same frozen release fails for multiple accounts while custom-client accounts still work.

Source: `docs/research/shared-client-implementation-plan.md` Part 1 §6.

Do not ask users to repeat authorization until the project state is known. Repeated authorization cannot repair a disabled project or deleted client. Source: `docs/research/shared-client-implementation-plan.md` Part 1 §6.

## Roles

Use the addresses in `ops/google-oauth/CONTACTS.md`.

| Role | Duty during the incident |
| --- | --- |
| Primary project owner | Confirm project and client state. Read Google notices. Own the appeal. |
| `«NICK: second durable owner»` | Enter the second Google Cloud project owner. This person can act if the primary owner is unavailable. |
| Project editor | Capture metrics, client state, scope state, and timestamps without changing configuration. |
| Developer contact | Reproduce the error. Classify the affected release. Prepare a code or release correction when needed. |
| `support@wren.so` | Collect user reports. Send the approved status and BYO fallback message. Source: `site/privacy.html:70-71`. |

## Blast-radius decision

```text
One account fails
  |
  +-- invalid_grant or needsReauth only
  |     +-- Use Sign in again
  |     +-- Do not declare a shared-client incident
  |
  +-- clientFailure code
  |     +-- Check another official-client account
  |     +-- Check Cloud Console and owner mail
  |
  +-- generic OAuth or Gmail 403
        +-- Check project metrics and another official-client account
        +-- Compare a custom-client account

Multiple official-client accounts fail
  |
  +-- Custom-client accounts work
  |     +-- Treat as shared client or project scope
  |
  +-- Custom-client accounts also fail
        +-- Check Gmail service state and app-wide regressions
```

## Recovery procedure

1. Freeze OAuth credential, scope, consent-screen, and release changes.
2. Confirm whether the incident affects one user, one client, or the whole project.
3. Capture Cloud Console state, error codes, first-seen time, affected versions, and quota graphs.
4. Read all owner and developer contact mail. Check the Cloud Appeals page.
5. Identify the cited abuse, policy, client-deletion, or credential problem.
6. Correct only the cited problem.
7. Submit one appeal with the architecture, correction evidence, project id, and client id.
8. Publish a static status notice that contains no Gmail data.
9. Tell affected users not to repeat authorization until the project state is known.
10. Keep **Use your own client** available as the immediate fallback.
11. Restore the deleted client when Google permits restoration.
12. If restoration fails, ship an approved replacement client and require users to authorize it.
13. Record the cause, affected versions, user impact, recovery time, and prevention changes.

Source: `docs/research/shared-client-implementation-plan.md` Part 1 §6.

A replacement client cannot refresh tokens issued to the old client. Affected users must authorize the replacement. Source: `docs/research/shared-client-implementation-plan.md` Part 1 §6.

## BYO fallback message

Use this message only after the incident owner confirms a shared-client problem:

> Google is rejecting Wren Mail's shared OAuth client. Your Gmail account and mailbox are unchanged. Do not repeat sign-in with the shared client. In Wren, open Settings and choose Use your own client for the affected account. Follow Wren's Google OAuth setup guide. Existing custom-client accounts are separate from this incident.

The in-app recovery action and account-safety statement come from `src/features/settings/settings-dialog.tsx:465-486`. The custom-client setup path is documented in `docs/SETUP-GOOGLE-OAUTH.md`.

`«NICK: incident status channel — name the public place where the static incident notice will appear.»`

Enter the channel that support will update. Do not create an unapproved URL in this runbook.

## Closeout

Close the incident only after the project state is healthy, the frozen build authorizes a clean account, and Gmail calls succeed. Confirm that the BYO path remains available. File the incident record beside this runbook.
