import { AppShell } from '@/features/shell/app-shell'
import { useShortcuts } from '@/features/keyboard/use-shortcuts'
import { useMailEvents } from '@/features/mail/queries'
import { useThemeEffect } from '@/features/shell/use-theme'

export default function App() {
  useThemeEffect()
  useMailEvents()
  useShortcuts()
  return <AppShell />
}
