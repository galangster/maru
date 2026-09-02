// Starts the push runtime for the phone shell, and keeps it renewed.
//
// Everything interesting is in src/core/push; this file only decides when the
// runtime exists, hands it the three things it cannot reach on its own — the
// native port, the mail service, the Maru account client — and forwards a
// notification tap into the mobile router.

import { useEffect, useRef } from 'react'

import { PushRuntime, localWatchStore, type PushMailService } from '@/core/push'
import { useMailService } from '@/features/mail/service'
import {
  setPushAvailable,
  setPushPermission,
  setPushRequester,
  setPushRequesting,
} from '@/features/notifications/push-store'
import { useMaruAccount } from '@/features/settings/account/account-store'

/**
 * @param openThread Called with a Maru thread key when a notification is
 *   tapped. The phone routes it through the mobile reducer.
 */
export function usePush(openThread: (threadKey: string) => void): void {
  const service = useMailService()
  // The runtime outlives any single render, so the callback reaches it through
  // a ref: rebuilding the runtime to pick up a new closure would drop the
  // event channel and the plugin's buffered pushes with it.
  const openRef = useRef(openThread)
  openRef.current = openThread
  // Sign-in and sign-out are the two moments push starts and stops mattering,
  // but neither rebuilds the runtime — see the second effect below.
  const accountEmail = useMaruAccount((state) => state.email)
  const runtimeRef = useRef<PushRuntime | null>(null)

  useEffect(() => {
    let alive = true
    let runtime: PushRuntime | null = null
    let stopForeground: (() => void) | null = null

    void (async () => {
      const [{ createPushPort }, { accountRelayClient }] = await Promise.all([
        import('@/platform/push'),
        import('@/features/settings/account/account-store'),
      ])
      if (!alive) return
      const port = createPushPort()
      setPushAvailable(port.available)
      if (!port.available) return

      const mail: PushMailService = {
        listAccounts: () => service.listAccounts(),
        refresh: () => service.refresh(),
        unreadCount: (view) => service.unreadCount(view),
        onEvent: (cb) => service.onEvent(cb),
        startPushWatch: (accountId, topic) =>
          service.startPushWatch
            ? service.startPushWatch(accountId, topic)
            : Promise.reject(new Error('This build cannot watch a Gmail account')),
      }

      runtime = new PushRuntime({
        port,
        mail,
        relay: accountRelayClient,
        watches: localWatchStore(),
        openThread: (threadKey) => openRef.current(threadKey),
        onPermission: setPushPermission,
        log: (message) => console.warn(`[push] ${message}`),
      })

      setPushRequester(async () => {
        setPushRequesting(true)
        try {
          await runtime?.requestPermission()
        } finally {
          setPushRequesting(false)
        }
      })

      runtimeRef.current = runtime
      await runtime.start()
      if (!alive) {
        runtime.stop()
        return
      }

      // Coming back to the app is the cheapest place to notice a watch that
      // lapsed while the phone was shut, and the only place a permission
      // changed in iOS Settings can be seen.
      const onForeground = () => {
        if (document.visibilityState === 'visible') void runtime?.onForeground()
      }
      document.addEventListener('visibilitychange', onForeground)
      window.addEventListener('focus', onForeground)
      stopForeground = () => {
        document.removeEventListener('visibilitychange', onForeground)
        window.removeEventListener('focus', onForeground)
      }
    })().catch((cause) => console.error('Push did not start:', cause))

    return () => {
      alive = false
      stopForeground?.()
      setPushRequester(null)
      runtime?.stop()
      runtimeRef.current = null
    }
  }, [service])

  // Signing in is the moment a device can first be registered and a watch
  // first armed. It is not a reason to tear the runtime down: the plugin's
  // event channel is what holds the pushes that arrived before the webview
  // was ready, and closing it would drop them.
  useEffect(() => {
    if (!accountEmail) return
    void runtimeRef.current?.onForeground()
  }, [accountEmail])
}
