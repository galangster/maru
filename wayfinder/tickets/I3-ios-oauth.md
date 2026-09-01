# I3 — Gmail sign-in on iOS  `wayfinder:task`

status: **blocked by the iOS OAuth client (queue)** · map 5

An iOS-type client in `maru-mail-prod` (queue). Redirect
`com.googleusercontent.apps.<id>:/oauth2redirect`. A small Tauri plugin
wrapping `ASWebAuthenticationSession` replaces `oauthListen` on iOS in the
platform seam. `family = ios`; tokens filed under `credentials.ios`; the
vault's address list drives directed consent (Q14). Keychain entries use
after-first-unlock accessibility.
