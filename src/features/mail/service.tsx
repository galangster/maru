// The one place the app decides which MailService it is talking to.
//
// In a Tauri window with no ?demo=1 that is the real Gmail-backed service; in
// a browser, or with ?demo=1, it is the in-memory demo service. Nothing
// downstream branches on the difference — except onboarding, which offers
// "Explore the demo" and needs a way to say so at runtime.

import { createContext, use, useCallback, useEffect, useState } from 'react'

import { createAgentGateway, createMailService } from '@/core'
import type { AgentGateway } from '@/core/agents'
import type { GatewayServer } from '@/core/gateway-server'
import type { Platform } from '@/core/platform'
import type { MailService } from '@/core/types'
import { isDemo, isMobileShell, isTauri, now, NOW } from '@/lib/env'

const ServiceContext = createContext<MailService | null>(null)
/**
 * The agent trust substrate — M1. A sibling of the mail service rather than a
 * member of it: the gateway *holds* a MailService (approving a queued send
 * dispatches through it), and putting it the other way round would make the
 * mail engine depend on a layer that did not exist when it was written.
 */
const AgentContext = createContext<AgentGateway | null>(null)
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
  agents: AgentGateway
  platform: Platform | null
}

export function MailServiceProvider({ children }: { children: React.ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [demoChosen, setDemoChosen] = useState(false)
  const demo = isDemo || demoChosen

  useEffect(() => {
    let alive = true
    let gatewayServer: GatewayServer | null = null
    let stopAccountSync: (() => void) | null = null
    void (async () => {
      try {
        const platform = !demo && isTauri() ? await loadTauriPlatform() : null
        const service = await createMailService(platform, { demo, now: NOW })
        const agents = await createAgentGateway(platform, { demo, now: NOW, mail: service })
        if (!alive) return
        setRuntime({ service, agents, platform })

        void (async () => {
          const [{ startAccountSync }, demoAccount] = await Promise.all([
            import('@/features/settings/account/account-store'),
            demo ? import('@/core/demo/account-demo') : Promise.resolve(null),
          ])
          if (!alive) return
          const stop = await startAccountSync({
            service,
            platform,
            demoBackend: demoAccount ? new demoAccount.DemoAccountBackend() : null,
          })
          if (alive) stopAccountSync = stop
          else stop()
        })().catch((cause) => console.error('Maru account sync did not start:', cause))

        // M2's socket. Additive on purpose: a gateway that cannot open must
        // not stop Maru being a mail client, so this failure is logged and
        // swallowed rather than raised into the error state above.
        if (isTauri() && !isMobileShell) {
          try {
            gatewayServer = await startGatewayServer(agents, service)
          } catch (cause) {
            console.error('The agent gateway did not start:', cause)
          }
          if (!alive) {
            void gatewayServer?.stop()
            gatewayServer = null
          }
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause : new Error(String(cause)))
      }
    })()
    return () => {
      alive = false
      stopAccountSync?.()
      void gatewayServer?.stop()
    }
  }, [demo])

  const switchToDemo = useCallback(() => {
    setRuntime(null)
    setDemoChosen(true)
  }, [])

  if (error) {
    return (
      <div className="text-ink-2 flex h-full items-center justify-center p-8 text-center text-base">
        Maru could not start: {error.message}
      </div>
    )
  }
  // A blank canvas beats a spinner for the ~0 ms the demo service takes, and
  // the real service shows the shell's own skeletons once it resolves.
  if (!runtime) return <div className="bg-canvas h-full" />

  return (
    <ModeContext value={{ demo, switchToDemo }}>
      <PlatformContext value={runtime.platform}>
        <ServiceContext value={runtime.service}>
          <AgentContext value={runtime.agents}>{children}</AgentContext>
        </ServiceContext>
      </PlatformContext>
    </ModeContext>
  )
}

async function loadTauriPlatform() {
  const { createTauriPlatform } = await import('@/platform/tauri')
  return createTauriPlatform()
}

/**
 * Opens the app's half of the agent gateway.
 *
 * Both halves are loaded lazily: the MCP SDK is a few hundred kilobytes that a
 * plain browser build has no listener for, and the relay cannot exist outside
 * a Tauri window at all.
 *
 * It runs in demo mode too. That is what makes the whole path testable before
 * a real account exists — Scout's fixture credential resolves against the
 * seeded in-memory store exactly as a real one resolves against SQLite.
 */
async function startGatewayServer(agents: AgentGateway, mail: MailService) {
  const [{ GatewayServer }, { createTauriGatewayRelay }] = await Promise.all([
    import('@/core/gateway-server'),
    import('@/platform/tauri-gateway'),
  ])
  const relay = createTauriGatewayRelay()
  const info = await relay.info()
  return GatewayServer.start({
    relay,
    gateway: agents,
    mail,
    appVersion: info.version,
    now,
  })
}

export function useMailService(): MailService {
  const service = use(ServiceContext)
  if (!service) throw new Error('useMailService must be used inside <MailServiceProvider>')
  return service
}

export function useAgentGateway(): AgentGateway {
  const gateway = use(AgentContext)
  if (!gateway) throw new Error('useAgentGateway must be used inside <MailServiceProvider>')
  return gateway
}

export function useMailMode(): MailMode {
  return use(ModeContext)
}

/** The app's Platform, or null in demo mode and in a plain browser. */
export function usePlatform(): Platform | null {
  return use(PlatformContext)
}
