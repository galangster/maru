# Maru account incident runbook

## Scope and roles

This runbook covers the optional Maru account service. The service stores only
vault ciphertext it cannot read, user email, device names, and a Stripe
customer id. Mail never reaches the service.

The incident lead coordinates the response. The second operator can access
GitHub, Railway, and the registrar when the primary operator is unavailable.
Support sends user notices from `support@getmaru.app`. Security reports arrive
at `security@getmaru.app`.

For every incident:

1. Record the first known time in UTC.
2. Assign an incident lead and a second operator.
3. Preserve logs, audit events, deployments, and affected artifacts.
4. Stop the affected write or release path.
5. Determine the affected users, data, versions, and time range.
6. Update `site/status/index.html` by the process in `ops/STATUS.md`.
7. Record each decision, action, and notification time.

## Service outage

Use this procedure when `/healthz` fails or authenticated reads fail for more
than one account.

1. Mark the public status as **Degraded** or **Outage**.
2. Freeze service deploys, migrations, and billing changes.
3. Check Railway deployment state, service logs, CPU, memory, disk, and
   Postgres health.
4. Confirm whether local mail and direct Gmail access still work.
5. Restore the last known good service deployment if the current deployment
   caused the failure.
6. Use the data-loss procedure if Postgres data is missing or inconsistent.
7. Verify `/healthz`, account sign-in, vault read, and vault write before
   resolution.
8. Publish the resolution and record the cause and prevention action.

## Data loss and Railway restore

Use this procedure when vault versions or account records are missing,
corrupt, or unexpectedly changed.

1. Stop sync-service writes. Keep the affected database available for
   evidence when this is safe.
2. Record the suspected loss time and the last known good time.
3. Lock the relevant Railway backup when the control is available.
4. Take a logical dump of the current database for investigation.
5. Open the Railway Postgres service. Select **Backups**.
6. Select a backup from before the loss. Select **Restore**.
7. Review Railway's staged change in **Details**. Railway creates a restored
   volume and retains the previous volume in an unmounted state.
8. Select **Deploy** only after a second operator checks the chosen date.
9. Keep the sync service offline while Postgres starts on the restored volume.
10. Connect to the restored database. Compare table counts with the incident
    record. Read a recent `vaults` row and confirm that its value is ciphertext.
11. Confirm that the selected user's vault history contains no more than ten
    retained versions.
12. Start the sync service. Verify `/healthz`, account sign-in, vault read, and
    a test vault write.
13. Publish the recovery point, recovery time, and known lost-write window.

Railway volume restores work only in the same project and environment. A
restore can remove backups that are newer than the selected backup. Preserve
the current state before you deploy the restore. Review Railway's
[backup documentation](https://docs.railway.com/volumes/backups) before each
restore because provider controls can change.

Run the A5 restore drill before public launch. Use a scratch database for the
drill. Record the restore duration and the age of the restored backup.

## Breach notification rule

Notify affected users within 72 hours after Maru confirms a breach. Use a
shorter deadline when applicable law requires one. Send the notice by email
and publish a notice on `getmaru.app/status`. Tell users what happened, what
was exposed, what Maru did, and what users must do.

Notify providers, counsel, insurers, or authorities through their required
channels when the incident requires it. Do not wait for a complete cause
analysis before you send the affected-user notice.

## Scenario 1: Server breach

**Exposed:** Vault ciphertext, user email, device names, and Stripe customer
ids can be exposed. The attacker cannot read the vault from these service
records alone. Mail never reaches the service. The attacker can delete,
replace, or replay ciphertext while control continues.

**Response:**

1. Isolate the sync service and database from public traffic.
2. Revoke service sessions and rotate Railway, database, webhook, and push
   credentials.
3. Preserve logs and a database snapshot.
4. Determine the affected accounts and time range.
5. Restore trusted data by the Railway procedure when necessary.
6. Verify client-visible vault versions before service returns.

**Notice:** Tell every affected account by email. Publish the incident on the
status page. Send the first affected-user notice within 72 hours of
confirmation.

## Scenario 2: Build-pipeline breach

**Exposed:** Repository secrets, signing credentials, updater credentials, or
release artifacts can be exposed. A malicious client can read local mail,
passwords, recovery keys, and decrypted vault data after a user runs it.

**Response:**

1. Stop release and updater publication.
2. Remove affected downloads and stop serving the affected `latest.json`.
3. Revoke and replace the Developer ID, notarization, updater, and repository
   credentials that the attacker could access.
4. Preserve workflow logs, attestations, release assets, and commit history.
5. Identify every affected version and its publication window.
6. Build a clean replacement from a reviewed commit and verify its provenance.

**Notice:** Tell all accounts that could have installed the affected build.
Use account email, the status page, the GitHub security advisory, and release
notes. Send the first affected-user notice within 72 hours of confirmation.

## Scenario 3: Operator-account breach

**Exposed:** Exposure depends on the compromised account. GitHub can expose
source, releases, and build secrets. Railway can expose service data. Stripe
can expose billing records. Apple and Google Cloud can expose push or OAuth
configuration. The registrar can redirect Maru domains and email.

**Response:**

1. Use the second operator's independent access.
2. Revoke the compromised session and recovery methods.
3. Reset the account password and enroll a new two-factor method.
4. Rotate every secret that the account could read or replace.
5. Review access logs, configuration changes, releases, DNS, and payments.
6. Apply the server or build-pipeline procedure when those systems changed.

**Notice:** Tell users whose data, build, billing record, or traffic could be
affected. Use account email and the status page. Send the first affected-user
notice within 72 hours of confirmation.

## Closeout

Close the incident after the affected path is trusted and user actions are
clear. Publish a final status update. Complete a written review within seven
days. Assign each prevention action to an owner and a due date.
