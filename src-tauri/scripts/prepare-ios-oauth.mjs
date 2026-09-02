import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  IOS_GOOGLE_CLIENT_ID_PLACEHOLDER,
  iosCallbackScheme,
} from '../../src/lib/ios-oauth.ts';

const clientId = process.env.VITE_MARU_IOS_GOOGLE_CLIENT_ID?.trim()
  || IOS_GOOGLE_CLIENT_ID_PLACEHOLDER;
const callbackScheme = iosCallbackScheme(clientId);
// `UIBackgroundModes: remote-notification` is what lets the content-free APNs
// push wake Maru to fetch (MARU-ACCOUNT.md §9). Without it iOS delivers the
// push only while the app is already in the foreground, so it lives here
// rather than in the checked-in Info.plist: this file is the one plist the
// iOS build is guaranteed to merge on every run.
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>UIBackgroundModes</key>
  <array>
    <string>remote-notification</string>
  </array>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeRole</key>
      <string>Editor</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>${callbackScheme}</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`;

writeFileSync(fileURLToPath(new URL('../Info.ios.generated.plist', import.meta.url)), plist);
