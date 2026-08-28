// First run: real mode, no accounts. Two steps, no carousel.
//
// The card is glass-strong over the cloud-soft base — DIRECTION §7 lists
// onboarding cards as one of the two surfaces that earn the stronger recipe.

import { useEffect, useState } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'
import { CloudMark } from '@/features/list/empty-state'
import { useAccounts, useSettings } from '@/features/mail/queries'
import { useMailMode, useMailService } from '@/features/mail/service'
import { useSurfaces } from '@/features/shell/surface-store'
import { onboardingPreview } from '@/lib/env'
import { cn } from '@/lib/utils'

export function Onboarding() {
  const { demo, switchToDemo } = useMailMode()
  const accounts = useAccounts()
  const settingsOpen = useSurfaces((s) => s.settings !== null)
  const openSettings = useSurfaces((s) => s.openSettings)
  const setOnboarding = useSurfaces((s) => s.setOnboarding)
  const settings = useSettings()
  const service = useMailService()
  const [step, setStep] = useState<'welcome' | 'choose'>('welcome')

  const empty = accounts.isSuccess && (accounts.data?.length ?? 0) === 0
  const show = onboardingPreview || (!demo && empty)
  // Settings takes over the screen while it is open: onboarding waits rather
  // than stacking a third glass layer behind the dialog's scrim.
  const visible = show && !settingsOpen

  useEffect(() => {
    setOnboarding(visible)
    return () => setOnboarding(false)
  }, [visible, setOnboarding])

  if (!visible) return null

  const connect = () => openSettings(settings.data?.googleClientId ? 'accounts' : 'google')

  const explore = () => {
    if (demo) {
      // Already on fixtures (the preview flag). Adding the account is the
      // closest honest equivalent of "start looking around".
      void service.listAccounts()
      setOnboarding(false)
      return
    }
    switchToDemo()
  }

  return (
    <div className="bg-canvas fixed inset-0 z-50 flex items-center justify-center p-8">
      <div className="glass-strong flex w-[480px] max-w-full flex-col items-center gap-6 p-8">
        <CloudMark />

        {step === 'welcome' ? (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="font-ui text-ink text-xl font-semibold">Wren</h1>
              <p className="text-ink-2 max-w-72 text-sm text-pretty">
                One quiet window for every Gmail account you have. Nothing leaves this machine
                except what goes to Google.
              </p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setStep('choose')}
              className={cn(
                'font-ui bg-primary text-primary-foreground inline-flex h-9 items-center rounded-md px-4 text-base font-medium',
                'shadow-xs transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
                'hover:bg-brand-hover focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
              )}
            >
              Get started
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="font-ui text-ink text-xl font-semibold">Where would you like to start?</h1>
              <p className="text-ink-3 max-w-72 text-sm text-pretty">
                You can do the other one later. Nothing here is permanent.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <Choice
                icon="inbox"
                title="Connect Gmail"
                subtitle="Set up your own Google client, then sign in. About five minutes."
                onClick={connect}
                primary
              />
              <Choice
                icon="participants"
                title="Explore the demo"
                subtitle="Three fictional accounts, full of mail. Nothing is sent or stored."
                onClick={explore}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Choice({
  icon,
  title,
  subtitle,
  onClick,
  primary = false,
}: {
  icon: IconName
  title: string
  subtitle: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={primary}
      className={cn(
        'bg-surface flex w-full items-start gap-3 rounded-lg p-4 text-left shadow-xs outline-none',
        'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        'hover:bg-fill-hover focus-visible:ring-ring/50 focus-visible:ring-3',
      )}
    >
      <span className="flex w-(--wren-icon-box) shrink-0 items-center justify-center">
        <Icon name={icon} size={20} className={primary ? 'text-brand' : 'text-ink-3'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-ui text-ink text-base font-medium">{title}</span>
        <span className="text-ink-3 text-sm text-pretty">{subtitle}</span>
      </span>
    </button>
  )
}
