import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const suffix = '.apps.googleusercontent.com';
const placeholder = `PLACEHOLDER${suffix}`;
const clientId = process.env.VITE_MARU_IOS_GOOGLE_CLIENT_ID?.trim() || placeholder;

if (!clientId.endsWith(suffix)) {
  throw new Error(`VITE_MARU_IOS_GOOGLE_CLIENT_ID must end with ${suffix}`);
}

const clientIdStem = clientId.slice(0, -suffix.length);
if (!/^[A-Za-z0-9._-]+$/.test(clientIdStem)) {
  throw new Error('VITE_MARU_IOS_GOOGLE_CLIENT_ID contains an invalid URL-scheme character');
}

const callbackScheme = `com.googleusercontent.apps.${clientIdStem}`;
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
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
