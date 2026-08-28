// New-mail notifications.
//
// Rules, in order: never in a capture; never while the window has focus; and
// never a permission prompt in a browser — a web build that has not already
// been granted permission simply stays quiet.

import { useEffect } from 'react'

import { useMailService } from '@/features/mail/service'
import { isScreenshot, isTauri } from '@/lib/env'

export function useNotifications(): void {
  const service = useMailService()

  useEffect(() => {
    if (isScreenshot) return

    let stopAction: (() => void) | undefined
    if (isTauri()) {
      void listenForClicks().then((stop) => {
        stopAction = stop
      })
    }

    const unsubscribe = service.onEvent((event) => {
      if (event.type !== 'newMail') return
      if (document.hasFocus()) return
      void notify(event.from, event.subject)
    })

    return () => {
      unsubscribe()
      stopAction?.()
    }
  }, [service])
}

async function notify(from: string, subject: string): Promise<void> {
  const body = subject || '(no subject)'
  if (isTauri()) {
    const { createTauriPlatform } = await import('@/platform/tauri')
    await createTauriPlatform().notify(from, body)
    return
  }
  // Browser: only if the user has already said yes somewhere else. Wren does
  // not ask, because a permission prompt is not a first impression.
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const notification = new Notification(from, { body })
  notification.onclick = () => window.focus()
}

/** Tauri: clicking the toast brings Wren forward. */
async function listenForClicks(): Promise<() => void> {
  const [{ onAction }, { getCurrentWindow }] = await Promise.all([
    import('@tauri-apps/plugin-notification'),
    import('@tauri-apps/api/window'),
  ])
  const listener = await onAction(() => {
    void getCurrentWindow().setFocus()
  })
  return () => listener.unregister()
}
