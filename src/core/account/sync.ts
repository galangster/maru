import { MaruApiError, type AccountClient, type VaultConflict } from './client'
import { openText, seal } from './crypto'
import type { AccountSessionStore } from './session'
import { applyVault, buildVault, mergeVault, type ApplyVaultSummary, type VaultDocument, type VaultLocal } from './vault'

export type AccountSyncState =
  | { kind: 'idle'; lastSyncAt?: number; summary?: ApplyVaultSummary }
  | { kind: 'syncing'; direction: 'pull' | 'push' }
  | { kind: 'paused'; reason: 'network' | 'conflict' | 'subscription_needed'; message: string }
  | { kind: 'signed_out'; reason: 'revoked' | 'expired' }

export interface AccountSyncOptions {
  client: AccountClient
  session: AccountSessionStore
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
  private focusListener: (() => void) | null = null
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
    await this.pull()
    this.pullTimer = setInterval(() => void this.pull(), this.options.pullIntervalMs ?? 300_000)
    if (typeof window !== 'undefined') {
      this.focusListener = () => { if (document.visibilityState === 'visible') void this.pull() }
      window.addEventListener('focus', this.focusListener)
      document.addEventListener('visibilitychange', this.focusListener)
    }
  }

  stop(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    if (this.pullTimer) clearInterval(this.pullTimer)
    if (this.focusListener && typeof window !== 'undefined') {
      window.removeEventListener('focus', this.focusListener)
      document.removeEventListener('visibilitychange', this.focusListener)
    }
  }

  schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => void this.push(), this.options.debounceMs ?? 2_000)
  }

  retry(): Promise<void> {
    return this.state.kind === 'paused' && this.state.reason === 'subscription_needed' ? this.pull() : this.push()
  }

  private async accountKey(): Promise<Uint8Array> {
    const key = await this.options.session.accountKey()
    if (!key) throw new Error('The Maru account key is missing')
    return key
  }

  private async version(): Promise<number> {
    return Number(await this.options.session.getMeta('vault-version') ?? '0') || 0
  }

  private async handle(error: unknown): Promise<void> {
    if (error instanceof MaruApiError && error.status === 401 && (error.code === 'revoked' || error.code === 'expired')) {
      await this.options.session.clear()
      this.options.client.setToken(null)
      this.publish({ kind: 'signed_out', reason: error.code })
      return
    }
    if (error instanceof MaruApiError && error.status === 402) {
      this.publish({ kind: 'paused', reason: 'subscription_needed', message: 'Sync paused. Subscribe to push changes. Pulling continues.' })
      return
    }
    const network = error instanceof MaruApiError && error.code === 'network'
    this.publish({ kind: 'paused', reason: network ? 'network' : 'conflict', message: network ? 'Sync paused. Check your connection and retry.' : 'Sync paused after three conflicts. Retry to merge again.' })
  }

  async pull(): Promise<void> {
    if (this.state.kind === 'signed_out') return
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
      const summary = await applyVault(remoteDoc, this.options.local)
      await this.options.session.setMeta('vault-version', String(remote.version))
      this.publish({ kind: 'idle', lastSyncAt: this.now(), summary })
    } catch (error) { await this.handle(error) }
  }

  async push(): Promise<void> {
    if (this.state.kind === 'signed_out') return
    this.publish({ kind: 'syncing', direction: 'push' })
    try {
      let baseVersion = await this.version()
      let doc = await buildVault(this.options.local)
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
