import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AccountClient,
  AccountSessionStore,
  AccountSync,
  DEFAULT_KDF,
  MaruApiError,
  deriveMasterKey,
  derivePasswordKeys,
  deriveRecoveryKeys,
  encodeBase64Url,
  generateRecoveryPhrase,
  recoveryEntropy,
  restoredSummary,
  unwrapByPassword,
  unwrapByRecovery,
  wrapByPassword,
  wrapByRecovery,
  type AccountDevice,
  type AccountSession,
  type AccountSyncState,
  type Entitlement,
  type KdfParams,
  type Plan,
  type VaultHistoryEntry,
} from '@/core/account'
import { RealMailService } from '@/core/service/real'
import { useMailMode, useMailService, usePlatform } from '@/features/mail/service'
import { useUi } from '@/features/mail/ui-store'

interface PendingActivation {
  phrase: string
  session: AccountSession
  accountKey: Uint8Array
}

export interface MaruAccountContextValue {
  loading: boolean
  email: string | null
  explanation: string | null
  pending: PendingActivation | null
  syncState: AccountSyncState
  entitlement: Entitlement | null
  billingAvailable: boolean
  devices: AccountDevice[]
  history: VaultHistoryEntry[]
  signUp(email: string, password: string): Promise<void>
  signIn(email: string, password: string): Promise<void>
  recover(email: string, phrase: string, password: string): Promise<void>
  confirmRecoverySaved(): Promise<void>
  refreshAccount(): Promise<void>
  retrySync(): Promise<void>
  subscribe(plan: Plan): Promise<void>
  manageSubscription(): Promise<void>
  restoreVersion(version: number): Promise<void>
  revokeDevice(id: string): Promise<void>
  renameDevice(id: string, name: string): Promise<void>
  changePassword(currentPassword: string, nextPassword: string): Promise<void>
  signOut(): Promise<void>
  deleteAccount(password: string): Promise<void>
}

const Context = createContext<MaruAccountContextValue | null>(null)

function device() {
  return {
    name: navigator.platform || 'Desktop',
    platform: navigator.userAgent.includes('Windows') ? 'windows' : navigator.userAgent.includes('Linux') ? 'linux' : 'macos',
    family: 'desktop' as const,
  }
}

class DemoBackend {
  email = ''
  wrappedByPassword = ''
  wrappedByRecovery = ''
  kdf: KdfParams = { algo: 'argon2id', m: 32, t: 2, p: 1 }
  version = 0
  ciphertext = ''
  name = 'Demo desktop'

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const path = new URL(url).pathname
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
    if (path === '/v1/auth/prelogin') return json({ kdf: this.kdf, salt: '', wrappedByRecovery: this.wrappedByRecovery || undefined })
    if (path === '/v1/auth/signup') {
      this.email = String(body.email)
      this.wrappedByPassword = String(body.wrappedByPassword)
      this.wrappedByRecovery = String(body.wrappedByRecovery)
      return json({ token: 'demo-token', deviceId: 'demo-device', accountId: 'demo-account' })
    }
    if (path === '/v1/auth/login') return json({ token: 'demo-token', deviceId: 'demo-device', accountId: 'demo-account', kdf: this.kdf, wrappedByPassword: this.wrappedByPassword })
    if (path === '/v1/auth/recover') {
      this.wrappedByPassword = String(body.newWrappedByPassword)
      this.wrappedByRecovery = String(body.newWrappedByRecovery)
      return json({ token: 'demo-token', deviceId: 'demo-device', accountId: 'demo-account' })
    }
    if (path === '/v1/vault' && (init.method ?? 'GET') === 'GET') {
      return this.version ? json({ version: this.version, ciphertext: this.ciphertext, updatedAt: Date.now() }) : new Response(null, { status: 204 })
    }
    if (path === '/v1/vault' && init.method === 'PUT') {
      this.version += 1
      this.ciphertext = String(body.ciphertext)
      return json({ version: this.version })
    }
    if (path === '/v1/me') return json({ email: this.email, accountId: 'demo-account', entitlement: { state: 'comped', plan: null, trialEndsAt: null, periodEndsAt: null, cancelAtPeriodEnd: false } })
    if (path === '/v1/devices' && (init.method ?? 'GET') === 'GET') return json({ devices: [{ id: 'demo-device', name: this.name, platform: 'macos', family: 'desktop', createdAt: Date.now() - 86_400_000, lastSeenAt: Date.now(), current: true }] })
    if (path === '/v1/devices/demo-device' && init.method === 'PATCH') { this.name = String(body.name); return json({ ok: true }) }
    if (path === '/v1/vault/history') return json({ versions: this.version ? [{ version: this.version, updatedAt: Date.now() }] : [] })
    if (path === '/v1/billing/checkout') return json({ url: 'https://getmaru.app/account?demo=checkout' })
    if (path === '/v1/billing/portal') return json({ url: 'https://getmaru.app/account?demo=portal' })
    return json({ ok: true })
  }
}

export function MaruAccountProvider({ children }: { children: React.ReactNode }) {
  const platform = usePlatform()
  const service = useMailService()
  const { demo } = useMailMode()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingActivation | null>(null)
  const [syncState, setSyncState] = useState<AccountSyncState>({ kind: 'idle' })
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [billingAvailable, setBillingAvailable] = useState(true)
  const [devices, setDevices] = useState<AccountDevice[]>([])
  const [history, setHistory] = useState<VaultHistoryEntry[]>([])
  const clientRef = useRef<AccountClient | null>(null)
  const sessionRef = useRef<AccountSessionStore | null>(null)
  const syncRef = useRef<AccountSync | null>(null)
  const demoKeyRef = useRef<Uint8Array | null>(null)
  const demoBackend = useMemo(() => new DemoBackend(), [])

  const client = useCallback(() => {
    if (clientRef.current) return clientRef.current
    if (demo) clientRef.current = new AccountClient({ fetch: demoBackend.fetch }, 'https://demo.getmaru.app')
    else if (platform) clientRef.current = new AccountClient(platform)
    else throw new Error('The native Maru account service is unavailable')
    return clientRef.current
  }, [demo, demoBackend, platform])

  const startSync = useCallback(async (session: AccountSession, key: Uint8Array) => {
    client().setToken(session.token)
    setEmail(session.email)
    if (demo) {
      demoKeyRef.current = key
      setSyncState({ kind: 'idle' })
      return
    }
    if (!platform || !(service instanceof RealMailService)) return
    syncRef.current?.stop()
    const store = sessionRef.current ?? new AccountSessionStore(platform)
    sessionRef.current = store
    const local = service.accountVaultLocal((emails) => useUi.getState().setPendingAccounts(emails))
    const sync = new AccountSync({ client: client(), session: store, local })
    syncRef.current = sync
    sync.subscribe((state) => {
      setSyncState(state)
      if (state.kind === 'signed_out') {
        setEmail(null)
        setExplanation(state.reason === 'expired' ? 'Your Maru session expired. Sign in again.' : 'This device was signed out remotely. Sign in again to resume sync.')
      } else if (state.kind === 'idle' && state.summary) setExplanation(restoredSummary(state.summary))
    })
    void sync.start()
  }, [client, demo, platform, service])

  const refreshAccount = useCallback(async () => {
    if (!email) return
    try {
      const [me, deviceResult, historyResult] = await Promise.all([
        client().me(), client().devices(), client().vaultHistory(),
      ])
      setEntitlement(me.entitlement)
      setDevices(deviceResult.devices)
      setHistory(historyResult.versions)
      setBillingAvailable(true)
    } catch (error) {
      if (error instanceof MaruApiError && error.status === 503 && error.code === 'billing_unavailable') {
        setBillingAvailable(false)
        return
      }
      throw error
    }
  }, [client, email])

  useEffect(() => {
    let alive = true
    void (async () => {
      if (demo) { if (alive) setLoading(false); return }
      if (!platform) return
      const store = new AccountSessionStore(platform)
      sessionRef.current = store
      const saved = await store.load()
      const key = await store.accountKey()
      if (saved && key && alive) await startSync(saved, key)
      if (alive) setLoading(false)
    })()
    return () => { alive = false; syncRef.current?.stop() }
  }, [demo, platform, startSync])

  useEffect(() => {
    if (!email) return
    void refreshAccount().catch(() => undefined)
  }, [email, refreshAccount])

  useEffect(() => service.onEvent((event) => {
    if (event.type === 'accountsChanged' || event.type === 'settingsChanged') syncRef.current?.schedulePush()
  }), [service])

  const saveActivation = useCallback(async (activation: PendingActivation) => {
    if (!demo) await sessionRef.current?.save(activation.session, activation.accountKey)
    setPending(null)
    await startSync(activation.session, activation.accountKey)
    syncRef.current?.schedulePush()
  }, [demo, startSync])

  const signUp = useCallback(async (rawEmail: string, password: string) => {
    const address = rawEmail.trim().toLowerCase()
    const kdf = demo ? demoBackend.kdf : DEFAULT_KDF
    const master = await deriveMasterKey(password, address, kdf)
    const keys = await derivePasswordKeys(master)
    const phrase = generateRecoveryPhrase()
    const recovery = await deriveRecoveryKeys(recoveryEntropy(phrase))
    const accountKey = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const response = await client().signup({
      email: address,
      authKey: encodeBase64Url(keys.authKey),
      recAuthKey: encodeBase64Url(recovery.authKey),
      kdf,
      wrappedByPassword: await wrapByPassword(keys.encKey, accountKey),
      wrappedByRecovery: await wrapByRecovery(recovery.encKey, accountKey),
      device: device(),
    })
    client().setToken(response.token)
    setPending({ phrase, session: { ...response, email: address }, accountKey })
  }, [client, demo, demoBackend])

  const signIn = useCallback(async (rawEmail: string, password: string) => {
    const address = rawEmail.trim().toLowerCase()
    const prelogin = await client().prelogin(address)
    const keys = await derivePasswordKeys(await deriveMasterKey(password, address, prelogin.kdf))
    const response = await client().login({ email: address, authKey: encodeBase64Url(keys.authKey), device: device() })
    const accountKey = await unwrapByPassword(keys.encKey, response.wrappedByPassword)
    const session = { token: response.token, deviceId: response.deviceId, accountId: response.accountId, email: address }
    if (!demo) await sessionRef.current?.save(session, accountKey)
    await startSync(session, accountKey)
  }, [client, demo, startSync])

  const recover = useCallback(async (rawEmail: string, phrase: string, password: string) => {
    const address = rawEmail.trim().toLowerCase()
    const prelogin = await client().prelogin(address)
    if (!prelogin.wrappedByRecovery) throw new Error('Recovery is unavailable because the service did not return the recovery-wrapped key')
    const oldRecovery = await deriveRecoveryKeys(recoveryEntropy(phrase))
    const accountKey = await unwrapByRecovery(oldRecovery.encKey, prelogin.wrappedByRecovery)
    const passwordKeys = await derivePasswordKeys(await deriveMasterKey(password, address, prelogin.kdf))
    const nextPhrase = generateRecoveryPhrase()
    const nextRecovery = await deriveRecoveryKeys(recoveryEntropy(nextPhrase))
    const response = await client().recover({
      email: address,
      recAuthKey: encodeBase64Url(oldRecovery.authKey),
      newAuthKey: encodeBase64Url(passwordKeys.authKey),
      newWrappedByPassword: await wrapByPassword(passwordKeys.encKey, accountKey),
      newRecAuthKey: encodeBase64Url(nextRecovery.authKey),
      newWrappedByRecovery: await wrapByRecovery(nextRecovery.encKey, accountKey),
      device: device(),
    })
    client().setToken(response.token)
    setPending({ phrase: nextPhrase, session: { ...response, email: address }, accountKey })
  }, [client])

  const openExternal = useCallback(async (url: string) => {
    if (platform) await platform.openExternal(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }, [platform])

  const value: MaruAccountContextValue = {
    loading, email, explanation, pending, syncState, entitlement, billingAvailable, devices, history,
    signUp,
    signIn,
    recover,
    confirmRecoverySaved: async () => { if (pending) await saveActivation(pending) },
    refreshAccount,
    retrySync: async () => { await syncRef.current?.retry() },
    subscribe: async (plan) => {
      try { await openExternal((await client().checkout(plan)).url) }
      catch (error) {
        if (error instanceof MaruApiError && error.status === 503 && error.code === 'billing_unavailable') { setBillingAvailable(false); return }
        throw error
      }
    },
    manageSubscription: async () => {
      try { await openExternal((await client().portal()).url) }
      catch (error) {
        if (error instanceof MaruApiError && error.status === 503 && error.code === 'billing_unavailable') { setBillingAvailable(false); return }
        throw error
      }
    },
    restoreVersion: async (version) => { await client().vaultRestore(version); await syncRef.current?.pull(); await refreshAccount() },
    revokeDevice: async (id) => { await client().revokeDevice(id); await refreshAccount() },
    renameDevice: async (id, name) => { await client().renameDevice(id, name); await refreshAccount() },
    changePassword: async (currentPassword, nextPassword) => {
      if (!email) return
      const prelogin = await client().prelogin(email)
      const current = await derivePasswordKeys(await deriveMasterKey(currentPassword, email, prelogin.kdf))
      const accountKey = demo ? demoKeyRef.current : await sessionRef.current?.accountKey()
      if (!accountKey) throw new Error('The Maru account key is missing')
      const next = await derivePasswordKeys(await deriveMasterKey(nextPassword, email, prelogin.kdf))
      await client().changePassword({ authKey: encodeBase64Url(current.authKey), newAuthKey: encodeBase64Url(next.authKey), newWrappedByPassword: await wrapByPassword(next.encKey, accountKey) })
    },
    signOut: async () => {
      try { await client().logout() } finally {
        syncRef.current?.stop(); syncRef.current = null
        if (!demo) await sessionRef.current?.clear()
        client().setToken(null); setEmail(null); setEntitlement(null); setDevices([]); setHistory([])
      }
    },
    deleteAccount: async (password) => {
      if (!email) return
      const prelogin = await client().prelogin(email)
      const keys = await derivePasswordKeys(await deriveMasterKey(password, email, prelogin.kdf))
      await client().deleteAccount(encodeBase64Url(keys.authKey))
      syncRef.current?.stop()
      if (!demo) await sessionRef.current?.clear()
      client().setToken(null); setEmail(null); setEntitlement(null); setDevices([]); setHistory([])
    },
  }

  return <Context value={value}>{children}</Context>
}

export function useMaruAccount(): MaruAccountContextValue {
  const value = use(Context)
  if (!value) throw new Error('useMaruAccount must be used inside MaruAccountProvider')
  return value
}
