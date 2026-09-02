import type { Account, Settings } from '../types'

export type PlatformFamily = 'desktop' | 'ios'

export interface LocalCredential {
  refreshToken: string
  clientId: string
  issuedAt?: number
}

/**
 * One Later deferral as it travels in the Maru vault — MARU-ACCOUNT.md §4,
 * owner ruling A9 (Nick, 2026-09-02).
 *
 * Identified by the address plus the **Gmail thread id**, because that is the
 * only name for a conversation two devices can both resolve: the local
 * `thread_key` carries a per-device account UUID and would mean nothing on the
 * other machine. It is the one Gmail id in the protocol, and §1 is amended for
 * it: the service holds it as ciphertext and can never read it.
 *
 * `until: null` is a **tombstone** — a deferral cleared somewhere, carried so
 * the clear survives a merge instead of being re-asserted by a stale copy.
 * Exactly one of `setAt` and `clearedAt` is present, and that stamp is what the
 * merge rule compares.
 */
export interface VaultDeferral {
  accountEmail: string
  /** Gmail thread id, NOT the device-local thread key. */
  threadId: string
  /** ms epoch the thread returns to the inbox, or null for a tombstone. */
  until: number | null
  /** When this deferral was saved. Live entries only. */
  setAt?: number
  /** When this deferral was cleared. Tombstones only. */
  clearedAt?: number
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface VaultLocal {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<void>
  listAccounts(): Promise<Account[]>
  upsertAccount(account: Account): Promise<void>
  removeAccount(accountId: string): Promise<void>
  loadCredential(accountId: string): Promise<LocalCredential | null>
  saveCredential(accountId: string, credential: LocalCredential): Promise<void>
  clearCredential(accountId: string): Promise<void>
  /**
   * This device's Later state, as vault entries: every live deferral and every
   * tombstone it still holds. Optional, like the two hooks below, so a partial
   * port (a test fake, a surface with no store behind it) stays valid — a port
   * that cannot list simply syncs no deferrals.
   */
  listDeferrals?(): Promise<VaultDeferral[]>
  /**
   * Write merged deferrals into local storage and report how many rows moved.
   * The caller has already resolved the merge, so this is a plain write — but
   * it MUST ignore an entry naming an account this device does not have, and
   * it MUST NOT call Gmail.
   */
  applyDeferrals?(deferrals: VaultDeferral[]): Promise<number>
  setDirectedConsent?(emails: string[]): void | Promise<void>
  refreshAfterApply?(): void | Promise<void>
  newAccountId?(): string
  now?(): number
}
