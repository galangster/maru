import { AppShell } from '@/features/shell/app-shell'
import { Composer } from '@/features/compose/composer'
import { ShortcutsOverlay } from '@/features/keyboard/shortcuts-overlay'
import { useShortcuts } from '@/features/keyboard/use-shortcuts'
import { useMailEvents } from '@/features/mail/queries'
import { useNotifications } from '@/features/notifications/use-notifications'
import { Onboarding } from '@/features/onboarding/onboarding'
import { CommandPalette } from '@/features/palette/command-palette'
import { SettingsDialog } from '@/features/settings/settings-dialog'
import { useThemeEffect } from '@/features/shell/use-theme'

import '@/features/shell/surfaces.css'

export default function App() {
  useThemeEffect()
  useMailEvents()
  useNotifications()
  useShortcuts()

  // Every floating surface is a sibling of the shell, never a child of a pane:
  // glass mounts at the root so no ancestor can become its backdrop root
  // (DIRECTION §7).
  return (
    <>
      <AppShell />
      <Composer />
      <CommandPalette />
      <SettingsDialog />
      <ShortcutsOverlay />
      <Onboarding />
    </>
  )
}
