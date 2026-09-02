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

  async start(onEvent: (event: PushEvent) => void): Promise<PushStatus> {
    const channel = new Channel<PushEvent>()
    channel.onmessage = onEvent
    this.channel = channel
    const native = await invoke<NativeStatus>('plugin:maru-push|start', { onEvent: channel })
    return toStatus(native)
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

export function createPushPort(): PushPort {
  if (platformOS !== 'ios' || !isTauri()) return noopPushPort()
  return new TauriPushPort()
}
