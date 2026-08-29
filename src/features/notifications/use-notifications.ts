// New-mail notifications, and the one interface sound that is allowed to reach
// a user who is not looking at the window.
//
// Rules, in order: never in a capture; never while the window has focus; and
// never a permission prompt in a browser — a web build that has not already
// been granted permission simply stays quiet.
//
// The sound and the OS toast share this one subscription because they answer
// the same event and want opposite things from it: the toast fires per thread
// and only when the window is unfocused, the sound fires once per arrival pass
// whether or not the window is focused.

import { useEffect, useRef } from 'react'

import type { Platform } from '@/core/platform'
import { useMailService, usePlatform } from '@/features/mail/service'
import { isScreenshot, isTauri } from '@/lib/env'
import { playSound } from '@/lib/sound'

/**
 * How long to wait before deciding how big an arrival was.
 *
 * `applyHistory()` emits one `newMail` event per new thread, so a five-message
 * batch is five synchronous events. The sound has to see the batch, not the
 * events: one pass is one cue, and a pass of more than three is silent
 * altogether (SOUNDS.md §3, MAGIC §4.4). 120 ms is long enough to collect a
 * pass and far shorter than the 30 s floor between two cues.
 */
const ARRIVAL_COALESCE_MS = 120

export function useNotifications(): void {
  const service = useMailService()
  // The app's own Platform, not a fresh one. Building a TauriPlatform per
  // toast threw away the permission answer it had already been given and
  // opened a second object holding a second SQLite handle.
  const platform = usePlatform()
  const arrival = useRef<{ count: number; timer: number | undefined }>({
    count: 0,
    timer: undefined,
  })

  useEffect(() => {
    if (isScreenshot) return

    let stopAction: (() => void) | undefined
    if (isTauri()) {
      void listenForClicks().then((stop) => {
        stopAction = stop
      })
    }

    const pending = arrival.current
    const queueArrivalSound = () => {
      pending.count += 1
      window.clearTimeout(pending.timer)
      pending.timer = window.setTimeout(() => {
        const batchSize = pending.count
        pending.count = 0
        playSound('newMail', { batchSize })
      }, ARRIVAL_COALESCE_MS)
    }

    const unsubscribe = service.onEvent((event) => {
      if (event.type !== 'newMail') return
      queueArrivalSound()
      if (document.hasFocus()) return
      void notify(platform, event.from, event.subject)
    })

    return () => {
      unsubscribe()
      window.clearTimeout(pending.timer)
      pending.count = 0
      stopAction?.()
    }
  }, [service, platform])
}

async function notify(platform: Platform | null, from: string, subject: string): Promise<void> {
  const body = subject || '(no subject)'
  if (platform) {
    await platform.notify(from, body)
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
