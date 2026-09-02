// Runtime environment: where we are, what mode we are in, and what "now" is.
//
// The UI never branches on Tauri anywhere else. Everything native goes through
// MailService or through openExternalUrl() below.

import { isUnifiedFolder } from '@/core/defaults'
import type { PlatformFamily } from '@/core/service/vault-port'
import type { MailView } from '@/core/types'
import { hostname as osHostname, type as osType } from '@tauri-apps/plugin-os'
import { IOS_GOOGLE_CLIENT_ID_PLACEHOLDER } from './ios-oauth'

const rawParams = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)

/** True inside a Tauri window. In a plain browser this is always false. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Whether the mode flags below may be honoured at all.
 *
 * They must not be, in a shipped app. A message body's anchors all carry
 * `target="_top"`, DOMPurify keeps RELATIVE hrefs, and a srcdoc iframe
 * resolves those against the parent — so `<a href="?screenshot=1">Read
 * online</a>` in a received email is a same-origin top-level navigation, which
 * the Rust `on_navigation` guard allows because the host matches. Clicking an
 * ordinary-looking link in a stranger's mail could therefore reload a person's
 * real mail client with a frozen clock and notifications silently off
 * (`screenshot`), with fabricated threads (`demo`), or with Maru's own Google
 * sign-in prompt over a live session (`onboarding`) — a ready-made phishing
 * pretext. It survived until it did not, and nothing on screen would explain
 * it.
 *
 * The capture harness drives Chromium against the vite dev server
 * (scripts/screenshot.mjs), never a packaged build, so gating on "not a
 * shipped Tauri app" costs it nothing. The website demo is outside Tauri and
 * is likewise unaffected.
 *
 * Defence in depth, not the only defence: the navigation guard should reject
 * these too, and the sanitizer should not be handing out `target="_top"` on
 * relative links. This is the layer that is safe to change on a release day.
 */
const modeFlagsAllowed = !isTauri() || import.meta.env.DEV

const params = modeFlagsAllowed ? rawParams : new URLSearchParams('')

/**
 * The four platforms the app distinguishes.
 *
 * Named rather than left inline, because a record keyed by it — the device
 * nouns in `sync-summary.ts` — has to be a compiler-checked cover of exactly
 * these four rather than a table that happens to list them.
 */
export type PlatformOS = 'ios' | 'mac' | 'windows' | 'other'

/** The native platform, resolved once before either application shell mounts. */
export const platformOS: PlatformOS = (() => {
  if (isTauri()) {
    try {
      const native = osType()
      if (native === 'ios') return 'ios'
      if (native === 'macos') return 'mac'
      if (native === 'windows') return 'windows'
    } catch {
      // Fall through to the browser user agent in development previews.
    }
  }
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'ios'
  if (/Mac/.test(ua)) return 'mac'
  if (/Win/.test(ua)) return 'windows'
  return 'other'
})()

export const deviceFamily: PlatformFamily = platformOS === 'ios' ? 'ios' : 'desktop'

/** The iPhone shell, or the gated `?mobile=1` browser-development seam. */
export const isMobileShell = platformOS === 'ios' || params.get('mobile') === '1'

export async function accountDeviceIdentity(
  os: typeof platformOS = platformOS,
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  deviceName?: string,
): Promise<{ name: string; platform: 'ios' | 'macos' | 'windows' | 'linux'; family: 'ios' | 'desktop' }> {
  const nativeName = deviceName ?? (isTauri() ? await osHostname().catch(() => null) : null)
  const browserName = typeof navigator === 'undefined' ? '' : navigator.platform
  const name = nativeName || browserName || (os === 'ios' ? 'iPhone' : 'Desktop')
  const family = os === platformOS ? deviceFamily : os === 'ios' ? 'ios' : 'desktop'
  if (os === 'ios') return { name, platform: 'ios', family }
  if (os === 'windows') return { name, platform: 'windows', family }
  if (os === 'other' && userAgent.includes('Linux')) return { name, platform: 'linux', family }
  return { name, platform: 'macos', family }
}

export const iosGoogleClientId =
  import.meta.env.VITE_MARU_IOS_GOOGLE_CLIENT_ID?.trim() || IOS_GOOGLE_CLIENT_ID_PLACEHOLDER

/** iOS remains on fixtures only for the exact, non-working default client id. */
export function iosClientForcesDemo(clientId = iosGoogleClientId): boolean {
  return clientId.trim() === IOS_GOOGLE_CLIENT_ID_PLACEHOLDER
}

/** Build-time switch used by the iOS target until its OAuth client ships. */
const buildForcesDemo = import.meta.env.VITE_MARU_DEMO === '1'

/** `?demo=1` or `VITE_MARU_DEMO=1` forces demo; browsers only have demo. */
export const isDemo =
  (platformOS === 'ios' && iosClientForcesDemo()) ||
  buildForcesDemo ||
  params.get('demo') === '1' ||
  !isTauri()

/** `?screenshot=1` freezes the clock and removes motion. */
export const isScreenshot = params.get('screenshot') === '1'

/** `?tune=1` mounts the character tuning stage (src/dev) instead of the app. */
export const isTune = params.get('tune') === '1'

/**
 * `?onboarding=1` forces the welcome sequence. It is normally shown only in
 * real mode with no accounts, which a demo build can never reach — so captures
 * and design review need a way in.
 */
export const onboardingPreview = params.get('onboarding') === '1'

/**
 * `?sync=<kind>` forces the demo service to report a sync failure, so the
 * states that say "mail has stopped arriving" can be reviewed and captured.
 *
 * Same reason as `onboarding` above: these are the states a person is most
 * likely to meet on a bad day and the least likely to see on purpose, and the
 * only other way to reach one is to break a real account. Demo-only — it is
 * read by the demo service and nothing else, so it can never colour real mail.
 *
 * `signedout` · `nocreds` · `client` · `noclient` · `transient` · `partial`
 * (`partial` signs out ONE account of several, which is the case the old
 * footer could not express at all — it could not say which.)
 */
export const syncPreview = params.get('sync')

/**
 * `?images=block` forces the blocking policy, for captures and review.
 *
 * Same reason as `onboarding` and `sync` above. Images load by default as of
 * 2026-08-31, so the blocked-image surface — the banner, the `wren-blocked`
 * chip, and the empty-box collapse — became a state a reviewer never reaches on
 * purpose, in the mode all UI verification runs in. It is still live code with
 * unit tests; without this it would simply never appear in a frame again.
 *
 * Read only by the demo service, like the others, so it can never colour real
 * mail — and gated with them behind `modeFlagsAllowed`.
 */
export const imagePreview = params.get('images') === 'block' ? 'block' : null

/**
 * The frozen clock for captures. Demo fixtures are generated relative to
 * `now`, so a real Date.now() would re-date every row on every run and no two
 * captures would compare. Chosen as a late local evening so the fixture set
 * spreads across Today / Yesterday / This week / Earlier.
 */
export const SCREENSHOT_NOW = Date.parse('2026-08-25T06:30:00Z')

/** The clock the whole UI reads. One source, so relative dates never disagree. */
export const NOW: number | undefined = isScreenshot ? SCREENSHOT_NOW : undefined

export function now(): number {
  return NOW ?? Date.now()
}

/** `?theme=light|dark` overrides the persisted setting, for captures. */
export function themeOverride(): 'light' | 'dark' | null {
  const value = params.get('theme')
  return value === 'light' || value === 'dark' ? value : null
}

/**
 * `?view=inbox` or `?view=account:<accountId>:<labelId>` picks the opening
 * view. Captures need to land on a named view without driving the sidebar.
 */
export function viewOverride(): MailView | null {
  const value = params.get('view')
  if (!value) return null
  if (value === 'later') return { kind: 'later' }
  if (isUnifiedFolder(value)) return { kind: 'unified', folder: value }
  const [kind, accountId, ...rest] = value.split(':')
  if (kind === 'account' && accountId && rest.length > 0) {
    return { kind: 'account', accountId, labelId: rest.join(':') }
  }
  return null
}

/** Opens a link outside the app: system browser in Tauri, new tab in a browser. */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
