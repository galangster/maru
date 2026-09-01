import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'

import { TooltipProvider } from '@/components/ui/tooltip'
import { useAgentEvents } from '@/features/agents/queries'
import { AppShell } from '@/features/shell/app-shell'
import { useComposer } from '@/features/compose/compose-store'
import { ShortcutsOverlay } from '@/features/keyboard/shortcuts-overlay'
import { useShortcuts } from '@/features/keyboard/use-shortcuts'
import { useMailEvents, useSettings } from '@/features/mail/queries'
import { useNotifications } from '@/features/notifications/use-notifications'
import { Onboarding } from '@/features/onboarding/onboarding'
import { CommandPalette } from '@/features/palette/command-palette'
import { useSurfaces } from '@/features/shell/surface-store'
import { useThemeEffect } from '@/features/shell/use-theme'
import { setSoundsEnabled } from '@/lib/sound'
import { checkForUpdates } from '@/lib/updates'

// The heavy floating surfaces load on first open, not at startup (P8): the
// composer carries the whole tiptap editor, and settings/agents carry their
// own worlds. Each is latched — once opened it stays mounted forever, so
// close animations and in-dialog state survive exactly as they did eager.
const Composer = lazy(() =>
  import('@/features/compose/composer').then((m) => ({ default: m.Composer })),
)
const SettingsDialog = lazy(() =>
  import('@/features/settings/settings-dialog').then((m) => ({ default: m.SettingsDialog })),
)
const ApprovalQueue = lazy(() =>
  import('@/features/agents/approval-queue').then((m) => ({ default: m.ApprovalQueue })),
)
const AuditTimeline = lazy(() =>
  import('@/features/agents/audit-timeline').then((m) => ({ default: m.AuditTimeline })),
)

/** Render children from the first time `when` goes true, forever after. */
function Latch({ when, children }: { when: boolean; children: ReactNode }) {
  const [on, setOn] = useState(when)
  useEffect(() => {
    if (when) setOn(true)
  }, [when])
  return on ? <Suspense fallback={null}>{children}</Suspense> : null
}

import '@/features/shell/surfaces.css'

export default function App() {
  useThemeEffect()
  useMailEvents()
  useAgentEvents()
  useNotifications()
  useShortcuts()

  // The persisted switch drives the audio layer, which is a module rather than
  // a store: nothing renders on it, and a play call from an event handler must
  // not have to reach into React to find out whether it is allowed.
  //
  // This sets a flag and nothing else — no AudioContext, no decode. Mount is
  // not a user gesture, and lib/sound waits for one before it builds anything.
  const sounds = useSettings().data?.sounds ?? false
  useEffect(() => setSoundsEnabled(sounds), [sounds])

  // One silent update check per launch. Found updates toast with a consent
  // action; anything else stays quiet — About has the loud version.
  useEffect(() => {
    void checkForUpdates({ announceNoUpdate: false })
  }, [])

  // Every floating surface is a sibling of the shell, never a child of a pane:
  // glass mounts at the root so no ancestor can become its backdrop root
  // (DIRECTION §7).
  //
  // The tooltip provider shares one delay across every trigger below it, so
  // running along a toolbar shows the second tooltip immediately rather than
  // waiting again — `animations`' shared-delay rule.
  const composeOpen = useComposer((s) => s.open)
  const settingsOpen = useSurfaces((s) => s.settings !== null)
  const approvalsOpen = useSurfaces((s) => s.approvals)
  const auditOpen = useSurfaces((s) => s.audit !== null)

  return (
    <TooltipProvider>
        <AppShell />
        <Latch when={composeOpen}>
          <Composer />
        </Latch>
        <CommandPalette />
        <Latch when={settingsOpen}>
          <SettingsDialog />
        </Latch>
        <Latch when={approvalsOpen}>
          <ApprovalQueue />
        </Latch>
        <Latch when={auditOpen}>
          <AuditTimeline />
        </Latch>
        <ShortcutsOverlay />
        <Onboarding />
    </TooltipProvider>
  )
}
