// SHA-256 as hex, Web Crypto — the one implementation for every string the
// app digests (credentials, transfer checksums). Runs identically in the
// Tauri webview, a browser, and Node's vitest.

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
