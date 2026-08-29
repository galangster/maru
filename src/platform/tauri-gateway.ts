// The GatewayRelay over Tauri. Adapters only, no logic — the same rule
// tauri.ts follows, and for the same reason: nothing in this file can run
// under Node, so nothing in it is unit-tested.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import type {
  AuthEvent,
  CloseEvent,
  FrameEvent,
  GatewayInfo,
  GatewayRelay,
} from '@/core/gateway-server'

/** Mirrors the event names in src-tauri/src/gateway.rs. */
const EVENT_AUTH = 'gateway://auth'
const EVENT_FRAME = 'gateway://frame'
const EVENT_CLOSE = 'gateway://close'

export class TauriGatewayRelay implements GatewayRelay {
  onAuth(cb: (event: AuthEvent) => void): Promise<() => void> {
    return listen<AuthEvent>(EVENT_AUTH, (event) => cb(event.payload))
  }

  onFrame(cb: (event: FrameEvent) => void): Promise<() => void> {
    return listen<FrameEvent>(EVENT_FRAME, (event) => cb(event.payload))
  }

  onClose(cb: (event: CloseEvent) => void): Promise<() => void> {
    return listen<CloseEvent>(EVENT_CLOSE, (event) => cb(event.payload))
  }

  authResult(
    connId: number,
    verdict: { accepted: boolean; agentId?: string; message?: string },
  ): Promise<void> {
    return invoke<void>('gateway_auth_result', {
      connId,
      accepted: verdict.accepted,
      agentId: verdict.agentId ?? null,
      message: verdict.message ?? null,
    })
  }

  reply(connId: number, frame: string): Promise<void> {
    return invoke<void>('gateway_reply', { connId, frame })
  }

  close(connId: number): Promise<void> {
    return invoke<void>('gateway_close', { connId })
  }

  info(): Promise<GatewayInfo> {
    return invoke<GatewayInfo>('gateway_info')
  }
}

export function createTauriGatewayRelay(): GatewayRelay {
  return new TauriGatewayRelay()
}
