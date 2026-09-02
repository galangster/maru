// The shape of the native push seam. `src/platform/push.ts` implements it over
// the maru-push Tauri plugin on iOS and as a no-op everywhere else, so nothing
// above this line ever branches on the platform.

/** `prompt` means the system alert has not been shown yet. */
export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export interface PushStatus {
  permission: PushPermission
  /** The APNs device token, lowercase hex. Null until APNs answers. */
  token: string | null
}

export type PushEvent =
  | { event: 'pushToken'; token: string }
  | { event: 'pushFailed'; message: string }
  /** A content-free wake. `id` is the handle for its completion handler. */
  | { event: 'pushReceived'; id: string }
  | { event: 'notificationOpened'; threadId: string }

export interface PushNotification {
  title: string
  body: string
  /** Maru's thread key. Comes back as `notificationOpened` on a tap. */
  threadKey?: string
}

export interface PushPort {
  /** False off iOS, where every other method resolves and does nothing. */
  readonly available: boolean
  /** Opens the event stream and reports the standing permission and token. */
  start(onEvent: (event: PushEvent) => void): Promise<PushStatus>
  permissionState(): Promise<PushStatus>
  /** Shows the system alert if it has not been answered before. */
  requestPermission(): Promise<PushStatus>
  setBadgeCount(count: number): Promise<void>
  notify(notification: PushNotification): Promise<void>
  /**
   * Resolves the completion handler iOS gave us for one background push.
   * Late is worse than wrong here: an unanswered handler costs the app its
   * background time budget, so the native side caps the wait at 25 s.
   */
  completePush(id: string, newData: boolean): Promise<void>
}
