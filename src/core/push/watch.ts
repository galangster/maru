// When to (re)ask Gmail to watch a mailbox.
//
// `users.watch` is called by the CLIENT with its own token — the relay never
// holds one (MARU-ACCOUNT.md §1, §9). A watch lasts seven days and Google's
// own guidance is to re-arm it at least daily, so Maru renews whenever the
// remaining life is inside a day. Renewal is idempotent: calling watch again
// on a live watch simply extends it.

/** The relay's topic. Owner-created; see A4. */
export const GMAIL_PUSH_TOPIC = 'projects/maru-mail-prod/topics/gmail-push'

/** What Gmail grants: seven days. Not a value Maru chooses. */
export const WATCH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

/** Renew once the watch has less than this left to live. */
export const WATCH_RENEW_WINDOW_MS = 24 * 60 * 60 * 1000

/** email → expiration, epoch ms. */
export type WatchExpirations = Record<string, number>

/**
 * True when this address has no live watch, or one about to lapse.
 *
 * An expiration in the past renews, and so does a missing or unparseable one:
 * the failure mode of renewing too often is a spare quota unit, and the
 * failure mode of renewing too rarely is mail that stops arriving.
 */
export function shouldRenewWatch(expiration: number | undefined | null, now: number): boolean {
  if (expiration === undefined || expiration === null) return true
  if (!Number.isFinite(expiration)) return true
  return expiration - now <= WATCH_RENEW_WINDOW_MS
}

/**
 * Gmail returns `expiration` as a decimal string of epoch milliseconds, and
 * the field is documented as optional. Anything unreadable becomes 0, which
 * `shouldRenewWatch` treats as "renew now".
 */
export function parseWatchExpiration(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  if (typeof raw !== 'string') return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** The addresses whose watch is due, in the order given. */
export function accountsDueForWatch<T extends { email: string }>(
  accounts: readonly T[],
  expirations: WatchExpirations,
  now: number,
): T[] {
  return accounts.filter((account) => shouldRenewWatch(expirations[account.email], now))
}
