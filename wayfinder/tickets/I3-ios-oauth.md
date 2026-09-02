# I3 — Gmail sign-in on iOS  `wayfinder:task`

status: **implemented behind the placeholder client id** · map 5

The client implementation is complete. A Tauri mobile plugin wraps
`ASWebAuthenticationSession`. It replaces `oauthListen` on iOS and returns
the custom-scheme callback to the existing PKCE flow. The iOS exchange is a
public-client exchange with no client secret.

The build reads `VITE_MARU_IOS_GOOGLE_CLIENT_ID`. The exact default
`PLACEHOLDER.apps.googleusercontent.com` keeps demo mode active. Every other
client id enables real mode and derives
`com.googleusercontent.apps.<id>:/oauth2redirect` in the application metadata.

Account vault writes and restores follow the current device family. iOS tokens
are filed under `credentials.ios`. The other family's address list drives
directed consent under the Q14 ruling. Keychain entries retain
after-first-unlock accessibility.

FlowDeck verified the native session on an iPhone 17 Pro Max simulator with
`PLACEHOLDER-TEST.apps.googleusercontent.com`. The sheet loaded
`accounts.google.com` and reached Google's expected `invalid_client` result.
The proof is `docs/captures/ios-auth-session-light.png`. Cancelling the native
prompt returned to Settings with `Sign-in cancelled` and no crash.

The only production queue item is the iOS OAuth client in `maru-mail-prod`.
Create it for bundle id `app.getmaru.ios` and paste its id into the build
environment variable.
