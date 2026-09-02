import { beforeEach, describe, expect, it, vi } from 'vitest'

import { badgeCount } from '../src/core/push/badge'
import { composeArrival } from '../src/core/push/notification'
import {
  PushRuntime,
  localWatchStore,
  type PushMailService,
  type PushRelayClient,
  type WatchStore,
} from '../src/core/push/runtime'
import {
  describeApiError,
  describeTestResult,
  tokenPrefix,
  type PushDiagnostics,
  type PushTestResponse,
} from '../src/core/push/diagnostics'
import type { PushEvent, PushNotification, PushPort, PushStatus } from '../src/core/push/types'
import {
  GMAIL_PUSH_TOPIC,
  WATCH_RENEW_WINDOW_MS,
  accountsDueForWatch,
  parseWatchExpiration,
  shouldRenewWatch,
} from '../src/core/push/watch'
import type { MailEvent, MailView } from '../src/core/types'
import { noPushRequest, setPushUi, usePushUi } from '../src/features/notifications/push-store'

const NOW = Date.parse('2026-09-01T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

describe('watch renewal', () => {
  it('renews when there is no watch at all', () => {
    expect(shouldRenewWatch(undefined, NOW)).toBe(true)
    expect(shouldRenewWatch(null, NOW)).toBe(true)
  })

  it('renews a watch that has already lapsed', () => {
    expect(shouldRenewWatch(NOW - 1, NOW)).toBe(true)
  })

  it('renews inside the last day of life, and not before', () => {
    expect(shouldRenewWatch(NOW + WATCH_RENEW_WINDOW_MS - 1, NOW)).toBe(true)
    expect(shouldRenewWatch(NOW + WATCH_RENEW_WINDOW_MS, NOW)).toBe(true)
    expect(shouldRenewWatch(NOW + WATCH_RENEW_WINDOW_MS + 1, NOW)).toBe(false)
  })

  it('renews rather than trusting an unusable expiration', () => {
    expect(shouldRenewWatch(Number.NaN, NOW)).toBe(true)
    expect(shouldRenewWatch(Number.POSITIVE_INFINITY, NOW)).toBe(true)
  })

  it('reads Gmail expirations, which arrive as decimal strings', () => {
    expect(parseWatchExpiration('1788000000000')).toBe(1788000000000)
    expect(parseWatchExpiration(1788000000000)).toBe(1788000000000)
    expect(parseWatchExpiration(undefined)).toBe(0)
    expect(parseWatchExpiration('not a number')).toBe(0)
  })

  it('picks out only the accounts that are due', () => {
    const accounts = [
      { id: 'a', email: 'one@gmail.com' },
      { id: 'b', email: 'two@gmail.com' },
      { id: 'c', email: 'three@gmail.com' },
    ]
    const due = accountsDueForWatch(
      accounts,
      { 'one@gmail.com': NOW + 6 * DAY, 'two@gmail.com': NOW + 2 * 60 * 60 * 1000 },
      NOW,
    )
    expect(due.map((a) => a.email)).toEqual(['two@gmail.com', 'three@gmail.com'])
  })
})

describe('notification composition', () => {
  it('leads with the sender and the subject', () => {
    expect(composeArrival({ from: 'Ada Lovelace', subject: 'Numbers', threads: 1 })).toEqual({
      title: 'Ada Lovelace',
      body: 'Numbers',
      threadKey: undefined,
    })
  })

  it('says how many more arrived in the same pass', () => {
    expect(composeArrival({ from: 'Ada', subject: 'Numbers', threads: 3 }).body).toBe(
      'Numbers — and 2 more',
    )
  })

  it('has words for a message with no subject and no display name', () => {
    expect(composeArrival({ from: '  ', subject: '', threads: 1 })).toEqual({
      title: 'New message',
      body: '(no subject)',
      threadKey: undefined,
    })
  })

  it('carries the thread key a tap has to open', () => {
    expect(composeArrival({ from: 'Ada', subject: 'Hi', threads: 1, threadKey: 'acc:1' }).threadKey)
      .toBe('acc:1')
  })
})

describe('badge mapping', () => {
  it('shows the unread count', () => {
    expect(badgeCount(7)).toBe(7)
    expect(badgeCount(0)).toBe(0)
  })

  it('never hands iOS a number it cannot draw', () => {
    expect(badgeCount(-3)).toBe(0)
    expect(badgeCount(2.7)).toBe(2)
    expect(badgeCount(Number.NaN)).toBe(0)
    expect(badgeCount(Number.POSITIVE_INFINITY)).toBe(0)
    expect(badgeCount(undefined)).toBe(0)
    expect(badgeCount(null)).toBe(0)
  })
})

describe('diagnostic wording', () => {
  it('keeps the first eight hex characters of a token, and no more', () => {
    expect(tokenPrefix('0123456789abcdef')).toBe('01234567')
    expect(tokenPrefix(null)).toBe(null)
    expect(tokenPrefix('')).toBe(null)
  })

  it('names the HTTP status and the code a Maru error carries', () => {
    expect(describeApiError(Object.assign(new Error('Try again later.'), { status: 429, code: 'rate_limited' })))
      .toBe('HTTP 429 rate_limited — Try again later.')
  })

  it('falls back to whatever a thrown non-error says', () => {
    expect(describeApiError(new Error('boom'))).toBe('boom')
    expect(describeApiError('boom')).toBe('boom')
  })

  it("reads a send, Apple's rejection, and a relay that sent nothing", () => {
    expect(describeTestResult({ ok: true, sent: true })).toBe('Sent')
    expect(describeTestResult({ ok: false, sent: false, apns: { status: 400, reason: 'TopicDisallowed' } }))
      .toBe('Apple rejected it — HTTP 400 TopicDisallowed')
    expect(describeTestResult({ ok: false, sent: false })).toBe('The relay did not send it')
    expect(describeTestResult(null)).toBe('The relay did not send it')
  })
})

describe('push UI store', () => {
  it('starts with nothing to report and no action to take', () => {
    expect(usePushUi.getState()).toMatchObject({
      tokenPrefix: null,
      registration: 'none',
      lastError: null,
      testing: false,
      lastTest: null,
      sendTestPush: noPushRequest,
    })
  })

  it('takes a diagnostics patch without losing the rest of the state', () => {
    setPushUi({ permission: 'granted' })
    setPushUi({ registration: 'failed', lastError: 'APNs: no entitlement' })
    expect(usePushUi.getState()).toMatchObject({
      permission: 'granted',
      registration: 'failed',
      lastError: 'APNs: no entitlement',
    })
  })
})

// ---------------------------------------------------------------------------

class FakePort implements PushPort {
  available = true
  status: PushStatus = { permission: 'granted', token: 'abcd' }
  notifications: PushNotification[] = []
  badges: number[] = []
  completions: { id: string; newData: boolean }[] = []
  permissionChecks = 0
  emit: (event: PushEvent) => void = () => {}

  async start(onEvent: (event: PushEvent) => void): Promise<PushStatus> {
    this.emit = onEvent
    return this.status
  }
  async permissionState(): Promise<PushStatus> {
    this.permissionChecks += 1
    return this.status
  }
  async requestPermission(): Promise<PushStatus> {
    this.status = { ...this.status, permission: 'granted' }
    return this.status
  }
  async setBadgeCount(count: number): Promise<void> {
    this.badges.push(count)
  }
  async notify(notification: PushNotification): Promise<void> {
    this.notifications.push(notification)
  }
  async completePush(id: string, newData: boolean): Promise<void> {
    this.completions.push({ id, newData })
  }
}

class FakeMail implements PushMailService {
  accounts = [{ id: 'a1', email: 'nick@gmail.com' }]
  unread = 4
  watchCalls: { accountId: string; topic: string }[] = []
  refreshes = 0
  /** Emitted synchronously by the next refresh(), as the engine does. */
  arrivals: MailEvent[] = []
  refreshFails = false
  private listeners = new Set<(event: MailEvent) => void>()

  async listAccounts() {
    return this.accounts
  }
  async refresh() {
    this.refreshes += 1
    if (this.refreshFails) throw new Error('offline')
    for (const event of this.arrivals) for (const cb of this.listeners) cb(event)
    this.arrivals = []
  }
  async unreadCount(_view: MailView) {
    return this.unread
  }
  onEvent(cb: (event: MailEvent) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  async startPushWatch(accountId: string, topic: string) {
    this.watchCalls.push({ accountId, topic })
    return { expiration: NOW + 7 * DAY }
  }
}

class FakeRelay implements PushRelayClient {
  registered: (string | null)[] = []
  watched: { email: string; expiration: number }[] = []
  tests = 0
  /** Thrown by the next pushRegister, then cleared, as a 402 or a 401 would be. */
  registerFails: unknown = null
  testResult: PushTestResponse = { ok: true, sent: true }
  testFails: unknown = null
  async pushRegister(apnsToken: string | null) {
    if (this.registerFails) {
      const failure = this.registerFails
      this.registerFails = null
      throw failure
    }
    this.registered.push(apnsToken)
    return { ok: true }
  }
  async pushWatch(email: string, expiration: number) {
    this.watched.push({ email, expiration })
    return { ok: true }
  }
  async pushTest() {
    this.tests += 1
    if (this.testFails) throw this.testFails
    return this.testResult
  }
}

function memoryWatchStore(initial: Record<string, number> = {}): WatchStore {
  let state = { ...initial }
  return {
    read: () => ({ ...state }),
    write: (next) => {
      state = { ...next }
    },
  }
}

function newMail(overrides: Partial<Extract<MailEvent, { type: 'newMail' }>> = {}): MailEvent {
  return {
    type: 'newMail',
    accountId: 'a1',
    threadKey: 'a1:t1',
    from: 'Ada',
    subject: 'Numbers',
    threads: 1,
    ...overrides,
  }
}

describe('PushRuntime', () => {
  let port: FakePort
  let mail: FakeMail
  let relay: FakeRelay

  beforeEach(() => {
    port = new FakePort()
    mail = new FakeMail()
    relay = new FakeRelay()
  })

  const build = (over: Partial<ConstructorParameters<typeof PushRuntime>[0]> = {}) =>
    new PushRuntime({
      port,
      mail,
      relay: () => relay,
      watches: memoryWatchStore(),
      now: () => NOW,
      log: () => {},
      ...over,
    })

  it('registers the token and arms a watch on start', async () => {
    const runtime = build()
    await runtime.start()
    expect(relay.registered).toEqual(['abcd'])
    expect(mail.watchCalls).toEqual([{ accountId: 'a1', topic: GMAIL_PUSH_TOPIC }])
    expect(relay.watched).toEqual([{ email: 'nick@gmail.com', expiration: NOW + 7 * DAY }])
    expect(port.badges).toEqual([4])
  })

  it('leaves a watch alone while it still has days to run', async () => {
    const runtime = build({ watches: memoryWatchStore({ 'nick@gmail.com': NOW + 6 * DAY }) })
    await runtime.start()
    expect(mail.watchCalls).toEqual([])
    expect(relay.watched).toEqual([])
  })

  it('does nothing at all off iOS', async () => {
    port.available = false
    const runtime = build()
    await runtime.start()
    expect(relay.registered).toEqual([])
    expect(mail.watchCalls).toEqual([])
    expect(port.badges).toEqual([])
  })

  it('arms no watch without a Maru account', async () => {
    const runtime = build({ relay: () => null })
    await runtime.start()
    expect(mail.watchCalls).toEqual([])
    // The badge is still Maru's to keep honest.
    expect(port.badges).toEqual([4])
  })

  it('syncs, notifies, badges and answers iOS for one push', async () => {
    const runtime = build()
    await runtime.start()
    mail.arrivals = [newMail({ threads: 2, subject: 'Numbers' })]
    mail.unread = 6
    await runtime.handlePush('push-1')
    expect(mail.refreshes).toBe(1)
    expect(port.notifications).toEqual([
      { title: 'Ada', body: 'Numbers — and 1 more', threadKey: 'a1:t1' },
    ])
    expect(port.completions).toEqual([{ id: 'push-1', newData: true }])
    expect(port.badges.at(-1)).toBe(6)
  })

  it('tells iOS a push brought nothing when nothing arrived', async () => {
    const runtime = build()
    await runtime.start()
    await runtime.handlePush('push-2')
    expect(port.notifications).toEqual([])
    expect(port.completions).toEqual([{ id: 'push-2', newData: false }])
  })

  it('still answers iOS when the sync fails', async () => {
    const runtime = build()
    await runtime.start()
    mail.refreshFails = true
    await runtime.handlePush('push-3')
    expect(port.completions).toEqual([{ id: 'push-3', newData: false }])
  })

  it('answers iOS only once the notification is posted', async () => {
    const runtime = build()
    await runtime.start()
    const order: string[] = []
    let post = () => {}
    const posted = new Promise<void>((resolve) => {
      post = resolve
    })
    port.notify = async () => {
      await posted
      order.push('notified')
    }
    port.completePush = async () => void order.push('completed')
    mail.arrivals = [newMail()]

    const wake = runtime.handlePush('push-slow')
    // Everything that can run without the notification, has.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(order).toEqual([])

    post()
    await wake
    expect(order).toEqual(['notified', 'completed'])
  })

  it('answers iOS even when the notification fails', async () => {
    const runtime = build()
    await runtime.start()
    port.notify = async () => {
      throw new Error('notification centre said no')
    }
    mail.arrivals = [newMail()]
    await runtime.handlePush('push-5')
    expect(port.completions).toEqual([{ id: 'push-5', newData: true }])
  })

  it('writes the badge only when the number changed', async () => {
    const runtime = build()
    await runtime.start()
    await runtime.handlePush('push-a')
    expect(port.badges).toEqual([4])
    mail.unread = 5
    await runtime.handlePush('push-b')
    expect(port.badges).toEqual([4, 5])
  })

  it('collapses two foreground events into one pass', async () => {
    const runtime = build()
    await runtime.start()
    port.permissionChecks = 0
    await Promise.all([runtime.onForeground(), runtime.onForeground()])
    expect(port.permissionChecks).toBe(1)
  })

  it('registers the device and arms the watch when an account signs in', async () => {
    let account: PushRelayClient | null = null
    const runtime = build({ relay: () => account })
    await runtime.start()
    expect(relay.registered).toEqual([])
    expect(mail.watchCalls).toEqual([])

    account = relay
    await runtime.onRelayAvailable()
    expect(relay.registered).toEqual(['abcd'])
    expect(relay.watched).toEqual([{ email: 'nick@gmail.com', expiration: NOW + 7 * DAY }])
  })

  it('arms no watch, and logs nothing, on a build that cannot call users.watch', async () => {
    const log = vi.fn()
    const bare: PushMailService = {
      listAccounts: () => mail.listAccounts(),
      refresh: () => mail.refresh(),
      unreadCount: (view) => mail.unreadCount(view),
      onEvent: (cb) => mail.onEvent(cb),
    }
    const runtime = build({ mail: bare, log })
    await runtime.start()
    expect(relay.watched).toEqual([])
    expect(log).not.toHaveBeenCalled()
  })

  it('opens the thread a tapped notification names', async () => {
    const openThread = vi.fn()
    const runtime = build({ openThread })
    await runtime.start()
    port.emit({ event: 'notificationOpened', threadId: 'a1:t9' })
    expect(openThread).toHaveBeenCalledWith('a1:t9')
  })

  it('re-registers a token that changed, and only then', async () => {
    const runtime = build()
    await runtime.start()
    port.emit({ event: 'pushToken', token: 'abcd' })
    await Promise.resolve()
    expect(relay.registered).toEqual(['abcd'])
    port.emit({ event: 'pushToken', token: 'ef01' })
    await Promise.resolve()
    expect(relay.registered).toEqual(['abcd', 'ef01'])
  })

  it('does not arm a watch while notifications are refused', async () => {
    port.status = { permission: 'denied', token: null }
    const onPermission = vi.fn()
    const runtime = build({ onPermission })
    await runtime.start()
    expect(mail.watchCalls).toEqual([])
    expect(onPermission).toHaveBeenCalledWith('denied')
  })

  it('arms the watch as soon as permission is granted', async () => {
    port.status = { permission: 'prompt', token: null }
    const runtime = build()
    await runtime.start()
    expect(mail.watchCalls).toEqual([])
    await runtime.requestPermission()
    expect(mail.watchCalls).toEqual([{ accountId: 'a1', topic: GMAIL_PUSH_TOPIC }])
  })

  it('keeps one mailbox failing from stopping the others', async () => {
    mail.accounts = [
      { id: 'a1', email: 'one@gmail.com' },
      { id: 'a2', email: 'two@gmail.com' },
    ]
    mail.startPushWatch = async (accountId: string) => {
      if (accountId === 'a1') throw new Error('grant revoked')
      return { expiration: NOW + 7 * DAY }
    }
    const runtime = build()
    await runtime.start()
    expect(relay.watched).toEqual([{ email: 'two@gmail.com', expiration: NOW + 7 * DAY }])
  })

  // -------------------------------------------------------------------------
  // Diagnostics, and the registration race they were written to expose.

  it('sends a token that arrived before the Maru account did, on the next foreground', async () => {
    // The shape of the live defect: APNs answered while the account was still
    // hydrating from the keychain, so the relay had a watch and no token.
    let account: PushRelayClient | null = null
    const runtime = build({ relay: () => account })
    await runtime.start()
    expect(relay.registered).toEqual([])

    account = relay
    await runtime.onForeground()
    expect(relay.registered).toEqual(['abcd'])
  })

  it('registers once, however many times the app comes forward', async () => {
    const runtime = build()
    await runtime.start()
    await runtime.onForeground()
    await runtime.onForeground()
    expect(relay.registered).toEqual(['abcd'])
  })

  it('retries a registration the relay refused', async () => {
    relay.registerFails = Object.assign(new Error('offline'), { status: 0, code: 'network' })
    const runtime = build()
    await runtime.start()
    expect(relay.registered).toEqual([])
    expect(runtime.pushDiagnostics().registration).toBe('failed')

    await runtime.onForeground()
    expect(relay.registered).toEqual(['abcd'])
    expect(runtime.pushDiagnostics().registration).toBe('registered')
  })

  it('reports the token prefix and the registration it reached', async () => {
    port.status = { permission: 'granted', token: '0123456789abcdef' }
    const diagnostics: PushDiagnostics[] = []
    const runtime = build({ onDiagnostics: (next) => diagnostics.push(next) })
    await runtime.start()
    expect(runtime.pushDiagnostics()).toEqual({
      tokenPrefix: '01234567',
      registration: 'registered',
      lastError: null,
    })
    expect(diagnostics.at(-1)?.registration).toBe('registered')
  })

  it('keeps the HTTP status of a registration the relay refused', async () => {
    relay.registerFails = Object.assign(new Error('Your Maru plan has expired'), {
      status: 402,
      code: 'payment_required',
    })
    const runtime = build()
    await runtime.start()
    expect(runtime.pushDiagnostics()).toEqual({
      tokenPrefix: 'abcd',
      registration: 'failed',
      lastError: 'HTTP 402 payment_required — Your Maru plan has expired',
    })
  })

  it('surfaces an APNs registration failure instead of only logging it', async () => {
    port.status = { permission: 'granted', token: null }
    const runtime = build()
    await runtime.start()
    port.emit({ event: 'pushFailed', message: 'no valid aps-environment entitlement' })
    await Promise.resolve()
    expect(runtime.pushDiagnostics()).toEqual({
      tokenPrefix: null,
      registration: 'failed',
      lastError: 'APNs: no valid aps-environment entitlement',
    })
  })

  it('says what the test push did', async () => {
    const runtime = build()
    await runtime.start()
    expect(await runtime.testPush()).toBe('Sent')
    expect(relay.tests).toBe(1)

    relay.testResult = { ok: false, sent: false, apns: { status: 410, reason: 'BadDeviceToken' } }
    expect(await runtime.testPush()).toBe('Apple rejected it — HTTP 410 BadDeviceToken')

    relay.testFails = Object.assign(new Error('This device has not registered an APNs token.'), {
      status: 404,
      code: 'no_token',
    })
    expect(await runtime.testPush()).toBe(
      'HTTP 404 no_token — This device has not registered an APNs token.',
    )
  })

  it('asks for a Maru account rather than testing without one', async () => {
    const runtime = build({ relay: () => null })
    await runtime.start()
    expect(await runtime.testPush()).toBe('Sign in to your Maru account first')
    expect(relay.tests).toBe(0)
  })

  it('fills the Settings store through the diagnostics callback', async () => {
    const runtime = build({ onDiagnostics: (next) => setPushUi(next) })
    await runtime.start()
    expect(usePushUi.getState()).toMatchObject({
      tokenPrefix: 'abcd',
      registration: 'registered',
      lastError: null,
    })
  })
})

describe('localWatchStore', () => {
  it('round-trips expirations and ignores rubbish', () => {
    // The webview has one; Node does not.
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
    })
    const store = localWatchStore('maru.test.watches')
    store.write({ 'nick@gmail.com': NOW })
    expect(store.read()).toEqual({ 'nick@gmail.com': NOW })
    globalThis.localStorage.setItem('maru.test.watches', '{"a":"soon","b":5}')
    expect(store.read()).toEqual({ b: 5 })
    globalThis.localStorage.setItem('maru.test.watches', 'not json')
    expect(store.read()).toEqual({})
    vi.unstubAllGlobals()
  })
})
