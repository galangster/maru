import { create } from 'zustand'

import {
  AccountClient,
  AccountSessionStore,
  AccountSync,
  DEFAULT_KDF,
  MaruApiError,
  deriveMasterKey,
  derivePasswordKeys,
  deriveRecoveryKeys,
  generateRecoveryPhrase,
  normalizeEmail,
  recoveryEntropy,
  restoredSummary,
  unwrapByPassword,
  unwrapByRecovery,
  wrapByPassword,
  wrapByRecovery,
  type AccountDevice,
  type AccountSession,
  type AccountSessionAccess,
  type AccountSyncState,
  type Entitlement,
  type Plan,
  type VaultHistoryEntry,
} from '@/core/account'
import type { DemoAccountBackend } from '@/core/demo/account-demo'
import { base64UrlEncodeBytes } from '@/core/mime'
import type { Platform } from '@/core/platform'
import type { PlatformFamily, VaultLocal } from '@/core/service/vault-port'
import type { MailService } from '@/core/types'
import { useUi } from '@/features/mail/ui-store'
import { accountDeviceIdentity } from '@/lib/env'

interface PendingActivation {
  phrase: string
  session: AccountSession
  accountKey: Uint8Array
}

export interface MaruAccountState {
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

interface AccountRuntime {
  client: AccountClient
  session: AccountSessionAccess
  sync: AccountSync | null
  local: VaultLocal
  family: PlatformFamily
  platform: Platform | null
  demoBackend: DemoAccountBackend | null
  unsubscribe: () => void
}

const initialState = {
  loading: true,
  email: null,
  explanation: null,
  pending: null,
  syncState: { kind: 'idle' } as AccountSyncState,
  entitlement: null,
  billingAvailable: true,
  devices: [] as AccountDevice[],
  history: [] as VaultHistoryEntry[],
}

let runtime: AccountRuntime | null = null
let runtimeId = 0

export const useMaruAccount = create<MaruAccountState>(() => ({
  ...initialState,
  signUp,
  signIn,
  recover,
  confirmRecoverySaved,
  refreshAccount,
  retrySync: async () => { await runtime?.sync?.retry() },
  subscribe: subscribeToPlan,
  manageSubscription,
  restoreVersion,
  revokeDevice,
  renameDevice,
  changePassword,
  signOut,
  deleteAccount,
}))

function currentRuntime(): AccountRuntime {
  if (!runtime) throw new Error('The Maru account service is unavailable')
  return runtime
}

async function device() {
  return accountDeviceIdentity()
}

function stopRuntime(): void {
  runtime?.sync?.stop()
  runtime?.unsubscribe()
  runtime = null
}

export async function startAccountSync({
  service,
  platform,
  family,
  demoBackend = null,
}: {
  service: MailService
  platform: Platform | null
  family: PlatformFamily
  demoBackend?: DemoAccountBackend | null
}): Promise<() => void> {
  const id = ++runtimeId
  stopRuntime()
  useMaruAccount.setState({ ...initialState, loading: true })

  const local = service.accountVaultLocal?.((emails) => useUi.getState().setPendingAccounts(emails))
  const session = demoBackend?.session ?? (platform ? new AccountSessionStore(platform) : null)
  if (!local || !session) {
    useMaruAccount.setState({ loading: false })
    return () => {}
  }

  const client = demoBackend
    ? new AccountClient({ fetch: demoBackend.fetch }, 'https://demo.getmaru.app')
    : new AccountClient(platform!)
  const unsubscribe = service.onEvent((event) => {
    if (event.type === 'accountsChanged') runtime?.sync?.invalidateCredentialCache()
    if (event.type === 'accountsChanged' || event.type === 'settingsChanged') runtime?.sync?.schedulePush()
  })
  runtime = { client, session, sync: null, local, family, platform, demoBackend, unsubscribe }

  const [saved, key] = await Promise.all([session.load(), session.accountKey()])
  if (runtimeId !== id) return () => {}
  if (saved && key) startSession(saved)
  useMaruAccount.setState({ loading: false })

  return () => {
    if (runtimeId !== id) return
    stopRuntime()
  }
}

function startSession(session: AccountSession): void {
  const active = currentRuntime()
  active.client.setToken(session.token)
  active.sync?.stop()
  const sync = new AccountSync({
    client: active.client,
    session: active.session,
    local: active.local,
    family: active.family,
  })
  active.sync = sync
  useMaruAccount.setState({ email: session.email, explanation: null, syncState: { kind: 'idle' } })
  sync.subscribe((state) => {
    useMaruAccount.setState({ syncState: state })
    if (state.kind === 'signed_out') {
      sync.stop()
      useMaruAccount.setState({ email: null, explanation: state.message })
    } else if (state.kind === 'idle' && state.summary) {
      useMaruAccount.setState({ explanation: restoredSummary(state.summary) })
    }
  })
  void sync.start()
  void refreshAccount().catch(() => undefined)
}

async function saveActivation(activation: PendingActivation): Promise<void> {
  const active = currentRuntime()
  await active.session.save(activation.session, activation.accountKey)
  useMaruAccount.setState({ pending: null })
  startSession(activation.session)
  active.sync?.schedulePush()
}

async function signUp(rawEmail: string, password: string): Promise<void> {
  const active = currentRuntime()
  const email = normalizeEmail(rawEmail)
  const kdf = active.demoBackend?.kdf ?? DEFAULT_KDF
  const keys = await derivePasswordKeys(await deriveMasterKey(password, email, kdf))
  const phrase = await generateRecoveryPhrase()
  const recovery = await deriveRecoveryKeys(await recoveryEntropy(phrase))
  const accountKey = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const response = await active.client.signup({
    email,
    authKey: base64UrlEncodeBytes(keys.authKey),
    recAuthKey: base64UrlEncodeBytes(recovery.authKey),
    kdf,
    wrappedByPassword: await wrapByPassword(keys.encKey, accountKey),
    wrappedByRecovery: await wrapByRecovery(recovery.encKey, accountKey),
    device: await device(),
  })
  active.client.setToken(response.token)
  useMaruAccount.setState({ pending: { phrase, session: { ...response, email }, accountKey } })
}

async function signIn(rawEmail: string, password: string): Promise<void> {
  const active = currentRuntime()
  const email = normalizeEmail(rawEmail)
  const prelogin = await active.client.prelogin(email)
  const keys = await derivePasswordKeys(await deriveMasterKey(password, email, prelogin.kdf))
  const response = await active.client.login({
    email,
    authKey: base64UrlEncodeBytes(keys.authKey),
    device: await device(),
  })
  const accountKey = await unwrapByPassword(keys.encKey, response.wrappedByPassword)
  const session = { ...response, email }
  await active.session.save(session, accountKey)
  startSession(session)
}

async function recover(rawEmail: string, phrase: string, password: string): Promise<void> {
  const active = currentRuntime()
  const email = normalizeEmail(rawEmail)
  const oldRecovery = await deriveRecoveryKeys(await recoveryEntropy(phrase))
  const recoveryStart = await active.client.recoverStart({
    email,
    recAuthKey: base64UrlEncodeBytes(oldRecovery.authKey),
  })
  const accountKey = await unwrapByRecovery(oldRecovery.encKey, recoveryStart.wrappedByRecovery)
  const passwordKeys = await derivePasswordKeys(await deriveMasterKey(password, email, recoveryStart.kdf))
  const nextPhrase = await generateRecoveryPhrase()
  const nextRecovery = await deriveRecoveryKeys(await recoveryEntropy(nextPhrase))
  const response = await active.client.recover({
    email,
    recAuthKey: base64UrlEncodeBytes(oldRecovery.authKey),
    newAuthKey: base64UrlEncodeBytes(passwordKeys.authKey),
    newWrappedByPassword: await wrapByPassword(passwordKeys.encKey, accountKey),
    newRecAuthKey: base64UrlEncodeBytes(nextRecovery.authKey),
    newWrappedByRecovery: await wrapByRecovery(nextRecovery.encKey, accountKey),
    device: await device(),
  })
  active.client.setToken(response.token)
  useMaruAccount.setState({
    pending: { phrase: nextPhrase, session: { ...response, email }, accountKey },
  })
}

async function confirmRecoverySaved(): Promise<void> {
  const pending = useMaruAccount.getState().pending
  if (pending) await saveActivation(pending)
}

async function handleAccountError(error: unknown): Promise<boolean> {
  return await runtime?.sync?.handleSessionError(error) ?? false
}

async function withBillingFallback<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await action()
    useMaruAccount.setState({ billingAvailable: true })
    return result
  } catch (error) {
    if (await handleAccountError(error)) return undefined
    if (error instanceof MaruApiError && error.status === 503 && error.code === 'billing_unavailable') {
      useMaruAccount.setState({ billingAvailable: false })
      return undefined
    }
    throw error
  }
}

async function refreshAccount(): Promise<void> {
  if (!useMaruAccount.getState().email) return
  const active = currentRuntime()
  const result = await withBillingFallback(() => Promise.all([
    active.client.me(),
    active.client.devices(),
    active.client.vaultHistory(),
  ]))
  if (!result) return
  const [me, devices, history] = result
  useMaruAccount.setState({
    entitlement: me.entitlement,
    devices: devices.devices,
    history: history.versions,
  })
}

async function refreshDevices(): Promise<void> {
  const result = await currentRuntime().client.devices()
  useMaruAccount.setState({ devices: result.devices })
}

async function refreshHistory(): Promise<void> {
  const result = await currentRuntime().client.vaultHistory()
  useMaruAccount.setState({ history: result.versions })
}

async function openExternal(url: string): Promise<void> {
  const platform = currentRuntime().platform
  if (platform) await platform.openExternal(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

async function subscribeToPlan(plan: Plan): Promise<void> {
  await withBillingFallback(async () => openExternal((await currentRuntime().client.checkout(plan)).url))
}

async function manageSubscription(): Promise<void> {
  await withBillingFallback(async () => openExternal((await currentRuntime().client.portal()).url))
}

async function restoreVersion(version: number): Promise<void> {
  const active = currentRuntime()
  await active.client.vaultRestore(version)
  await Promise.all([refreshHistory(), active.sync?.pull()])
}

async function revokeDevice(id: string): Promise<void> {
  await currentRuntime().client.revokeDevice(id)
  await refreshDevices()
}

async function renameDevice(id: string, name: string): Promise<void> {
  await currentRuntime().client.renameDevice(id, name)
  await refreshDevices()
}

async function changePassword(currentPassword: string, nextPassword: string): Promise<void> {
  const email = useMaruAccount.getState().email
  if (!email) return
  const active = currentRuntime()
  const prelogin = await active.client.prelogin(email)
  const current = await derivePasswordKeys(await deriveMasterKey(currentPassword, email, prelogin.kdf))
  const accountKey = await active.session.accountKey()
  if (!accountKey) throw new Error('The Maru account key is missing')
  const next = await derivePasswordKeys(await deriveMasterKey(nextPassword, email, prelogin.kdf))
  await active.client.changePassword({
    authKey: base64UrlEncodeBytes(current.authKey),
    newAuthKey: base64UrlEncodeBytes(next.authKey),
    newWrappedByPassword: await wrapByPassword(next.encKey, accountKey),
  })
}

async function clearLocalSession(): Promise<void> {
  const active = currentRuntime()
  active.sync?.stop()
  active.sync = null
  await active.session.clear()
  active.client.setToken(null)
  useMaruAccount.setState({
    email: null,
    pending: null,
    entitlement: null,
    devices: [],
    history: [],
    syncState: { kind: 'idle' },
  })
}

async function signOut(): Promise<void> {
  try {
    await currentRuntime().client.logout()
  } finally {
    await clearLocalSession()
  }
}

async function deleteAccount(password: string): Promise<void> {
  const email = useMaruAccount.getState().email
  if (!email) return
  const active = currentRuntime()
  const prelogin = await active.client.prelogin(email)
  const keys = await derivePasswordKeys(await deriveMasterKey(password, email, prelogin.kdf))
  await active.client.deleteAccount(base64UrlEncodeBytes(keys.authKey))
  await clearLocalSession()
}
