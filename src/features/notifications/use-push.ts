// Starts the push runtime for the phone shell, and keeps it renewed.
//
// Everything interesting is in src/core/push; this file only decides when the
// runtime exists, hands it the three things it cannot reach on its own — the
// native port, the mail service, the Maru account client — and forwards a
// notification tap into the mobile router.

import { useEffect, useRef } from 'react'

import { PushRuntime, localWatchStore } from '@/core/push'
import { useMailService } from '@/features/mail/service'
import { noPushRequest, setPushUi } from '@/features/notifications/push-store'
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
  const runtimeRef = useRef<PushRuntime | null>(null)

  useEffect(() => {
    let alive = true
    let stopForeground: (() => void) | null = null
    let stopAccount: (() => void) | null = null

    void (async () => {
      const [{ pushPort }, { accountRelayClient }] = await Promise.all([
        import('@/platform/push'),
        import('@/features/settings/account/account-store'),
      ])
      if (!alive) return
      const port = pushPort()
      setPushUi({ available: port.available })
      if (!port.available) return

      runtimeRef.current = new PushRuntime({
        port,
        // The mail service already is the surface push needs. `startPushWatch`
        // is optional on both sides, which is how a build that cannot call
        // Gmail's `users.watch` passes through here unremarked.
        mail: service,
        relay: accountRelayClient,
        watches: localWatchStore(),
        openThread: (threadKey) => openRef.current(threadKey),
        onPermission: (permission) => setPushUi({ permission }),
        onDiagnostics: setPushUi,
        log: (message) => console.warn(`[push] ${message}`),
      })

      setPushUi({
        requestPermission: async () => {
          setPushUi({ requesting: true })
          try {
            await runtimeRef.current?.requestPermission()
          } finally {
            setPushUi({ requesting: false })
          }
        },
        sendTestPush: async () => {
          setPushUi({ testing: true })
          try {
            setPushUi({ lastTest: (await runtimeRef.current?.testPush()) ?? null })
          } finally {
            setPushUi({ testing: false })
          }
        },
      })

      await runtimeRef.current.start()
      if (!alive) {
        runtimeRef.current?.stop()
        runtimeRef.current = null
        return
      }

      // Signing in is the moment a device can first be registered and a watch
      // first armed. It is not a reason to tear the runtime down: the plugin's
      // event channel is what holds the pushes that arrived before the webview
      // was ready, and closing it would drop them. Subscribed after `start`,
      // so a sign-in can never land on a runtime that does not exist yet;
      // `start` itself covers an account that hydrated before this point.
      stopAccount = useMaruAccount.subscribe((state, previous) => {
        if (state.email && state.email !== previous.email) void runtimeRef.current?.onRelayAvailable()
      })

      // Coming back to the app is the cheapest place to notice a watch that
      // lapsed while the phone was shut, and the only place a permission
      // changed in iOS Settings can be seen. iOS raises both of these events
      // on one return; the runtime collapses them into a single pass.
      const onForeground = () => {
        if (document.visibilityState === 'visible') void runtimeRef.current?.onForeground()
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
      stopAccount?.()
      setPushUi({ requestPermission: noPushRequest, sendTestPush: noPushRequest })
      runtimeRef.current?.stop()
      runtimeRef.current = null
    }
  }, [service])
}
