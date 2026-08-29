import { useEffect } from 'react'

import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/features/shell/app-shell'
import { Composer } from '@/features/compose/composer'
import { ShortcutsOverlay } from '@/features/keyboard/shortcuts-overlay'
import { useShortcuts } from '@/features/keyboard/use-shortcuts'
import { useMailEvents, useSettings } from '@/features/mail/queries'
import { useNotifications } from '@/features/notifications/use-notifications'
import { Onboarding } from '@/features/onboarding/onboarding'
import { CommandPalette } from '@/features/palette/command-palette'
import { SettingsDialog } from '@/features/settings/settings-dialog'
import { useThemeEffect } from '@/features/shell/use-theme'
import { setSoundsEnabled } from '@/lib/sound'

import '@/features/shell/surfaces.css'

export default function App() {
  useThemeEffect()
  useMailEvents()
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

  // Every floating surface is a sibling of the shell, never a child of a pane:
  // glass mounts at the root so no ancestor can become its backdrop root
  // (DIRECTION §7).
  //
  // The tooltip provider shares one delay across every trigger below it, so
  // running along a toolbar shows the second tooltip immediately rather than
  // waiting again — `animations`' shared-delay rule.
  return (
    <TooltipProvider>
      <AppShell />
      <Composer />
      <CommandPalette />
      <SettingsDialog />
      <ShortcutsOverlay />
      <Onboarding />
    </TooltipProvider>
  )
}
