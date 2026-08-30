// Public entry point for the engine. The UI imports from here and from
// ./types only — nothing under gmail/, store/, sync/ or auth/ is UI surface.

import type { Platform } from './platform'
import type { MailService } from './types'
import { Store } from './store/db'
import { RealMailService } from './service/real'
import { DemoMailService } from './service/demo'
import { AgentGateway, createSqlGateway } from './agents/gateway'
import { MemoryAgentStore } from './agents/store'
import { seedDemoAgents } from './agents/demo-fixtures'
import { keyringFor } from './crypto/keyring'

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

/**
 * Builds the agent trust substrate the same app runs on.
 *
 * It takes the MailService rather than the other way round: approving a queued
 * send dispatches through `MailService.send`, which is what makes an agent's
 * message an ordinary Wren send — same optimistic write, same `threadsChanged`
 * event, same Sent list. Nothing in the mail engine knows agents exist.
 *
 * In demo mode it is in-memory and pre-seeded, so every M1 surface has real
 * content to show before any agent has ever connected.
 */
export async function createAgentGateway(
  platform: Platform | null,
  opts: CreateMailServiceOptions & { mail: MailService },
): Promise<AgentGateway> {
  // `opts.now` is set only for captures. Everywhere else the clock is live —
  // a frozen gateway clock would stop the 24-hour expiry sweep from ever
  // firing, which is exactly the bug a frozen clock is supposed to prevent.
  const clock = opts.now === undefined ? () => Date.now() : () => opts.now as number

  if (opts.demo) {
    const store = new MemoryAgentStore()
    await seedDemoAgents(store, clock())
    return new AgentGateway({ store, mail: opts.mail, now: clock })
  }
  if (!platform) throw new Error('A Platform is required outside demo mode')
  // The same handle the mail store opened: TauriPlatform single-flights
  // sqlOpen, so this is one database and one connection, not two.
  return createSqlGateway(await platform.sqlOpen(), opts.mail, {
    now: clock,
    keyring: keyringFor(platform),
  })
}

export * from './types'
export type { Platform, SqlDb } from './platform'
export { htmlToText } from './mime'
export { ACCOUNT_PALETTE, accountColor } from './palette'
export { DEFAULT_SETTINGS, FOLDER_LABELS, Store } from './store/db'
export { DemoMailService } from './service/demo'
export { RealMailService, MissingOAuthClientError, UnknownThreadError } from './service/real'
export { OAuthError } from './auth/oauth'
export { HttpError } from './gmail/limiter'
