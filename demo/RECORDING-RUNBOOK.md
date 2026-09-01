# Recording runbook — one sitting, ~20 minutes

Preconditions (all must hold before the first take):

- [ ] The **0.1.6 signed build** is installed from the macos-release CI
  artifact (not a dev build). Verify About shows 0.1.6.
- [ ] The **demo Google account** is signed into the default browser
  (recommended: galangsterr@gmail.com), seeded per `SEED-EMAILS.md`,
  with a few messages, one attachment, and one starred thread.
- [ ] Google account language is **English**.
- [ ] Screen is clean: notifications off (Focus mode), no personal
  tabs/windows visible, dock tidy. Display at 1920×1080 or larger 16:9.
- [ ] An MCP client (Claude Code) is configured against the app's
  gateway for shots 08–09.

Run each shot with `./capture.sh <shot-id>`. The agent drives the app;
Nick's hands are needed ONLY at the marked moments.

| Shot | Content | Nick's part |
| --- | --- | --- |
| 01-build-and-version | Open the app, open About: name + 0.1.6 visible | — |
| 02-account-addition | Click Add account → system browser opens, address bar + client id in URL | Pick the demo account in the chooser |
| 03-consent-screen | The full English consent screen, scroll it all, gmail.modify only | Click **Allow** |
| 04-read-mail | Thread list, open a thread, read body, open the attachment | — |
| 05-modify-mail | Archive one, label one, trash one, untrash it | — |
| 06-human-send | Compose a short message, send it | — |
| 07-agent-session-consent | Create an agent → privacy notice → session consent prompt | Click **Approve** on the consent |
| 08-agent-read | MCP client lists/reads mail inside the approved session | — |
| 09-agent-send-approval | MCP client requests a send → approval prompt → approve → sent | Click **Approve** |
| 10-account-removal | Remove the account, show local data + token deletion | — |

Rules that void a take:

- Shots 02, 03, 07 are **one continuous take** each. A flubbed take is
  deleted and redone, never trimmed.
- The browser address bar must stay on screen during 02–03.
- No cropping, no speed changes, anywhere.

After the last take: flip `hasCapture` and set real durations in
`src/shots.ts`, `npm run render`, watch the output end to end once,
then upload (unlisted YouTube or Drive) and record the link in the
dossier.
