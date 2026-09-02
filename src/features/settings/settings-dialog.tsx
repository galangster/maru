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
  FieldLabel,
  HueTile,
  IconButton,
  PRESS,
  PrimaryButton,
  SECTION_LABEL,
  SegmentedGroup,
  SurfaceHeader,
  TextField,
  textButtonClass,
} from '@/components/wren-controls'
import type { Account, Settings, SyncStatus } from '@/core/types'
import { AgentsSection } from '@/features/agents/agents-settings'
import { LATER_DISCLOSURE } from '@/features/list/later-picker'
import {
  useAccounts,
  useAccountsById,
  useSaveSettings,
  useSettings,
  useSyncStatus,
} from '@/features/mail/queries'
import { useMailMode, useMailService } from '@/features/mail/service'
import {
  focusThreadList,
  SETTINGS_SECTIONS,
  useSurfaces,
  type SettingsSection,
} from '@/features/shell/surface-store'
import { useUi, type ThemeChoice } from '@/features/mail/ui-store'
import { deviceNounFor } from '@/features/sidebar/sync-summary'
import { DEFAULT_SETTINGS } from '@/core/defaults'
import { syncKind } from '@/core/sync/failure'
import { elapsedTime } from '@/lib/format'
import { hueFor, type Hue } from '@/lib/hue'
import { setSoundsEnabled } from '@/lib/sound'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

import { copyText } from '@/lib/clipboard'
import {
  REPORT_SAFE_FIELDS,
  exportSettings,
  parseSettingsTransfer,
  transferDiff,
} from './transfer'
import { buildDebugReport } from '@/lib/debug-report'
import { openExternalUrl, platformOS } from '@/lib/env'
import { checkForUpdates } from '@/lib/updates'
import { AGENT_DISCLOSURE } from '@/features/agents/disclosure'
import pkg from '../../../package.json'
import { AccountSection } from './account/account-section'

const SECTION_ICONS: Record<SettingsSection, IconName> = {
  maru: 'sync',
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
  maru: 'magenta',
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
          Maru account, Gmail accounts, appearance, the Google API client, sync and version.
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
        // 176, not 160 — issue #28. At 160 the item's label box came to 91.0 px
        // after the nav's padding, the item's padding, the 28 px tile and the
        // 8 px gap, and "Maru account" needs 91.1: the first thing a person saw
        // on opening Settings was the product's own name with an ellipsis on
        // it. One step of the 4 px grid gives the label 108 px and every item
        // in the menu room to spare. The dialog is 680 and the body keeps 504.
        className="border-hairline flex w-44 shrink-0 flex-col gap-1 border-r p-2"
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
          {section === 'maru' && <AccountSection />}
          {section === 'accounts' && (
            <AccountsSection
              onNeedsClient={() => {
                setNeedsClient(true)
                openSettings('google')
              }}
            />
          )}
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

// -- accounts -----------------------------------------------------------------

function AccountsSection({ onNeedsClient }: { onNeedsClient: () => void }) {
  const service = useMailService()
  const { demo } = useMailMode()
  const accounts = useAccounts()
  const settings = useSettings()
  const openSettings = useSurfaces((s) => s.openSettings)
  const [busy, setBusy] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)

  const statuses = useSyncStatus()

  /**
   * `expectEmail` is set when this is a RE-LINK of a known account — the
   * "Sign in again" button beside a signed-out row. Google then pre-selects
   * that address, and the flow refuses a grant for anyone else rather than
   * storing the wrong mailbox's tokens under this row. An open "Add account"
   * passes nothing and behaves exactly as before.
   */
  const add = async (expectEmail?: string) => {
    if (!demo && !settings.data?.googleClientId) {
      onNeedsClient()
      return
    }
    setBusy(true)
    try {
      const known = new Set((accounts.data ?? []).map((a) => a.id))
      const account = await service.addAccount(expectEmail)
      // Same email again is a re-link (fresh tokens for an existing account,
      // the recovery path for an expired grant) — say that, not "added".
      const relinked = known.has(account.id)
      toast.success(
        demo ? 'Demo account added' : relinked ? `Reconnected ${account.email}` : `Added ${account.email}`,
      )
    } catch (cause) {
      toast.error('Could not add the account', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  const list = accounts.data ?? []

  const clearLocalData = async () => {
    setConfirmingClear(false)
    setClearing(true)
    try {
      for (const account of list) await service.removeAccount(account.id)
      toast.success(
        'Local Google data deleted. Mail, tokens and encryption keys are gone from this device.',
      )
    } catch (cause) {
      toast.error('Could not delete all local Google data', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Explainer>
        Maru shows every account in one list. Removing one takes its mail out of Maru; nothing at
        Google changes.
      </Explainer>

      {list.length === 0 ? (
        <p className="text-ink-3 text-sm">No accounts yet. Add one below to start.</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              status={statuses[account.id]}
              // "Sign in again" IS the add flow — same OAuth run, same busy
              // guard, same relink-aware toast — reaching it from the row
              // that needs it. It names the account, so Google pre-selects
              // that address and the flow refuses a grant for anyone else:
              // this button sits beside a specific row, so picking the wrong
              // one in the account chooser must not file that mailbox's
              // tokens under this row.
              onReauth={() => void add(account.email)}
              onNeedsClient={onNeedsClient}
              reauthBusy={busy}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <PrimaryButton onClick={() => void add()} disabled={busy} className="h-9 gap-2 px-3">
          <Icon
            name={busy ? 'sync' : 'add'}
            size={16}
            className={busy ? 'motion-safe:animate-spin' : ''}
          />
          {busy ? 'Waiting for Google…' : 'Add account'}
        </PrimaryButton>
        <p className="text-ink-3 text-sm text-pretty">{AGENT_DISCLOSURE}</p>
      </div>

      <div className="border-hairline flex flex-col gap-2 border-t pt-4">
        <p className={SECTION_LABEL}>Local data</p>
        <p className="text-ink-3 text-sm text-pretty">
          Removes every account's cached mail, tokens and encryption keys from this device. Nothing
          at Google changes.
        </p>
        <ConfirmPopover
          open={confirmingClear}
          onOpenChange={setConfirmingClear}
          title="Delete local Google data?"
          description="Removes every account's cached mail, tokens and encryption keys from this device. Nothing at Google changes."
          cancelLabel="Keep it"
          confirmLabel="Delete"
          onConfirm={() => void clearLocalData()}
          align="start"
          trigger={
            <button
              type="button"
              disabled={list.length === 0 || clearing}
              className={textButtonClass(
                'danger',
                'w-fit disabled:pointer-events-none disabled:opacity-40',
              )}
            />
          }
          triggerContent={clearing ? 'Deleting…' : 'Delete local Google data…'}
        />
        <div className="flex flex-wrap gap-x-1 gap-y-1">
          <button
            type="button"
            onClick={() => void openExternalUrl('https://getmaru.app/support/google-data')}
            className={textButtonClass('default')}
          >
            Deletion guide
          </button>
          <button
            type="button"
            onClick={() => void openExternalUrl('https://myaccount.google.com/permissions')}
            className={textButtonClass('default')}
          >
            Revoke Maru's Google access
          </button>
          <button
            type="button"
            onClick={() => openSettings('agents')}
            className={textButtonClass('default')}
          >
            Manage agents
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * What one account's row says, in every state — not just on failure. A healthy
 * account saying when it last synced is what makes a silent one legible by
 * contrast, which is the whole complaint this answers.
 *
 * A switch and not a ternary chain: the flat version had the "are we even
 * failing" test at nesting level four, after three arms that only made sense
 * if we were.
 */
function accountStatusLine(status: SyncStatus | undefined, now: number): string {
  // The two lines below that are about THIS machine take their noun from
  // `sync-summary.ts`, the same as the sidebar summary and the list's notice.
  // Written out here it was "this Mac" on an iPhone and on a PC (issue 52).
  const here = deviceNounFor(platformOS)
  switch (syncKind(status)) {
    case 'noClient':
      return `No Google client is configured on ${here} — add a client ID to connect it.`
    case 'rejected':
      return 'Google rejected the OAuth client — the account is fine. Set up your own client to reconnect.'
    case 'noCredentials':
      // NOT "signed out by Google" — Google did nothing. Says the reassuring
      // part explicitly, because the false version implies the account is in
      // trouble when only this machine is.
      return `Not signed in on ${here} — sign in to connect it. Nothing at Google changed.`
    case 'signedOut':
      return 'Signed out by Google — sign in again to reconnect.'
    case 'stalled':
      return status?.error ?? 'Sync failed'
    case 'syncing':
      return status?.progress !== undefined
        ? `Syncing… ${Math.round(status.progress * 100)}%`
        : 'Syncing…'
    default:
      return status?.lastSyncAt !== undefined
        ? `Last synced ${elapsedTime(status.lastSyncAt, now)}`
        : 'Not synced yet'
  }
}

function AccountRow({
  account,
  status,
  onReauth,
  onNeedsClient,
  reauthBusy,
}: {
  account: Account
  status: SyncStatus | undefined
  onReauth: () => void
  onNeedsClient: () => void
  reauthBusy: boolean
}) {
  const service = useMailService()
  const now = useNow()
  const [confirming, setConfirming] = useState(false)
  // `refresh()` refreshes every account, not this row's — a per-account
  // refresh is contract churn the seam has already declined once. The busy
  // flag is local so only the clicked row shows it.
  const [retrying, setRetrying] = useState(false)
  // One discriminant, shared with the sidebar and the list notice. Deriving
  // the booleans here independently is what let this row's `signedOut` be
  // true for a rejected client — wrong, and invisible only because a ternary
  // happened to test the other case first.
  const kind = syncKind(status)
  const failed = status?.state === 'error'
  const clientProblem = kind === 'rejected' || kind === 'noClient'
  const needsSignIn = kind === 'signedOut' || kind === 'noCredentials'

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
    // Unconditional, because a status line now renders in every state rather
    // than only on failure. Two height branches for one row was the kind of
    // thing that drifts.
    <li className="flex min-h-14 items-center gap-3 py-2">
      <AccountAvatar
        address={{ name: account.displayName, email: account.email }}
        hue={hueFor(account.email)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-ui text-ink truncate text-base font-medium">
          {account.displayName}
        </span>
        <span className="text-ink-3 truncate text-sm">{account.email}</span>
        {/* This is the row that answers "which ones aren't syncing", so it
            answers it in every state — a healthy account saying when it last
            synced is what makes a silent one legible by contrast. */}
        <span
          className={cn(
            'text-sm',
            // Every failure wraps; only the healthy one-liner truncates. The
            // row is min-h-14 and grows, and a message that explains what
            // broke is the last thing that should be cut — "Signed out by
            // Google — sign in aga…" spends its width on the half the button
            // beside it already says.
            failed ? 'text-destructive text-pretty' : 'text-ink-3 truncate',
          )}
        >
          {accountStatusLine(status, now)}
        </span>
      </div>
      {/* Three recoveries, three buttons. A rejected client is fixed in
          Settings → Google and a dead grant by signing in again — but an
          untyped error used to land on "Sign in again" too, which offers a
          browser round trip for a rate limit or a dropped connection it cannot
          touch. Those get "Try again" instead. */}
      {failed &&
        (clientProblem ? (
          <button
            type="button"
            onClick={onNeedsClient}
            className={textButtonClass('default', 'shrink-0 rounded-md')}
          >
            Use your own client
          </button>
        ) : needsSignIn ? (
          <button
            type="button"
            onClick={onReauth}
            disabled={reauthBusy}
            className={textButtonClass('default', 'shrink-0 rounded-md')}
          >
            Sign in again
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRetrying(true)
              void service
                .refresh()
                .catch(() => {})
                .finally(() => setRetrying(false))
            }}
            disabled={retrying}
            className={textButtonClass('default', 'shrink-0 rounded-md')}
          >
            Try again
          </button>
        ))}
      <ConfirmPopover
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${account.email}?`}
        description="Its mail leaves Maru and its tokens are deleted. Nothing at Google changes, and you can add it back."
        cancelLabel="Keep it"
        confirmLabel="Remove"
        onConfirm={() => void remove()}
        trigger={
          <button
            type="button"
            // Every account row says "Remove". Read out of context that is
            // two identical buttons; the label says which one.
            aria-label={`Remove ${account.email}`}
            // The kit's text-button recipe; rounded-md kept deliberately —
            // these sit inside list rows, not on an open surface.
            className={textButtonClass('danger', 'shrink-0 rounded-md')}
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
          System follows the desktop. Maru remembers whichever you pick, on this machine only.
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

      {/* Off by default — SOUNDS.md §3. Maru's most frequent cue is unsolicited
          and it is read in meetings and open offices, so the switch is opt-in
          rather than something to opt out of after it surprised someone once. */}
      <SoundsToggle
        on={sounds}
        onChange={(next) => {
          setSoundsEnabled(next)
          save.mutate({ sounds: next })
        }}
      />
      {/* On by default since 2026-08-31 (owner: "it's annoying to have to click
          this every time").
          The fallback READS THE DEFAULT rather than restating it, and the two
          fallbacks for this field are deliberately different questions. This
          one asks "what does the switch show before settings load?", whose only
          right answer is whatever defaults.ts says — hardcoding 'allow' here
          would have made DECISIONS.md's recorded reversal cost ("one word in
          defaults.ts") false on the day it was written. The reading pane asks
          "may I fetch, not yet knowing?", and answers with a policy literal of
          'block' that is independent of the default on purpose. */}
      <RemoteImagesToggle
        on={(settings.data?.imagePolicy ?? DEFAULT_SETTINGS.imagePolicy) === 'allow'}
        onChange={(next) => save.mutate({ imagePolicy: next ? 'allow' : 'block' })}
      />
    </div>
  )
}

function RemoteImagesToggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Switch id="wren-images" checked={on} onCheckedChange={onChange} />
        <label htmlFor="wren-images" className="font-ui text-ink cursor-pointer text-base">
          Load images in messages
        </label>
      </div>
      {/* Says what the mechanism does and nothing more. It must never read as
          "blocks trackers": an image declared too small to be a picture is
          dropped, and that is a narrow, honest claim. It cannot catch an
          undeclared 1x1, and it cannot catch a per-recipient URL on a real
          photograph — once a hero loads, the sender has been told. Widening
          this sentence would make the feature a lie without a line of code
          changing. */}
      <Explainer>
        Pictures come from the sender's server, so loading them tells the sender you opened the
        message. Turn this off and each message holds its images behind a Show button. Either way,
        Maru throws away images declared too small to be anything but a tracking pixel.
      </Explainer>
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
        Maru talks to Gmail with your own OAuth client, so your mail never passes through anyone
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
          className="font-ui text-brand-ink hover:text-brand-ink-hover focus-ring flex h-8 w-fit items-center gap-1 rounded-md text-base font-medium"
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
                after 7 days and Maru will ask you to sign in again. Publishing the app removes
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
        How often Maru asks Gmail for new mail. Shorter is fresher and costs more battery; Gmail's
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
      <LaterBlock />
      <TransferBlock />
    </div>
  )
}

/**
 * The Later disclosure in Settings — P21. Permanent, and it lives in Sync
 * because Sync is the section that answers "what does this Mac know that my
 * other devices do not", which is precisely the question Later raises.
 *
 * There is no switch here, deliberately: Later has no setting to turn off, and
 * a control would imply the limitation were one. The section states the fact
 * and the cost, once, where somebody looking for it would look.
 */
function LaterBlock() {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel htmlFor="wren-later">Later</FieldLabel>
      <p id="wren-later" className="text-ink-3 text-sm text-pretty">
        {LATER_DISCLOSURE} That is why Maru's inbox count and Gmail's will
        disagree by however many threads you have saved.
      </p>
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
  const service = useMailService()
  // One hook, not two: `useAccountsById` already calls `useAccounts` and hands
  // back both shapes. `selfEmails` is "every address the user owns,
  // lower-cased" — the exact set the import comparison needs, built once for
  // the whole app rather than a second time here.
  const { accounts, selfEmails } = useAccountsById()
  const setTheme = useUi((s) => s.setTheme)
  const [pasted, setPasted] = useState('')
  const [preview, setPreview] = useState<
    { patch: Partial<Settings>; accounts: string[] } | { error: string } | null
  >(null)
  // Addresses imported and not yet signed in on this device. In the UI store
  // rather than here, so closing Settings does not lose the queue — this
  // component unmounts with the dialog.
  const toConnect = useUi((s) => s.pendingAccounts)
  const setToConnect = useUi((s) => s.setPendingAccounts)
  const [connecting, setConnecting] = useState<string | null>(null)

  const here = new Set(selfEmails)

  const exportNow = async () => {
    if (!settings.data) return
    // Exported in their original case, not `selfEmails`: the comparison on
    // import folds case, but what travels should be what the person's own
    // provider calls them.
    const addresses = accounts.map((a) => a.email)
    const ok = await copyText(await exportSettings(settings.data, addresses))
    if (ok) {
      toast('Settings copied', {
        description:
          'Paste into Maru on your other device — Sync → Import. Carries your OAuth client and which addresses to sign in to; never tokens, agents or mail.',
      })
    } else {
      toast.error('Could not reach the clipboard')
    }
  }

  /**
   * Sign in to the imported addresses, one directed consent after another.
   *
   * Sequential rather than parallel, and that is not a limitation: each trip
   * is a browser window the person has to look at, and four at once is four
   * windows racing for the same loopback port. Each carries its address as
   * `expectEmail`, so Google pre-selects it and the flow refuses tokens that
   * come back for a different mailbox rather than filing them under this one.
   *
   * It stops at the first failure and keeps the rest queued. A cancelled
   * consent is the common case, not an error worth losing the list over.
   */
  const connectAll = async () => {
    for (const email of [...toConnect]) {
      setConnecting(email)
      try {
        await service.addAccount(email)
        // Read through the store rather than a stale closure: the loop is
        // async and `toConnect` above was captured before the first await.
        setToConnect(useUi.getState().pendingAccounts.filter((e) => e !== email))
      } catch (error) {
        setConnecting(null)
        toast.error(`Could not add ${email}`, {
          description: error instanceof Error ? error.message : undefined,
        })
        return
      }
    }
    setConnecting(null)
    toast.success('Accounts connected')
  }

  const inspect = async (text: string) => {
    setPasted(text)
    if (text.trim() === '') {
      setPreview(null)
      return
    }
    const parsed = await parseSettingsTransfer(text)
    setPreview(
      parsed.ok
        ? { patch: parsed.settings, accounts: parsed.accounts }
        : { error: parsed.reason },
    )
  }

  const apply = () => {
    if (!preview || 'error' in preview) return
    save.mutate(preview.patch)
    // Theme lives in two places on purpose (instant paint + persistence);
    // an import must move both, exactly as the Appearance picker does.
    if (preview.patch.theme) setTheme(preview.patch.theme)
    // The addresses outlive the paste AND the dialog — they are held in the UI
    // store. Only the ones this device does not already hold: re-consenting an
    // account that is already signed in here buys nothing.
    setToConnect(preview.accounts.filter((email) => !here.has(email)))
    toast.success('Settings imported')
    setPasted('')
    setPreview(null)
  }

  return (
    <div className="border-hairline flex flex-col gap-2 border-t pt-4">
      <p className={SECTION_LABEL}>This device</p>
      <Explainer>
        Move your setup to another Maru by clipboard: export here, paste into
        the other device's import. Your Google OAuth client and the LIST of
        addresses you use travel, so the other device knows which accounts to
        sign in to. Account tokens, agents, grants and mail never do — each
        device earns its own trust.
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
        const newHere = preview.accounts.filter((email) => !here.has(email))
        const nothing = rows.length === 0 && newHere.length === 0
        return (
        <div className="flex flex-col gap-2">
          {nothing ? (
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
              {/* Named separately from the settings rows, because it is a
                  different KIND of thing: a setting is applied, an address is
                  only ever offered. The count leads so the sentence is true
                  before it is read to the end. */}
              {newHere.length > 0 && (
                <li className="text-ink-2 text-sm">
                  <span className="text-ink font-medium">accounts</span>: {newHere.length} to sign
                  in to — {newHere.join(', ')}
                </li>
              )}
            </ul>
          )}
          {!nothing && (
            <PrimaryButton onClick={apply} className="h-8 w-fit px-4">
              Apply
            </PrimaryButton>
          )}
        </div>
        )
      })()}

      {/* The imported addresses, after the settings have landed. This is the
          whole of the "sign in once and it is all there" feeling that needs no
          server: the list is the part a person would otherwise have to
          remember, and each row is one directed consent rather than a picker
          they can get wrong. Tokens still never travel — every one of these is
          a fresh grant earned on this machine. */}
      {toConnect.length > 0 && (
        <div className="border-hairline mt-2 flex flex-col gap-2 border-t pt-3">
          <p className={SECTION_LABEL}>From your other device</p>
          <Explainer>
            {toConnect.length} account{toConnect.length === 1 ? '' : 's'} to sign in to. Maru asks
            Google for each one in turn and pre-selects the address, so you approve rather than
            choose. No compatible desktop token was available, so Google needs one approval per
            address.
          </Explainer>
          <ul className="flex flex-col gap-1">
            {toConnect.map((email) => (
              <li key={email} className="text-ink-2 flex items-center gap-2 text-sm">
                <span className="truncate">{email}</span>
                {connecting === email && <span className="text-ink-3 text-xs">signing in…</span>}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <PrimaryButton
              onClick={() => void connectAll()}
              disabled={connecting !== null}
              className="h-8 w-fit px-4"
            >
              {connecting ? 'Signing in…' : `Sign in to ${toConnect.length}`}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setToConnect([])}
              disabled={connecting !== null}
              className={textButtonClass('default', 'w-fit')}
            >
              Not now
            </button>
          </div>
        </div>
      )}
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
        <p className="font-ui text-ink text-xl font-semibold">Maru</p>
        <p className="text-ink-3 text-sm tabular-nums">Version {pkg.version}</p>
        <p className="text-ink-2 text-sm text-pretty">
          Mail stays local. Sync stores only encrypted account data.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Explainer>
          Something broke? The report below is how Maru asks for help without
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
