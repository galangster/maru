// Public entry point for the engine. The UI imports from here and from
// ./types only — nothing under gmail/, store/, sync/ or auth/ is UI surface.

import type { Platform } from './platform'
import type { MailService } from './types'
import { Store } from './store/db'
import { RealMailService } from './service/real'
import { DemoMailService } from './service/demo'

export interface CreateMailServiceOptions {
  demo: boolean
  /** Frozen clock for screenshots and tests. Demo mode only. */
  now?: number
}

/**
 * Builds the service the app runs on.
 *
 * Async because the real service opens SQLite and runs migrations before it
 * can answer a single question; the demo service is instant but shares the
 * signature so the caller never branches on it.
 */
export async function createMailService(
  platform: Platform | null,
  opts: CreateMailServiceOptions,
): Promise<MailService> {
  if (opts.demo) return new DemoMailService({ now: opts.now })
  if (!platform) throw new Error('A Platform is required outside demo mode')
  const store = await Store.open(platform)
  return RealMailService.create({ platform, store })
}

export * from './types'
export type { Platform, SqlDb } from './platform'
export { ACCOUNT_PALETTE, accountColor } from './palette'
export { DEFAULT_SETTINGS, FOLDER_LABELS, Store } from './store/db'
export { DemoMailService } from './service/demo'
export { RealMailService, MissingOAuthClientError, UnknownThreadError } from './service/real'
export { OAuthError } from './auth/oauth'
export { HttpError } from './gmail/limiter'
