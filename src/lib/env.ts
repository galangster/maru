// Runtime environment: where we are, what mode we are in, and what "now" is.
//
// The UI never branches on Tauri anywhere else. Everything native goes through
// MailService or through openExternalUrl() below.

import { isUnifiedFolder } from '@/core/defaults'
import type { MailView } from '@/core/types'

const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)

/** True inside a Tauri window. In a plain browser this is always false. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** `?demo=1` forces demo mode; outside Tauri there is nothing else to run. */
export const isDemo = params.get('demo') === '1' || !isTauri()

/** `?screenshot=1` freezes the clock and removes motion. */
export const isScreenshot = params.get('screenshot') === '1'

/**
 * `?onboarding=1` forces the welcome sequence. It is normally shown only in
 * real mode with no accounts, which a demo build can never reach — so captures
 * and design review need a way in.
 */
export const onboardingPreview = params.get('onboarding') === '1'

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
  if (isUnifiedFolder(value)) return { kind: 'unified', folder: value }
  const [kind, accountId, ...rest] = value.split(':')
  if (kind === 'account' && accountId && rest.length > 0) {
    return { kind: 'account', accountId, labelId: rest.join(':') }
  }
  return null
}

/** macOS needs the traffic lights inset; Windows needs room for the overlay. */
export const platformOS: 'mac' | 'windows' | 'other' = (() => {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/Mac|iPhone|iPad/.test(ua)) return 'mac'
  if (/Win/.test(ua)) return 'windows'
  return 'other'
})()

/** Opens a link outside the app: system browser in Tauri, new tab in a browser. */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
