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
import {
  AccountAvatar,
  HueTile,
  IconButton,
  PRESS,
  PrimaryButton,
  SECTION_LABEL,
  SegmentedGroup,
  SurfaceHeader,
  textButtonClass,
} from '@/components/wren-controls'
import type { Account, Settings } from '@/core/types'
import { AgentsSection } from '@/features/agents/agents-settings'
import { useAccounts, useSaveSettings, useSettings, useSyncStatus } from '@/features/mail/queries'
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

import { copyText } from '@/lib/clipboard'
import {
  REPORT_SAFE_FIELDS,
  exportSettings,
  parseSettingsTransfer,
  transferDiff,
} from './transfer'
import { buildDebugReport } from '@/lib/debug-report'
import { checkForUpdates } from '@/lib/updates'
import pkg from '../../../package.json'

const SECTION_ICONS: Record<SettingsSection, IconName> = {
  accounts: 'participants',
  // Permissions are controls, and `sliders` is the controls glyph. `key`
  // belongs to Google API and an agent credential is not what that section is
  // about, so the two never share a mark.
  agents: 'sliders',
  appearance: 'themeSystem',
  google: 'key',
  sync: 'sync',
  about: 'about',
}

/**
 * One hue per section, assigned rather than hashed: these are a fixed, ordered
 * set the user learns by position, so the colours are part of the layout and
 * must not move when a section is renamed.
 *
 * Agents took the one hue the set had left. Green also happens to be the
 * right one: it is what an agent's grants read as when they are working.
 */
const SECTION_HUES: Record<SettingsSection, Hue> = {
  accounts: 'orange',
  agents: 'green',
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
        // A floor and a ceiling, not a fixed height. 440 was chosen when the
        // tallest section was the Google guide; Agents arrived at a 708 px
        // content height in a 392 px well, so "New agent" and "Open the audit
        // log" both sat below the fold behind nothing but a scroll-fade, while
        // Appearance was still half air (UI-REVIEW-2026-08-29 S11, and N4 of
        // the prior cycle from the other direction). One number cannot serve
        // both. 440 keeps the short sections from collapsing into a strip, and
        // the viewport is the only ceiling: the height is content-driven, so a
        // taller screen buys the tallest section room rather than drawing a
        // larger empty box for every other one. Agents lands at 756 and fits.
        //
        // The cost is that switching sections can resize the card. That is the
        // jump the fixed height was bought to avoid, and it is the cheaper of
        // the two: it happens on a deliberate click, and it never hides a
        // control the way the fold did.
        className="bg-raised rounded-2xl shadow-xl flex max-h-[calc(100dvh-6rem)] min-h-[440px] w-[680px] max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-0 p-0 ring-0 sm:max-w-[680px]"
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
        <SurfaceHeader title={SETTINGS_SECTIONS.find((s) => s.id === section)?.label}>
          <IconButton
            name="close"
            label="Close settings"
            hint="esc"
            className="shrink-0"
            onClick={closeSettings}
          />
        </SurfaceHeader>

        {/* `scroll-fade`: the taller sections — the Google setup guide, and now
            Agents — run past the fixed 440, and a field sliced flat against the
            dialog's bottom edge is the hard edge DIRECTION §1 rules out. */}
        <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {section === 'accounts' && <AccountsSection onNeedsClient={() => setNeedsClient(true)} />}
          {section === 'agents' && <AgentsSection />}
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
    <label htmlFor={htmlFor} className={SECTION_LABEL}>
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
        <SegmentedGroup
          label="Theme"
          value={theme}
          options={THEMES}
          onChange={(id) => {
            setTheme(id)
            save.mutate({ theme: id })
          }}
        />
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
      <TransferBlock />
    </div>
  )
}

/**
 * The free half of G2: settings travel by clipboard, through any channel you
 * already trust between your own devices. Never tokens, never agents.
 */
function TransferBlock() {
  const settings = useSettings()
  const save = useSaveSettings()
  const setTheme = useUi((s) => s.setTheme)
  const [pasted, setPasted] = useState('')
  const [preview, setPreview] = useState<{ patch: Partial<Settings> } | { error: string } | null>(
    null,
  )

  const exportNow = async () => {
    if (!settings.data) return
    const ok = await copyText(await exportSettings(settings.data))
    if (ok) {
      toast('Settings copied', {
        description:
          'Paste into Wren on your other device — Sync → Import. Carries your OAuth client, never tokens or agents.',
      })
    } else {
      toast.error('Could not reach the clipboard')
    }
  }

  const inspect = async (text: string) => {
    setPasted(text)
    if (text.trim() === '') {
      setPreview(null)
      return
    }
    const parsed = await parseSettingsTransfer(text)
    setPreview(parsed.ok ? { patch: parsed.settings } : { error: parsed.reason })
  }

  const apply = () => {
    if (!preview || 'error' in preview) return
    save.mutate(preview.patch)
    // Theme lives in two places on purpose (instant paint + persistence);
    // an import must move both, exactly as the Appearance picker does.
    if (preview.patch.theme) setTheme(preview.patch.theme)
    toast.success('Settings imported')
    setPasted('')
    setPreview(null)
  }

  return (
    <div className="border-hairline flex flex-col gap-2 border-t pt-4">
      <p className={SECTION_LABEL}>This device</p>
      <Explainer>
        Move your settings to another Wren by clipboard: export here, paste into
        the other device's import. Your Google OAuth client travels; account
        tokens, agents and grants never do — each device earns its own trust.
      </Explainer>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void exportNow()}
          className={textButtonClass('default', 'w-fit')}
        >
          Copy settings export
        </button>
      </div>
      <textarea
        value={pasted}
        onChange={(event) => void inspect(event.target.value)}
        placeholder="Paste an export from another device to import it here"
        rows={3}
        spellCheck={false}
        aria-label="Paste a settings export"
        className="border-hairline text-ink placeholder:text-ink-3 focus-ring rounded-md border bg-transparent p-2 font-mono text-sm"
      />
      {preview && 'error' in preview && (
        <p className="text-destructive text-sm text-pretty">{preview.error}</p>
      )}
      {preview && 'patch' in preview && settings.data && (() => {
        const rows = transferDiff(settings.data, preview.patch)
        return (
        <div className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <p className="text-ink-3 text-sm">
              A valid export — and it matches this device already. Nothing to change.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((row) => (
                <li key={row.field} className="text-ink-2 text-sm tabular-nums">
                  <span className="text-ink font-medium">{row.field}</span>: {row.from} → {row.to}
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <PrimaryButton onClick={apply} className="h-8 w-fit px-4">
              Apply {rows.length} change{rows.length === 1 ? '' : 's'}
            </PrimaryButton>
          )}
        </div>
        )
      })()}
    </div>
  )
}

// -- about --------------------------------------------------------------------

function AboutSection() {
  const settings = useSettings()
  const accounts = useAccounts()
  const { demo } = useMailMode()
  const syncStatuses = useSyncStatus()

  const copyReport = async () => {
    const s = settings.data
    const report = buildDebugReport({
      version: pkg.version,
      mode: demo ? 'demo' : 'real',
      accountCount: accounts.data?.length ?? 0,
      // The transfer whitelist minus the OAuth pair — one list, so the
      // report and the export cannot drift apart about what is safe to name.
      settings: s
        ? Object.fromEntries(REPORT_SAFE_FIELDS.map((field) => [field, s[field]]))
        : {},
      syncStates: Object.values(syncStatuses).map((status) =>
        status.state === 'error' ? `error: ${status.error ?? 'unknown'}` : status.state,
      ),
      userAgent: navigator.userAgent,
    })
    if (await copyText(report)) {
      toast('Debug report copied', {
        description: 'Paste it into a GitHub issue. It names no addresses and no secrets.',
      })
    } else {
      toast.error('Could not reach the clipboard', {
        description: 'Select and copy from the console instead — the report was printed there.',
      })
      console.info(report)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-ui text-ink text-xl font-semibold">Wren</p>
        <p className="text-ink-3 text-sm tabular-nums">Version {pkg.version}</p>
        <p className="text-ink-2 text-sm text-pretty">Local-first. Talks only to Google.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Explainer>
          Something broke? The report below is how Wren asks for help without
          phoning home: versions, settings and recent errors, with addresses
          and secrets scrubbed before they ever reach the clipboard.
        </Explainer>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyReport()}
            className={textButtonClass('default', 'w-fit')}
          >
            Copy debug report
          </button>
          <button
            type="button"
            onClick={() => void checkForUpdates({ announceNoUpdate: true })}
            className={textButtonClass('default', 'w-fit')}
          >
            Check for updates
          </button>
        </div>
      </div>
    </div>
  )
}
