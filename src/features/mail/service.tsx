// The one place the app decides which MailService it is talking to.
//
// In a Tauri window with no ?demo=1 that is the real Gmail-backed service; in
// a browser, or with ?demo=1, it is the in-memory demo service. Nothing
// downstream branches on the difference — except onboarding, which offers
// "Explore the demo" and needs a way to say so at runtime.

import { createContext, use, useCallback, useEffect, useState } from 'react'

import { createMailService } from '@/core'
import type { Platform } from '@/core/platform'
import type { MailService } from '@/core/types'
import { isDemo, isTauri, NOW } from '@/lib/env'

const ServiceContext = createContext<MailService | null>(null)
/**
 * The one Platform the app owns, or null in demo mode. Notifications need it,
 * and building a second one per toast means a second SQLite handle waiting to
 * happen and a second permission probe.
 */
const PlatformContext = createContext<Platform | null>(null)

export interface MailMode {
  /** True when the app is running on fixtures, however it got there. */
  demo: boolean
  /** Onboarding's "Explore the demo". Session only; nothing is persisted. */
  switchToDemo: () => void
}

const ModeContext = createContext<MailMode>({ demo: isDemo, switchToDemo: () => {} })

interface Runtime {
  service: MailService
  platform: Platform | null
}

export function MailServiceProvider({ children }: { children: React.ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [demoChosen, setDemoChosen] = useState(false)
  const demo = isDemo || demoChosen

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const platform = !demo && isTauri() ? await loadTauriPlatform() : null
        const service = await createMailService(platform, { demo, now: NOW })
        if (alive) setRuntime({ service, platform })
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause : new Error(String(cause)))
      }
    })()
    return () => {
      alive = false
    }
  }, [demo])

  const switchToDemo = useCallback(() => {
    setRuntime(null)
    setDemoChosen(true)
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
  if (!runtime) return <div className="bg-canvas h-full" />

  return (
    <ModeContext value={{ demo, switchToDemo }}>
      <PlatformContext value={runtime.platform}>
        <ServiceContext value={runtime.service}>{children}</ServiceContext>
      </PlatformContext>
    </ModeContext>
  )
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

export function useMailMode(): MailMode {
  return use(ModeContext)
}

/** The app's Platform, or null in demo mode and in a plain browser. */
export function usePlatform(): Platform | null {
  return use(PlatformContext)
}
