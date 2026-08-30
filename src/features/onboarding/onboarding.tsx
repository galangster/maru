// First run: real mode, no accounts. Two steps, no carousel.
//
// The card is an opaque raised surface with the ring-plus-shadow recipe. It
// used to be `glass-strong`; glass is the command palette and the composer
// only now (owner ruling, 2026-08-28), and there is nothing behind this card
// worth blurring anyway — it sits on an empty canvas over an app with no mail
// in it yet.

import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'

import { Icon, type IconName } from '@/components/ui/icon'
import { ICON_SLOT, PrimaryButton } from '@/components/wren-controls'
import { CloudMark } from '@/components/empty-state'
import { useAccounts, useSettings } from '@/features/mail/queries'
import { useMailMode, useMailService } from '@/features/mail/service'
import { useSurfaces } from '@/features/shell/surface-store'
import { onboardingPreview } from '@/lib/env'
import { sheetPreset, staggerPreset, useMotionMode } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { AGENT_DISCLOSURE } from '@/features/agents/disclosure'

export function Onboarding() {
  const { demo, switchToDemo } = useMailMode()
  const accounts = useAccounts()
  const settingsOpen = useSurfaces((s) => s.settings !== null)
  const openSettings = useSurfaces((s) => s.openSettings)
  const setOnboarding = useSurfaces((s) => s.setOnboarding)
  const settings = useSettings()
  const service = useMailService()
  const [step, setStep] = useState<'welcome' | 'choose'>('welcome')
  const mode = useMotionMode()
  const card = sheetPreset(mode)
  const { item, step: gap } = staggerPreset(mode)

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

  // One list per step, so the stagger is data-driven rather than four
  // hand-delayed blocks. `key` is the step, so moving from welcome to choose
  // replays the arrival instead of snapping.
  const rows: ReactNode[] =
    step === 'welcome'
      ? [
          <CloudMark key="mark" />,
          <div key="copy" className="flex flex-col items-center gap-2 text-center">
            <h1 className="font-ui text-ink text-xl font-semibold">Maru</h1>
            <p className="text-ink-2 max-w-72 text-sm text-pretty">
              One quiet window for every Gmail account you have. Nothing leaves this machine
              except what goes to Google.
            </p>
          </div>,
          <PrimaryButton key="start" autoFocus onClick={() => setStep('choose')} className="h-9 px-4">
            Get started
          </PrimaryButton>,
        ]
      : [
          <CloudMark key="mark" />,
          <div key="copy" className="flex flex-col items-center gap-2 text-center">
            <h1 className="font-ui text-ink text-xl font-semibold">
              Where would you like to start?
            </h1>
            <p className="text-ink-3 max-w-72 text-sm text-pretty">
              You can do the other one later.
            </p>
          </div>,
          // The two choices are a pair: 8 px apart inside one block, so the
          // card's 24 px rhythm never gets between them, and they arrive
          // together as one decision rather than as two options.
          <div key="choices" className="flex w-full flex-col gap-2">
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
              // It said "three fictional accounts", and the sidebar then shows
              // two. Both numbers are true of something — fixtures.ts seeds
              // two and holds a third that Add account brings in — so the copy
              // now says which is which.
              subtitle="Two fictional accounts, plus a third you can add. Nothing is sent or stored."
              onClick={explore}
            />
            <p className="text-ink-3 px-1 text-sm text-pretty">{AGENT_DISCLOSURE}</p>
          </div>,
        ]

  return (
    <div className="bg-canvas fixed inset-0 z-50 flex items-center justify-center p-8">
      <motion.div
        initial={card.initial}
        animate={card.animate}
        transition={card.transition}
        className="bg-raised rounded-2xl shadow-xl relative flex w-[480px] max-w-full flex-col items-center gap-6 p-8"
      >
        {rows.map((row, index) => (
          <motion.div
            key={`${step}:${index}`}
            initial={item.initial}
            animate={item.animate}
            transition={{ ...item.transition, delay: index * gap }}
            className="flex w-full flex-col items-center"
          >
            {row}
          </motion.div>
        ))}
      </motion.div>
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
        // Concentric: the card is 24 and carries `p-8`, so a choice inside it
        // could take anything up to 16. `rounded-lg` (14) is the card radius
        // and reads as a card sitting inside a card, which is what it is.
        'bg-surface flex w-full items-start gap-3 rounded-lg p-4 text-left shadow-xs outline-none',
        'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        'hover:bg-fill-hover focus-ring',
      )}
    >
      <span className={ICON_SLOT}>
        <Icon name={icon} size={20} className={primary ? 'text-brand' : 'text-ink-3'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-ui text-ink text-base font-medium">{title}</span>
        <span className="text-ink-3 text-sm text-pretty">{subtitle}</span>
      </span>
    </button>
  )
}
