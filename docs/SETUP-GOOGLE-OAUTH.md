# Connect Maru to Gmail — one-time Google setup

Maru talks directly to the Gmail API with credentials that belong to *you*.
Nothing routes through anyone's server. That requires a free Google Cloud
OAuth client — about five minutes, once, covering all your accounts.

## Steps

1. **Create a project.** Open https://console.cloud.google.com, sign in,
   and create a project (name it `Maru`).
2. **Enable the Gmail API.** APIs & Services → Library → search
   "Gmail API" → Enable.
3. **Configure the consent screen.** APIs & Services → OAuth consent
   screen → User type **External** → app name `Maru Mail`, your email for both
   contact fields → save through the remaining screens (no scopes need to
   be pre-declared; Maru requests them at sign-in). Under **Test users**,
   add every Gmail address you'll connect.
4. **Create the client.** APIs & Services → Credentials → Create
   credentials → OAuth client ID → application type **Desktop app** →
   name `Maru`. Copy the **Client ID** and **Client secret**.
5. **Paste into Maru.** Settings → Google API → paste both values.
6. **Add your accounts.** Settings → Accounts → Add account. Your browser
   opens Google's sign-in; approve the "unverified app" notice (it's your
   own app) and the Gmail permissions. Repeat per account.

## What Maru asks for

`gmail.modify` only (read, archive, trash, star, mark read — and send,
which Google's `users.messages.send` accepts under this scope).
It never touches contacts, Drive, or anything else. Tokens are stored in
the OS keychain (DPAPI on Windows, Keychain on macOS).

## The 7-day caveat

While your OAuth app's publishing status is **Testing** (the default),
Google expires refresh tokens after 7 days — Maru will ask you to sign in
again weekly. To stop that: OAuth consent screen → **Publish app** (to
"In production", staying unverified). Google then shows a scarier warning
during sign-in — still your own app, still fine — and personal apps under
100 users can stay unverified indefinitely. Maru surfaces re-auth cleanly
either way.
