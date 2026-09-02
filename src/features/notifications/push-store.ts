// What Settings needs to know about push, and the one control it offers.
//
// A store rather than context because the runtime that fills it is started
// once, at the root of the phone shell, and read from a settings row three
// screens away.

import { create } from 'zustand'

import type { PushPermission } from '@/core/push'

export interface PushUiState {
  /** False off iOS. The Notifications row is not drawn at all there. */
  available: boolean
  permission: PushPermission
  /** True while the system alert is up. */
  requesting: boolean
  /** Shows the system permission alert, once ever, then opens nothing. */
  requestPermission(): Promise<void>
}

const noRequest = async () => {}

export const usePushUi = create<PushUiState>(() => ({
  available: false,
  permission: 'unsupported',
  requesting: false,
  requestPermission: noRequest,
}))

export function setPushRequester(request: (() => Promise<void>) | null): void {
  usePushUi.setState({ requestPermission: request ?? noRequest })
}

export function setPushAvailable(available: boolean): void {
  usePushUi.setState({ available })
}

export function setPushPermission(permission: PushPermission): void {
  usePushUi.setState({ permission })
}

export function setPushRequesting(requesting: boolean): void {
  usePushUi.setState({ requesting })
}
