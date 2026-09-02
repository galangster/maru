// The push loop, with every native and network edge behind a port so the whole
// thing is testable in Node.
//
// Shape, from MARU-ACCOUNT.md §9: the device registers with APNs and reports
// its token to Maru sync; the CLIENT calls `users.watch` per Gmail account
// against the relay's topic and reports the expiration; the relay turns a
// Pub/Sub notification into a content-free `content-available: 1` push; this
// device wakes, fetches from Gmail itself, and composes what the person reads.

import type { MailEvent, MailView } from '../types'
import { badgeCount } from './badge'
import {
  describeApiError,
  describeTestResult,
  emptyPushDiagnostics,
  tokenPrefix,
  type PushDiagnostics,
  type PushTestResponse,
} from './diagnostics'
import { composeArrival } from './notification'
import type { PushEvent, PushPermission, PushPort } from './types'
import {
  GMAIL_PUSH_TOPIC,
  accountsDueForWatch,
  type WatchExpirations,
} from './watch'

/** The badge counts the unified inbox — the list the phone opens on. */
const BADGE_VIEW: MailView = { kind: 'unified', folder: 'inbox' }

export interface PushAccount {
  id: string
  email: string
}

/** The two Maru-sync calls push needs. Satisfied by `AccountClient`. */
export interface PushRelayClient {
  pushRegister(apnsToken: string | null): Promise<unknown>
  pushWatch(email: string, expiration: number): Promise<unknown>
  /** One visible alert push to this device's own registered token. §9. */
  pushTest(): Promise<PushTestResponse>
}

/** The MailService surface push needs. */
export interface PushMailService {
  listAccounts(): Promise<PushAccount[]>
  refresh(): Promise<void>
  unreadCount(view: MailView): Promise<number>
  onEvent(cb: (event: MailEvent) => void): () => void
  /**
   * Calls Gmail `users.watch` for one account and returns its expiration.
   * Optional: a build without it simply never arms a watch.
   */
  startPushWatch?(accountId: string, topic: string): Promise<{ expiration: number }>
}

/**
 * Where the watch expirations live between launches.
 *
 * Deliberately not the Maru vault: a watch belongs to a mailbox, not to a
 * device, but every device renews it independently and a renewal is
 * idempotent. Syncing the record would only add a conflict to resolve.
 */
export interface WatchStore {
  read(): WatchExpirations
  write(expirations: WatchExpirations): void
}

export interface PushRuntimeOptions {
  port: PushPort
  mail: PushMailService
  /**
   * The Maru account client, read on each use. A function rather than a value
   * because signing in and out is ordinary, and rebuilding the runtime for it
   * would close the plugin's event channel — the one thing holding the pushes
   * that arrived before the webview was ready.
   */
  relay: () => PushRelayClient | null
  watches: WatchStore
  /** Opens a thread. The tap on a notification lands here. */
  openThread?: (threadKey: string) => void
  onPermission?: (permission: PushPermission) => void
  /** Every change to what the phone can say about its own push state. */
  onDiagnostics?: (diagnostics: PushDiagnostics) => void
  now?: () => number
  log?: (message: string) => void
}

export class PushRuntime {
  private readonly opts: PushRuntimeOptions
  private readonly now: () => number
  private stopEvents: (() => void) | null = null
  private running = false
  /** The last token APNs gave us, registered with the relay or not. */
  private seenToken: string | null = null
  /** The last token the relay accepted. */
  private registeredToken: string | null = null
  private arrivals = 0
  private permission: PushPermission = 'unsupported'
  private diagnostics: PushDiagnostics = { ...emptyPushDiagnostics }
  /** The last count actually written to the app icon. */
  private lastBadge: number | null = null
  /** Notifications still being posted. A push waits for these. */
  private readonly announcing = new Set<Promise<void>>()
  /** Depth of the wakes in flight: while one is, it owns the badge write. */
  private pushes = 0
  /** The foreground pass in flight, so two events do not run two passes. */
  private foreground: Promise<void> | null = null

  constructor(opts: PushRuntimeOptions) {
    this.opts = opts
    this.now = opts.now ?? Date.now
  }

  /**
   * Off iOS, or with no Maru account, this resolves having done nothing. That
   * is the whole of the "no-op" contract — there is no second code path.
   */
  async start(): Promise<void> {
    if (this.running) return
    if (!this.opts.port.available) return
    this.running = true

    // Subscribed before anything else: arrivals from an ordinary poll deserve
    // the same notification as arrivals from a push, and on the phone this
    // runtime is the only thing that posts one.
    this.stopEvents = this.opts.mail.onEvent((event) => {
      if (event.type !== 'newMail') return
      this.arrivals += 1
      this.track(this.announce(event))
    })

    const status = await this.opts.port.start((event) => void this.onNativeEvent(event))
    this.setPermission(status.permission)
    if (status.token) await this.registerToken(status.token)
    await Promise.all([this.renewWatches(), this.syncBadge()])
  }

  stop(): void {
    this.stopEvents?.()
    this.stopEvents = null
    this.running = false
  }

  /** The Settings toggle. Registers with APNs the moment consent is given. */
  async requestPermission(): Promise<PushPermission> {
    if (!this.opts.port.available) return 'unsupported'
    const status = await this.opts.port.requestPermission()
    this.setPermission(status.permission)
    if (status.token) await this.registerToken(status.token)
    await this.renewWatches()
    return status.permission
  }

  async refreshPermission(): Promise<PushPermission> {
    if (!this.opts.port.available) return 'unsupported'
    const status = await this.opts.port.permissionState()
    this.setPermission(status.permission)
    return status.permission
  }

  /**
   * App open and every return to the foreground. Renewing here is what keeps a
   * phone that has been shut for a week from silently losing its watch.
   */
  async onForeground(): Promise<void> {
    if (!this.running) return
    // iOS raises `visibilitychange` and `focus` together on every return, and
    // two passes would mean two permission reads and two watch sweeps.
    this.foreground ??= this.runForeground().finally(() => {
      this.foreground = null
    })
    return this.foreground
  }

  private async runForeground(): Promise<void> {
    await this.refreshPermission()
    // `registerDevice` is here, and not only on the sign-in edge, because a
    // registration that never landed is otherwise permanent: the token arrives
    // once per launch, and if the Maru session had not hydrated from the
    // keychain by then there was no relay to send it to. Every return to the
    // app is a chance to notice, and it costs one call only while the device
    // is unregistered.
    await Promise.all([this.registerDevice(), this.renewWatches(), this.syncBadge()])
  }

  /**
   * A Maru account signed in. That unlocks exactly two things — the device
   * registration and the watches — so this does those and nothing else; the
   * permission and the badge did not change when the account did.
   */
  async onRelayAvailable(): Promise<void> {
    if (!this.running) return
    await Promise.all([this.registerDevice(), this.renewWatches()])
  }

  /**
   * Asks the relay to send this device one visible test push, and says what
   * came back. The APNs rejection reason is the answer people need — a token
   * the relay will not accept and a topic mismatch look identical from here
   * otherwise — and MARU-ACCOUNT.md §9 returns it in a 200 for exactly that.
   */
  async testPush(): Promise<string> {
    const relay = this.opts.relay()
    if (!relay) return 'Sign in to your Maru account first'
    try {
      return describeTestResult(await relay.pushTest())
    } catch (cause) {
      const text = describeApiError(cause)
      this.opts.log?.(`test push failed: ${text}`)
      return text
    }
  }

  /** What Settings shows. A copy, so a caller cannot edit the runtime's state. */
  pushDiagnostics(): PushDiagnostics {
    return { ...this.diagnostics }
  }

  /**
   * One content-free wake. The relay does not say which address changed and
   * never could — it is forbidden from logging one — so every account syncs.
   */
  async handlePush(id: string | null): Promise<void> {
    const before = this.arrivals
    let ok = false
    this.pushes += 1
    try {
      try {
        await this.opts.mail.refresh()
        ok = true
      } catch (cause) {
        this.opts.log?.(`push sync failed: ${String(cause)}`)
      }
      // The notification is what the wake is for. Telling iOS the work is done
      // before it is posted invites the process being suspended mid-post.
      await Promise.allSettled([...this.announcing])
    } finally {
      this.pushes -= 1
    }
    await this.syncBadge()
    // Answer iOS before renewing: the completion handler is on a clock and a
    // watch renewal is a network round trip that can wait for the next wake.
    if (id) {
      try {
        await this.opts.port.completePush(id, ok && this.arrivals > before)
      } catch (cause) {
        this.opts.log?.(`push completion failed: ${String(cause)}`)
      }
    }
    await this.renewWatches()
  }

  /**
   * Ask Gmail to watch every account whose watch has run down.
   *
   * Per account, and per account isolated: one mailbox that has lost its grant
   * must not stop the others being renewed.
   */
  async renewWatches(): Promise<void> {
    const relay = this.opts.relay()
    if (!relay || !this.opts.port.available) return
    if (this.permission !== 'granted') return
    const mail = this.opts.mail
    if (!mail.startPushWatch) return
    const accounts = await mail.listAccounts()
    const stored = this.opts.watches.read()
    const due = accountsDueForWatch(accounts, stored, this.now())
    if (due.length === 0) return
    const next: WatchExpirations = { ...stored }
    for (const account of due) {
      try {
        const { expiration } = await mail.startPushWatch(account.id, GMAIL_PUSH_TOPIC)
        await relay.pushWatch(account.email, expiration)
        next[account.email] = expiration
      } catch (cause) {
        this.opts.log?.(`watch for ${account.email} failed: ${String(cause)}`)
      }
    }
    this.opts.watches.write(next)
  }

  async syncBadge(): Promise<void> {
    if (!this.opts.port.available) return
    try {
      const count = badgeCount(await this.opts.mail.unreadCount(BADGE_VIEW))
      // The number on the icon is already right far more often than not, and
      // the write is a hop into the native side.
      if (count === this.lastBadge) return
      await this.opts.port.setBadgeCount(count)
      this.lastBadge = count
    } catch (cause) {
      this.opts.log?.(`badge update failed: ${String(cause)}`)
    }
  }

  private async onNativeEvent(event: PushEvent): Promise<void> {
    switch (event.event) {
      case 'pushToken':
        await this.registerToken(event.token)
        return
      case 'pushFailed':
        // APNs refuses for reasons the app cannot see any other way — a build
        // with no `aps-environment` entitlement is the loud one — and until
        // this reached the diagnostics it refused in silence.
        this.opts.log?.(`APNs registration failed: ${event.message}`)
        this.setDiagnostics({ registration: 'failed', lastError: `APNs: ${event.message}` })
        return
      case 'pushReceived':
        await this.handlePush(event.id)
        return
      case 'notificationOpened':
        this.opts.openThread?.(event.threadId)
        return
    }
  }

  private async registerToken(token: string): Promise<void> {
    this.seenToken = token
    this.setDiagnostics({ tokenPrefix: tokenPrefix(token) })
    // The relay keys devices by token, so re-sending an unchanged one is only
    // noise. A token does change — restore, reinstall — so this is not "once".
    if (token === this.registeredToken) return
    const relay = this.opts.relay()
    // No Maru session yet. The token is held in `seenToken` and `registerDevice`
    // sends it the moment there is somewhere to send it to.
    if (!relay) return
    try {
      await relay.pushRegister(token)
      this.registeredToken = token
      this.setDiagnostics({ registration: 'registered', lastError: null })
    } catch (cause) {
      // The HTTP status is the whole diagnosis here: 402 is an expired plan,
      // 401 a lapsed session, 0 a phone with no network.
      const text = describeApiError(cause)
      this.opts.log?.(`push registration failed: ${text}`)
      this.setDiagnostics({ registration: 'failed', lastError: text })
    }
  }

  /**
   * Sends the token APNs gave us, if the relay has not already accepted it.
   * Idempotent and cheap, which is what lets every edge that could have
   * unblocked a registration simply call it.
   */
  private async registerDevice(): Promise<void> {
    if (!this.seenToken || this.seenToken === this.registeredToken) return
    await this.registerToken(this.seenToken)
  }

  /** Keeps a notification in flight visible to `handlePush`. */
  private track(work: Promise<void>): void {
    this.announcing.add(work)
    void work.catch(() => {}).then(() => this.announcing.delete(work))
  }

  private async announce(event: Extract<MailEvent, { type: 'newMail' }>): Promise<void> {
    try {
      await this.opts.port.notify(composeArrival(event))
    } catch (cause) {
      this.opts.log?.(`notification failed: ${String(cause)}`)
    }
    // During a wake `handlePush` writes the badge once, after every arrival.
    if (this.pushes === 0) await this.syncBadge()
  }

  private setDiagnostics(patch: Partial<PushDiagnostics>): void {
    this.diagnostics = { ...this.diagnostics, ...patch }
    this.opts.onDiagnostics?.(this.pushDiagnostics())
  }

  private setPermission(permission: PushPermission): void {
    this.permission = permission
    this.opts.onPermission?.(permission)
  }
}

/**
 * The default store: `localStorage`, keyed per install.
 *
 * Small, device-local, and worthless to an attacker — an expiry timestamp per
 * address. It is not in SQLite because losing it costs one spare `users.watch`
 * call, and that is not worth a schema migration.
 */
export function localWatchStore(key = 'maru.push.watches'): WatchStore {
  return {
    read() {
      try {
        const raw = globalThis.localStorage?.getItem(key)
        if (!raw) return {}
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return {}
        const out: WatchExpirations = {}
        for (const [email, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'number' && Number.isFinite(value)) out[email] = value
        }
        return out
      } catch {
        return {}
      }
    },
    write(expirations) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(expirations))
      } catch {
        // A full or disabled store costs one extra watch call next launch.
      }
    },
  }
}
