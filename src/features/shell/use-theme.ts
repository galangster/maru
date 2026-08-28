// Theme: a class on <html>, sourced from MailService settings, overridable by
// ?theme= for captures, defaulting to the system preference.

import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { isScreenshot, themeOverride } from '@/lib/env'
import { useMailService } from '@/features/mail/service'
import { keys, useSettings } from '@/features/mail/queries'
import { useUi, type ThemeChoice } from '@/features/mail/ui-store'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  const override = themeOverride()
  if (override) return override
  if (choice === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return choice
}

/** Mount once at the root. Owns the `dark` and `screenshot` classes. */
export function useThemeEffect() {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const settings = useSettings()

  // The persisted choice wins on load unless ?theme= says otherwise.
  useEffect(() => {
    if (!settings.data) return
    if (themeOverride()) return
    setTheme(settings.data.theme)
  }, [settings.data, setTheme])

  useEffect(() => {
    const apply = () => {
      const root = document.documentElement
      root.classList.toggle('dark', resolveTheme(theme) === 'dark')
      root.classList.toggle('screenshot', isScreenshot)
    }
    apply()
    if (theme !== 'system' || themeOverride()) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

/** Cycles system → light → dark → system, and persists through MailService. */
export function useThemeToggle() {
  const service = useMailService()
  const client = useQueryClient()
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)

  const mutation = useMutation({
    mutationFn: (next: ThemeChoice) => service.setSettings({ theme: next }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.settings }),
  })

  const next: ThemeChoice = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
  return {
    theme,
    next,
    toggle: () => {
      setTheme(next)
      mutation.mutate(next)
    },
  }
}
