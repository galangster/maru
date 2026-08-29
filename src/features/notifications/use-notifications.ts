// New-mail notifications, an agent asking to send, and the one interface sound
// that is allowed to reach a user who is not looking at the window.
//
// Rules, in order: never in a capture; never while the window has focus; and
// never a permission prompt in a browser — a web build that has not already
// been granted permission simply stays quiet.
//
// The sound and the OS toast share this one subscription because they answer
// the same event: one arrival pass is one cue and one notification. The sound
// plays whether or not the window has focus; the notification only when it
// does not.

import { useEffect } from 'react'

import { describeDraft } from '@/core/agents'
import type { Platform } from '@/core/platform'
import { useAgentGateway, useMailService, usePlatform } from '@/features/mail/service'
import { isScreenshot, isTauri } from '@/lib/env'
import { playSound } from '@/lib/sound'

export function useNotifications(): void {
  const service = useMailService()
  const agents = useAgentGateway()
  // The app's own Platform, not a fresh one. Building a TauriPlatform per
  // toast threw away the permission answer it had already been given and
  // opened a second object holding a second SQLite handle.
  const platform = usePlatform()

  /**
   * An agent asking to send. It takes the same path and the same guards as new
   * mail — including "not while the window has focus", because the sidebar
   * badge is already saying it on screen and a second announcement of a thing
   * you can see is noise.
   *
   * No sound. `newMail` is the only cue Wren is willing to make while nobody
   * is looking (SOUNDS.md §3), and an approval is not more urgent than mail —
   * it is a request that will still be there in the morning.
   */
  useEffect(() => {
    if (isScreenshot) return
    return agents.onEvent((event) => {
      if (event.type === 'agentFirstConnected') {
        // The one connection worth a ping: a fresh credential's first use is
        // when a copied one would show itself (M10). Deliberately NOT behind
        // the focus guard the other notifications honor — a security moment
        // fires even while the person is looking at Wren, because the window
        // being focused says nothing about who ran the agent.
        void notify(
          platform,
          `${event.agentName} connected for the first time`,
          'Its credential is now in use. Review what it holds in Settings → Agents.',
        )
        return
      }
      if (event.type !== 'approvalPending') return
      if (document.hasFocus()) return
      void notify(platform, `${event.agentName} wants to send`, describeDraft(event.approval.payload))
    })
  }, [agents, platform])

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
      // The event *is* the pass — `event.threads` is how many arrived. This
      // used to be one event per thread, re-collected here behind a 120 ms
      // timer that had to be long enough for a batch and short enough not to
      // lag the cue; the emitter knew the answer all along (SOUNDS.md §3,
      // MAGIC §4.4: one pass is one cue, and a pass over three is silent).
      playSound('newMail', { batchSize: event.threads })
      if (document.hasFocus()) return
      void notify(platform, event.from, arrivalBody(event.subject, event.threads))
    })

    return () => {
      unsubscribe()
      stopAction?.()
    }
  }, [service, platform])
}

/** One notification for the pass, so five arrivals are not five toasts. */
function arrivalBody(subject: string, threads: number): string {
  const lead = subject || '(no subject)'
  return threads > 1 ? `${lead} — and ${threads - 1} more` : lead
}

async function notify(platform: Platform | null, from: string, body: string): Promise<void> {
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
  // onAction is mobile-only: on desktop the register_listener command does
  // not exist and the call rejects. Fall back to the OS default click.
  try {
    const [{ onAction }, { getCurrentWindow }] = await Promise.all([
      import('@tauri-apps/plugin-notification'),
      import('@tauri-apps/api/window'),
    ])
    const listener = await onAction(() => {
      void getCurrentWindow().setFocus()
    })
    return () => listener.unregister()
  } catch {
    return () => {}
  }
}
