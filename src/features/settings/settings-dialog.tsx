// Settings: a card with a slim left nav. Five sections, no tabs bar, no
// scrolling nav — the whole surface is decided once, here.
//
// It used to take `glass-strong`, and does not any more. Glass is now the
// command palette and the composer only (owner ruling, 2026-08-28): this is
// the largest floating surface in the app, it is opened deliberately and read
// carefully, and a ring plus the new lighter shadow separates it from the
// panes behind it without asking a 680×440 backdrop to re-rasterize.
//
// Each section carries one of the eight category hues as a 28 px tile — Amie's
// settings pattern, and the cheapest place in the app to buy personality
// (AMIE-STUDY §7b).

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { ConfirmPopover } from '@/components/confirm-popover'
import { Icon, type IconName } from '@/components/ui/icon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { AccountAvatar, HueTile, IconButton, PRESS, PrimaryButton } from '@/components/wren-controls'
import type { Account, Settings } from '@/core/types'
import { keys, useAccounts, useSettings } from '@/features/mail/queries'
import { useMailMode, useMailService } from '@/features/mail/service'
import {
  focusThreadList,
  SETTINGS_SECTIONS,
  useSurfaces,
  type SettingsSection,
} from '@/features/shell/surface-store'
import { useUi, type ThemeChoice } from '@/features/mail/ui-store'
import { hueFor, type Hue } from '@/lib/hue'
import { setSoundsEnabled } from '@/lib/sound'
import { cn } from '@/lib/utils'

import pkg from '../../../package.json'

const SECTION_ICONS: Record<SettingsSection, IconName> = {
  accounts: 'participants',
  appearance: 'themeSystem',
  google: 'key',
  sync: 'sync',
  about: 'about',
}

/**
 * One hue per section, assigned rather than hashed: these five are a fixed,
 * ordered set the user learns by position, so the colours are part of the
 * layout and must not move when a section is renamed.
 */
const SECTION_HUES: Record<SettingsSection, Hue> = {
  accounts: 'orange',
  appearance: 'violet',
  google: 'blue',
  sync: 'teal',
  about: 'magenta',
}

export function SettingsDialog() {
  const section = useSurfaces((s) => s.settings)
  const closeSettings = useSurfaces((s) => s.closeSettings)

  return (
    <Dialog
      open={section !== null}
      onOpenChange={(next) => {
        if (next) return
        closeSettings()
        focusThreadList()
      }}
    >
      <DialogContent
        showCloseButton={false}
        // A fixed height, deliberately: the sections are wildly different
        // lengths and a content-sized dialog would jump every time the nav is
        // used. 440 is the shortest height the tallest section still reads in.
        className="bg-raised rounded-2xl shadow-xl flex h-[440px] w-[680px] max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-0 p-0 ring-0 sm:max-w-[680px]"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Accounts, appearance, the Google API client, sync and version.
        </DialogDescription>
        {section && <SettingsBody section={section} />}
      </DialogContent>
    </Dialog>
  )
}

function SettingsBody({ section }: { section: SettingsSection }) {
  const openSettings = useSurfaces((s) => s.openSettings)
  const closeSettings = useSurfaces((s) => s.closeSettings)
  // Set when Add account bounced the user here for a missing client ID.
  const [needsClient, setNeedsClient] = useState(false)

  return (
    <>
      <nav
        aria-label="Settings sections"
        className="border-hairline flex w-40 shrink-0 flex-col gap-1 border-r p-2"
      >
        {SETTINGS_SECTIONS.map((item) => {
          const active = item.id === section
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openSettings(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                // Concentric: the dialog is 24 and the nav is `p-2`, so
                // DIRECTION §6's inner = outer − inset puts these items at 16.
                // The focus ring is a box-shadow and follows that corner on its
                // own, which is the whole point of the rule.
                'font-ui flex h-10 w-full items-center gap-2 rounded-inset px-2 text-base outline-none',
                'transition-[color,background-color,scale] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
                PRESS,
                'focus-ring',
                active ? 'bg-fill-selected text-ink font-medium' : 'text-ink-2 hover:bg-fill-hover',
              )}
            >
              <HueTile name={SECTION_ICONS[item.id]} hue={SECTION_HUES[item.id]} />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b pr-2 pl-6">
          <h2 className="font-ui text-ink min-w-0 flex-1 truncate text-base font-semibold">
            {SETTINGS_SECTIONS.find((s) => s.id === section)?.label}
          </h2>
          <IconButton
            name="close"
            label="Close settings"
            hint="esc"
            className="shrink-0"
            onClick={closeSettings}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {section === 'accounts' && <AccountsSection onNeedsClient={() => setNeedsClient(true)} />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'google' && <GoogleSection highlight={needsClient} />}
          {section === 'sync' && <SyncSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </>
  )
}

// -- shared bits --------------------------------------------------------------

function Explainer({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-3 text-sm text-pretty">{children}</p>
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    // The eyebrow — AMIE-STUDY §3. A field label is a word, so it takes the
    // caps half of the role as well as the weight and the tracking, exactly
    // like the grey labels above every field well in Amie's own sheets.
    <label htmlFor={htmlFor} className="font-ui text-ink-3 text-xs font-semibold uppercase">
      {children}
    </label>
  )
}

function TextField({
  id,
  label,
  value,
  onCommit,
  type = 'text',
  placeholder,
}: {
  id: string
  label: string
  value: string
  onCommit: (next: string) => void
  type?: 'text' | 'password'
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type={type}
        value={draft}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft !== value && onCommit(draft.trim())}
        className="bg-sunken text-ink placeholder:text-ink-3 focus-ring h-9 w-full rounded-sm px-3 text-base"
      />
    </div>
  )
}

function useSaveSettings() {
  const service = useMailService()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => service.setSettings(patch),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.settings }),
  })
}

// -- accounts -----------------------------------------------------------------

function AccountsSection({ onNeedsClient }: { onNeedsClient: () => void }) {
  const service = useMailService()
  const { demo } = useMailMode()
  const accounts = useAccounts()
  const settings = useSettings()
  const openSettings = useSurfaces((s) => s.openSettings)
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!demo && !settings.data?.googleClientId) {
      onNeedsClient()
      openSettings('google')
      return
    }
    setBusy(true)
    try {
      const account = await service.addAccount()
      toast.success(demo ? 'Demo account added' : `Added ${account.email}`)
    } catch (cause) {
      toast.error('Could not add the account', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  const list = accounts.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <Explainer>
        Wren shows every account in one list. Removing one takes its mail out of Wren; nothing at
        Google changes.
      </Explainer>

      {list.length === 0 ? (
        <p className="text-ink-3 text-sm">No accounts yet. Add one below to start.</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </ul>
      )}

      <div>
        <PrimaryButton onClick={() => void add()} disabled={busy} className="h-9 gap-2 px-3">
          <Icon
            name={busy ? 'sync' : 'add'}
            size={16}
            className={busy ? 'motion-safe:animate-spin' : ''}
          />
          {busy ? 'Waiting for Google…' : 'Add account'}
        </PrimaryButton>
      </div>
    </div>
  )
}

function AccountRow({ account }: { account: Account }) {
  const service = useMailService()
  const [confirming, setConfirming] = useState(false)

  const remove = async () => {
    setConfirming(false)
    try {
      await service.removeAccount(account.id)
      toast.success(`Removed ${account.email}`)
    } catch (cause) {
      toast.error('Could not remove the account', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  return (
    <li className="flex h-14 items-center gap-3">
      <AccountAvatar
        address={{ name: account.displayName, email: account.email }}
        hue={hueFor(account.email)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-ui text-ink truncate text-base font-medium">
          {account.displayName}
        </span>
        <span className="text-ink-3 truncate text-sm">{account.email}</span>
      </div>
      <ConfirmPopover
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${account.email}?`}
        description="Its mail leaves Wren and its tokens are deleted. Nothing at Google changes, and you can add it back."
        cancelLabel="Keep it"
        confirmLabel="Remove"
        onConfirm={() => void remove()}
        trigger={
          <button
            type="button"
            // Every account row says "Remove". Read out of context that is
            // two identical buttons; the label says which one.
            aria-label={`Remove ${account.email}`}
            className="font-ui text-ink-2 hover:bg-fill-hover hover:text-destructive focus-ring h-8 shrink-0 rounded-md px-3 text-base font-medium transition-colors duration-(--wren-dur-fast)"
          />
        }
        triggerContent="Remove"
      />
    </li>
  )
}

// -- appearance ---------------------------------------------------------------

const THEMES: { id: ThemeChoice; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'themeSystem' },
  { id: 'light', label: 'Light', icon: 'themeLight' },
  { id: 'dark', label: 'Dark', icon: 'themeDark' },
]

function AppearanceSection() {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const settings = useSettings()
  const save = useSaveSettings()
  const sounds = settings.data?.sounds ?? false

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Explainer>
          System follows the desktop. Wren remembers whichever you pick, on this machine only.
        </Explainer>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="bg-sunken inline-flex h-9 w-fit items-center gap-1 rounded-md p-1"
        >
          {THEMES.map((option) => {
            const active = option.id === theme
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTheme(option.id)
                  save.mutate({ theme: option.id })
                }}
                className={cn(
                  'font-ui inline-flex h-7 items-center gap-2 rounded-sm px-3 text-base outline-none',
                  'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
                  'focus-ring',
                  active ? 'bg-surface text-ink font-medium shadow-xs' : 'text-ink-2 hover:text-ink',
                )}
              >
                <Icon
                  name={option.icon}
                  size={16}
                  className={active ? 'text-brand' : 'text-ink-3'}
                />
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Off by default — SOUNDS.md §3. Wren's most frequent cue is unsolicited
          and it is read in meetings and open offices, so the switch is opt-in
          rather than something to opt out of after it surprised someone once. */}
      <SoundsToggle
        on={sounds}
        onChange={(next) => {
          setSoundsEnabled(next)
          save.mutate({ sounds: next })
        }}
      />
    </div>
  )
}

function SoundsToggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {/* The shared primitive, not a hand-rolled `role="switch"` button. The
          one that used to sit here re-derived the ARIA, the keyboard handling
          and the thumb geometry Base UI already gets right, and then never
          revisited them.
          `id` lands on the hidden input Switch owns rather than on the visible
          span, which is exactly what makes `htmlFor` work: pointer, Space,
          Enter and a click on the label all toggle, verified in the browser. */}
      <div className="flex items-center gap-3">
        <Switch id="wren-sounds" checked={on} onCheckedChange={onChange} />
        <label htmlFor="wren-sounds" className="font-ui text-ink cursor-pointer text-base">
          Interface sounds
        </label>
      </div>
      <Explainer>
        Six quiet cues — sending, new mail, archiving. Nothing is audible across a room, and
        nothing plays while your system asks for reduced motion.
      </Explainer>
    </div>
  )
}

// -- google api ---------------------------------------------------------------

const SETUP_STEPS = [
  'Create a project at console.cloud.google.com — any name will do.',
  'In APIs & Services → Library, enable the Gmail API for that project.',
  'In APIs & Services → OAuth consent screen, choose User type External, then add your own Gmail address under Test users.',
  'In Credentials → Create credentials → OAuth client ID, choose application type Desktop app.',
  'Copy the client ID and client secret Google shows you into the two fields above.',
  'Come back to Accounts, click Add account, and approve the Gmail scopes in the browser.',
]

function GoogleSection({ highlight }: { highlight: boolean }) {
  const settings = useSettings()
  const save = useSaveSettings()
  const openSettings = useSurfaces((s) => s.openSettings)
  const [guideOpen, setGuideOpen] = useState(highlight)

  const value = settings.data

  return (
    <div className="flex flex-col gap-4">
      <Explainer>
        Wren talks to Gmail with your own OAuth client, so your mail never passes through anyone
        else's server. It takes about five minutes to create one.
      </Explainer>

      {highlight && !value?.googleClientId && (
        <div className="bg-sunken text-ink-2 flex gap-3 rounded-sm px-3 py-2 text-sm">
          <Icon name="error" size={16} className="text-brand shrink-0" />
          <p className="text-pretty">
            Adding an account needs a client ID first. Paste one below, then go back to Accounts.
          </p>
        </div>
      )}

      <TextField
        id="wren-client-id"
        label="Client ID"
        placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
        value={value?.googleClientId ?? ''}
        onCommit={(googleClientId) => save.mutate({ googleClientId })}
      />
      <TextField
        id="wren-client-secret"
        label="Client secret"
        type="password"
        placeholder="GOCSPX-…"
        value={value?.googleClientSecret ?? ''}
        onCommit={(googleClientSecret) => save.mutate({ googleClientSecret })}
      />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          aria-expanded={guideOpen}
          className="font-ui text-brand hover:text-brand-hover focus-ring flex h-8 w-fit items-center gap-1 rounded-md text-base font-medium"
        >
          <Icon name={guideOpen ? 'chevronDown' : 'chevronRight'} size={16} />
          Setup guide
        </button>
        {guideOpen && (
          <ol className="text-ink-2 flex flex-col gap-2 text-sm">
            {SETUP_STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="text-ink-3 w-4 shrink-0 text-right tabular-nums">
                  {index + 1}.
                </span>
                <span className="text-pretty">{step}</span>
              </li>
            ))}
            <li className="text-ink-3 flex gap-3 text-xs">
              <span className="w-4 shrink-0" aria-hidden />
              <span className="text-pretty">
                While the consent screen stays in Testing status, Google expires the refresh token
                after 7 days and Wren will ask you to sign in again. Publishing the app removes
                that limit.
              </span>
            </li>
          </ol>
        )}
      </div>

      <button
        type="button"
        onClick={() => openSettings('accounts')}
        className="font-ui text-ink-2 hover:text-ink focus-ring h-8 w-fit rounded-md text-base font-medium"
      >
        Back to accounts
      </button>
    </div>
  )
}

// -- sync ---------------------------------------------------------------------

const INTERVALS: { value: string; label: string }[] = [
  { value: '30', label: 'Every 30 seconds' },
  { value: '60', label: 'Every minute' },
  { value: '120', label: 'Every 2 minutes' },
  { value: '300', label: 'Every 5 minutes' },
]

function SyncSection() {
  const settings = useSettings()
  const save = useSaveSettings()
  const current = String(settings.data?.pollIntervalSec ?? 60)

  return (
    <div className="flex flex-col gap-4">
      <Explainer>
        How often Wren asks Gmail for new mail. Shorter is fresher and costs more battery; Gmail's
        quota is generous either way.
      </Explainer>
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="wren-poll">Check for new mail</FieldLabel>
        <Select
          value={current}
          onValueChange={(next) => save.mutate({ pollIntervalSec: Number(next) })}
        >
          <SelectTrigger id="wren-poll" className="w-56">
            <SelectValue>
              {(value) => INTERVALS.find((i) => i.value === value)?.label ?? 'Every minute'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {INTERVALS.map((interval) => (
              <SelectItem key={interval.value} value={interval.value}>
                {interval.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// -- about --------------------------------------------------------------------

function AboutSection() {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-ui text-ink text-xl font-semibold">Wren</p>
      <p className="text-ink-3 text-sm tabular-nums">Version {pkg.version}</p>
      <p className="text-ink-2 text-sm text-pretty">Local-first. Talks only to Google.</p>
    </div>
  )
}
