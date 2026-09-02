// What Settings needs to know about push, and the two controls it offers.
//
// A store rather than context because the runtime that fills it is started
// once, at the root of the phone shell, and read from a settings row three
// screens away.

import { create } from 'zustand'

import { emptyPushDiagnostics, type PushDiagnostics, type PushPermission } from '@/core/push'

export interface PushUiState extends PushDiagnostics {
  /** False off iOS. The Notifications row is not drawn at all there. */
  available: boolean
  permission: PushPermission
  /** True while the system alert is up. */
  requesting: boolean
  /** Shows the system permission alert, once ever, then opens nothing. */
  requestPermission(): Promise<void>
  /** True while the relay is being asked for a test push. */
  testing: boolean
  /** What the last test push did, in the words Settings shows. Null until one is sent. */
  lastTest: string | null
  /** Asks the relay to send this device one visible push. */
  sendTestPush(): Promise<void>
}

/** The requester while no runtime is up. */
export const noPushRequest = async (): Promise<void> => {}

export const usePushUi = create<PushUiState>(() => ({
  available: false,
  permission: 'unsupported',
  requesting: false,
  requestPermission: noPushRequest,
  ...emptyPushDiagnostics,
  testing: false,
  lastTest: null,
  sendTestPush: noPushRequest,
}))

/** The runtime's one way in. Every field is written through here. */
export function setPushUi(patch: Partial<PushUiState>): void {
  usePushUi.setState(patch)
}
