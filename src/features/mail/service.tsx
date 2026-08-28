// The one place the app decides which MailService it is talking to.
//
// In a Tauri window with no ?demo=1 that is the real Gmail-backed service; in
// a browser, or with ?demo=1, it is the in-memory demo service. Nothing
// downstream branches on the difference.

import { createContext, use, useEffect, useState } from 'react'

import { createMailService } from '@/core'
import type { MailService } from '@/core/types'
import { isDemo, isTauri, NOW } from '@/lib/env'

const ServiceContext = createContext<MailService | null>(null)

export function MailServiceProvider({ children }: { children: React.ReactNode }) {
  const [service, setService] = useState<MailService | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const platform = !isDemo && isTauri() ? await loadTauriPlatform() : null
        const created = await createMailService(platform, { demo: isDemo, now: NOW })
        if (alive) setService(created)
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause : new Error(String(cause)))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className="text-ink-2 flex h-full items-center justify-center p-8 text-center text-base">
        Wren could not start: {error.message}
      </div>
    )
  }
  // A blank canvas beats a spinner for the ~0 ms the demo service takes, and
  // the real service shows the shell's own skeletons once it resolves.
  if (!service) return <div className="bg-canvas h-full" />

  return <ServiceContext value={service}>{children}</ServiceContext>
}

async function loadTauriPlatform() {
  const { createTauriPlatform } = await import('@/platform/tauri')
  return createTauriPlatform()
}

export function useMailService(): MailService {
  const service = use(ServiceContext)
  if (!service) throw new Error('useMailService must be used inside <MailServiceProvider>')
  return service
}
