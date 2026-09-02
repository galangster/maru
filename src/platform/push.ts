// The push port over the `maru-push` Tauri plugin. Deliberately thin, for the
// same reason src/platform/tauri.ts is: nothing in this file can run under
// Node, so nothing in it is unit-tested. Everything testable lives in
// src/core/push.

import { Channel, invoke } from '@tauri-apps/api/core'

import type { PushEvent, PushNotification, PushPort, PushStatus } from '@/core/push'
import { isTauri, platformOS } from '@/lib/env'

interface NativeStatus {
  permission: string
  token: string | null
}

function toStatus(native: NativeStatus): PushStatus {
  const permission =
    native.permission === 'granted' || native.permission === 'denied' ? native.permission : 'prompt'
  return { permission, token: native.token ?? null }
}

class TauriPushPort implements PushPort {
  readonly available = true

  /**
   * Held for the life of the process. The plugin buffers anything that fires
   * before this channel exists — an APNs wake can be what STARTS the process —
   * and flushes it the moment `start` lands, so a cold launch loses nothing.
   */
  private channel: Channel<PushEvent> | null = null
  private started: Promise<PushStatus> | null = null
  private listener: ((event: PushEvent) => void) | null = null

  /**
   * Opened once per process. A remount re-subscribes to the channel already
   * open rather than opening a second one: a second native `start` is a second
   * `registerForRemoteNotifications`, and the buffer flushes to whichever
   * channel is current — so the first one's events would be gone.
   */
  async start(onEvent: (event: PushEvent) => void): Promise<PushStatus> {
    this.listener = onEvent
    if (!this.started) {
      const channel = new Channel<PushEvent>()
      channel.onmessage = (event) => this.listener?.(event)
      this.channel = channel
      this.started = invoke<NativeStatus>('plugin:maru-push|start', { onEvent: channel })
        .then(toStatus)
        .catch((cause: unknown) => {
          this.channel = null
          this.started = null
          throw cause
        })
    }
    return this.started
  }

  async permissionState(): Promise<PushStatus> {
    return toStatus(await invoke<NativeStatus>('plugin:maru-push|permission_state'))
  }

  async requestPermission(): Promise<PushStatus> {
    return toStatus(await invoke<NativeStatus>('plugin:maru-push|request_permission'))
  }

  async setBadgeCount(count: number): Promise<void> {
    await invoke('plugin:maru-push|set_badge_count', { count })
  }

  async notify(notification: PushNotification): Promise<void> {
    await invoke('plugin:maru-push|schedule_local_notification', {
      title: notification.title,
      body: notification.body,
      threadId: notification.threadKey ?? null,
    })
  }

  async completePush(id: string, newData: boolean): Promise<void> {
    await invoke('plugin:maru-push|complete_push', { id, newData })
  }
}

/**
 * Everywhere that is not an iPhone. Desktop consumers of the relay come after
 * iOS ships (MARU-ACCOUNT.md §9), and a browser has no APNs at all — so this
 * answers `unsupported` and does nothing, rather than throwing into callers
 * that would then all need a platform check of their own.
 */
export function noopPushPort(): PushPort {
  return {
    available: false,
    async start() {
      return { permission: 'unsupported', token: null }
    },
    async permissionState() {
      return { permission: 'unsupported', token: null }
    },
    async requestPermission() {
      return { permission: 'unsupported', token: null }
    },
    async setBadgeCount() {},
    async notify() {},
    async completePush() {},
  }
}

let port: PushPort | null = null

/**
 * The one port for this process. Lazy because `platformOS` and `isTauri()` are
 * only answerable once the webview is up, and a singleton because the port owns
 * the plugin's event channel — two of them would mean two APNs registrations
 * and a buffer flushed to only one of the listeners.
 */
export function pushPort(): PushPort {
  port ??= platformOS !== 'ios' || !isTauri() ? noopPushPort() : new TauriPushPort()
  return port
}
