import { MaruApiError, type AccountClient, type VaultConflict } from './client'
import { openText, seal } from './crypto'
import type { LocalCredential } from '../service/vault-port'
import type { AccountSessionAccess } from './session'
import { applyVault, buildVault, mergeVault, type ApplyVaultSummary, type VaultDocument, type VaultLocal } from './vault'

export type AccountSyncState =
  | { kind: 'idle'; lastSyncAt?: number; summary?: ApplyVaultSummary }
  | { kind: 'syncing'; direction: 'pull' | 'push' }
  | { kind: 'paused'; reason: 'network' | 'conflict' | 'subscription_needed'; message: string }
  | { kind: 'signed_out'; reason: 'revoked' | 'expired'; message: string }

export interface AccountSyncOptions {
  client: AccountClient
  session: AccountSessionAccess
  local: VaultLocal
  debounceMs?: number
  pullIntervalMs?: number
  now?: () => number
}

export class AccountSync {
  private state: AccountSyncState = { kind: 'idle' }
  private readonly listeners = new Set<(state: AccountSyncState) => void>()
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private pullTimer: ReturnType<typeof setInterval> | null = null
  private visibilityListener: (() => void) | null = null
  private pullInFlight: Promise<void> | null = null
  private pushInFlight: Promise<void> | null = null
  private credentialCache: Map<string, LocalCredential> | null = null
  private credentialCacheInFlight: Promise<Map<string, LocalCredential>> | null = null
  private applying = false
  private stopped = true
  private readonly now: () => number

  constructor(private readonly options: AccountSyncOptions) {
    this.now = options.now ?? Date.now
  }

  currentState(): AccountSyncState { return this.state }
  subscribe(listener: (state: AccountSyncState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }
  private publish(state: AccountSyncState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }

  async start(): Promise<void> {
    this.stopped = false
    await this.pull()
    if (this.stopped) return
    this.pullTimer = setInterval(() => void this.pull(), this.options.pullIntervalMs ?? 300_000)
    if (typeof window !== 'undefined') {
      this.visibilityListener = () => { if (document.visibilityState === 'visible') void this.pull() }
      document.addEventListener('visibilitychange', this.visibilityListener)
    }
  }

  stop(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    if (this.pullTimer) clearInterval(this.pullTimer)
    this.pushTimer = null
    this.pullTimer = null
    this.stopped = true
    if (this.visibilityListener && typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener)
      this.visibilityListener = null
    }
  }

  schedulePush(): void {
    if (this.stopped || this.applying) return
    if (this.state.kind === 'paused' && this.state.reason === 'subscription_needed') return
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => void this.push(), this.options.debounceMs ?? 2_000)
  }

  async retry(): Promise<void> {
    if (this.state.kind === 'paused' && this.state.reason === 'subscription_needed') {
      await this.pull(true)
      await this.push()
      return
    }
    await this.push()
  }

  private async accountKey(): Promise<Uint8Array> {
    const key = await this.options.session.accountKey()
    if (!key) throw new Error('The Maru account key is missing')
    return key
  }

  private async version(): Promise<number> {
    return Number(await this.options.session.getMeta('vault-version') ?? '0') || 0
  }

  invalidateCredentialCache(): void {
    this.credentialCache = null
    this.credentialCacheInFlight = null
  }

  private credentials(): Promise<Map<string, LocalCredential>> {
    if (this.credentialCache) return Promise.resolve(this.credentialCache)
    if (this.credentialCacheInFlight) return this.credentialCacheInFlight
    this.credentialCacheInFlight = (async () => {
      const accounts = await this.options.local.listAccounts()
      const entries = await Promise.all(accounts.map(async (account) => [
        account.id,
        await this.options.local.loadCredential(account.id),
      ] as const))
      const credentials = new Map<string, LocalCredential>()
      for (const [accountId, credential] of entries) {
        if (credential) credentials.set(accountId, credential)
      }
      this.credentialCache = credentials
      this.credentialCacheInFlight = null
      return credentials
    })()
    return this.credentialCacheInFlight
  }

  async handleSessionError(error: unknown): Promise<boolean> {
    if (!(error instanceof MaruApiError) || error.status !== 401 || (error.code !== 'revoked' && error.code !== 'expired')) return false
    await this.options.session.clear()
    this.options.client.setToken(null)
    const message = error.code === 'expired'
      ? 'Your Maru session expired. Sign in again.'
      : 'This device was signed out remotely. Sign in again to resume sync.'
    this.publish({ kind: 'signed_out', reason: error.code, message })
    return true
  }

  private async handle(error: unknown): Promise<void> {
    if (await this.handleSessionError(error)) return
    if (error instanceof MaruApiError && error.status === 402) {
      this.publish({ kind: 'paused', reason: 'subscription_needed', message: 'Sync paused. Subscribe to push changes. Pulling continues.' })
      return
    }
    const network = error instanceof MaruApiError && error.code === 'network'
    this.publish({ kind: 'paused', reason: network ? 'network' : 'conflict', message: network ? 'Sync paused. Check your connection and retry.' : 'Sync paused after three conflicts. Retry to merge again.' })
  }

  pull(force = false): Promise<void> {
    if (this.pullInFlight) return this.pullInFlight
    const running = this.runPull(force).finally(() => {
      if (this.pullInFlight === running) this.pullInFlight = null
    })
    this.pullInFlight = running
    return running
  }

  private async runPull(force: boolean): Promise<void> {
    if (this.state.kind === 'signed_out') return
    if (!force && this.state.kind === 'paused' && this.state.reason !== 'subscription_needed') return
    this.publish({ kind: 'syncing', direction: 'pull' })
    try {
      const remote = await this.options.client.vault()
      if (!remote) {
        this.publish({ kind: 'idle', lastSyncAt: this.now() })
        return
      }
      const localVersion = await this.version()
      if (remote.version <= localVersion) {
        this.publish({ kind: 'idle', lastSyncAt: this.now() })
        return
      }
      const key = await this.accountKey()
      const remoteDoc = JSON.parse(await openText(key, remote.ciphertext, `maru-vault-v1:${remote.version}`)) as VaultDocument
      this.applying = true
      let summary: ApplyVaultSummary
      try {
        summary = await applyVault(remoteDoc, this.options.local)
      } finally {
        this.applying = false
      }
      if (summary.tokensFiled) this.invalidateCredentialCache()
      await this.options.session.setMeta('vault-version', String(remote.version))
      this.publish({ kind: 'idle', lastSyncAt: this.now(), summary })
    } catch (error) { await this.handle(error) }
  }

  push(): Promise<void> {
    if (this.pushInFlight) return this.pushInFlight
    const running = this.runPush().finally(() => {
      if (this.pushInFlight === running) this.pushInFlight = null
    })
    this.pushInFlight = running
    return running
  }

  private async runPush(): Promise<void> {
    if (this.state.kind === 'signed_out') return
    this.publish({ kind: 'syncing', direction: 'push' })
    try {
      let baseVersion = await this.version()
      let doc = await buildVault(this.options.local, undefined, await this.credentials())
      const key = await this.accountKey()
      for (let round = 0; round < 3; round += 1) {
        try {
          const ciphertext = await seal(key, JSON.stringify(doc), `maru-vault-v1:${baseVersion + 1}`)
          const result = await this.options.client.putVault(baseVersion, ciphertext)
          await this.options.session.setMeta('vault-version', String(result.version))
          this.publish({ kind: 'idle', lastSyncAt: this.now() })
          return
        } catch (error) {
          if (!(error instanceof MaruApiError) || error.status !== 409) throw error
          const conflict = error.details as VaultConflict | undefined
          if (!conflict || typeof conflict.version !== 'number' || typeof conflict.ciphertext !== 'string') throw error
          const remote = JSON.parse(await openText(key, conflict.ciphertext, `maru-vault-v1:${conflict.version}`)) as VaultDocument
          doc = mergeVault(remote, doc)
          baseVersion = conflict.version
        }
      }
      this.publish({ kind: 'paused', reason: 'conflict', message: 'Sync paused after three conflicts. Retry to merge again.' })
    } catch (error) { await this.handle(error) }
  }
}
