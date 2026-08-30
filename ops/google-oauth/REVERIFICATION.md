# Google OAuth reverification runbook

## Operating assumption

Assume that restricted-scope work recurs annually until Google gives Wren a written schedule for this architecture. Start the package 120 days before the approval anniversary. Google's pages do not clearly state the schedule for an assessment-exempt local client. Source: `docs/research/shared-client-implementation-plan.md` Part 1 §5.

`«NICK: annual reverification calendar owner»`

Enter the person who owns the calendar, evidence package, and submission deadline.

`«NICK: approval anniversary and 120-day start date»`

Enter the current approval anniversary and the date when the next package starts.

## Annual cycle

### 120 days before the anniversary

1. Confirm that both durable project owners and all contact addresses are current.
2. Confirm the production project id, desktop client id, publishing status, and exact scope set.
3. Ask Google to confirm the required annual verification and assessment path for the installed client and optional agent flow.
4. Freeze the target release version and evidence refresh plan.

Sources: `docs/research/shared-client-implementation-plan.md` Part 1 §5 and Part 2 §4.

### 90 days before the anniversary

1. Test every public URL without authentication or redirects.
2. Compare the privacy, security, support, and deletion text with current code.
3. Refresh the data-flow diagram, data inventory, method matrix, encryption proof, and agent-consent proof.
4. Confirm that project dashboards and alerts still reach both owners.

Sources: `docs/research/shared-client-implementation-plan.md` Part 2 §6 and Part 2 §9.

### 60 days before the anniversary

1. Build and sign the frozen reviewer release.
2. Run the clean-account installation and OAuth instructions.
3. Record a new demo with the current consent screen, scope-backed features, agent session, send approval, and deletion flow.
4. Refresh the transcript and completed shot list.

Source: `docs/research/shared-client-implementation-plan.md` Part 1 §4 and Part 2 §8.

### 30 days before the anniversary

1. Run the pre-submission review in Part 2 §9.
2. Confirm the production project contains no unused client or unreviewed scope.
3. Confirm the app name, logo, domain, URLs, reviewer build, and video match.
4. Submit through the existing Google review channel.
5. Record the submission date, case id, and owner.

Source: `docs/research/shared-client-implementation-plan.md` Part 2 §9-§10.

## Artifacts to refresh

- Production project id and desktop client id.
- Exact app version, commit SHA, build SHA-256, signed download link, and notarization result.
- Homepage, privacy, security, support, and deletion URL checks.
- Method-to-scope matrix and Google method references.
- Data-flow diagram, including the optional hosted-model hop.
- Restricted-data inventory and encryption-field list.
- Account-removal and cryptographic-erasure proof.
- Agent consent and prompt-injection proof.
- Quota calculation, current dashboard screenshots, and alert test results.
- Incident roster and project contact roster.
- Demo video, transcript, and shot list.
- Current assessment determination or CASA evidence.

Source: `docs/research/shared-client-implementation-plan.md` Part 2 §6.

## Off-cycle review triggers

Start an off-cycle review before release when any of these changes:

- Public app name, logo, or publisher identity.
- Authorized domain, homepage, privacy URL, security URL, support URL, or deletion URL.
- Requested OAuth scope set.
- Production Google Cloud project or OAuth client.
- Gmail API method set.
- Agent data path, hosted-model disclosure, or session-consent behavior.
- Encryption fields, key lifecycle, retention, or deletion behavior.

Name, domain, and scope changes can invalidate submitted identity, consent, and method evidence. Visible identity changes also require a new demo. Sources: `docs/research/shared-client-implementation-plan.md` Part 1 §4 and Part 2 §8-§10.

## Completion record

`«NICK: annual package record — enter the submission case id, approval date, next anniversary, and any Google conditions.»`

Store the completed record with the refreshed dossier. Update `ops/google-oauth/CONTACTS.md` when ownership or addresses change.
