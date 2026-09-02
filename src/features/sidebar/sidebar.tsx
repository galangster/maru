// The navigation pane: compose, the unified folders, one section per account,
// and a footer that says what the app is currently doing.
//
// Selection is a soft fill plus an accent-tinted icon. Never a left bar —
// DIRECTION §2 (Juicebox) and §10.2.

import { useEffect, useRef } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'
import { Tooltip, TooltipContent, TooltipHint, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AccountDot,
  IconButton,
  PRESS,
  PrimaryButton,
  SECTION_LABEL,
} from '@/components/wren-controls'
import { FOLDERS, FOLDER_BY_LABEL } from '@/core/defaults'
import type { Account, MailView } from '@/core/types'
import { usePendingApprovals } from '@/features/agents/queries'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import {
  useAccounts,
  useDeferredCount,
  useLabels,
  useSyncStatus,
  useUnreadCount,
} from '@/features/mail/queries'
import { useMailMode } from '@/features/mail/service'
import { useUi, viewKey } from '@/features/mail/ui-store'
import { SHELL_CARD } from '@/features/shell/app-shell'
import { useSurfaces, type SettingsSection } from '@/features/shell/surface-store'
import { useThemeToggle } from '@/features/shell/use-theme'
import { describeSync, isUrgent, type SyncSummary } from '@/features/sidebar/sync-summary'
import { syncPreview } from '@/lib/env'
import { hueFor, hueSolid, type Hue } from '@/lib/hue'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

/** The row chrome both sidebar disclosure headers share; typography differs
 *  (caps for the word "Accounts", not for an email address). */
const DISCLOSURE_ROW =
  'rounded-row flex h-8 w-full items-center gap-2 px-2 outline-none ' +
  'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out) ' +
  'hover:bg-fill-hover hover:text-ink-2 focus-ring'

/** The order the per-account label tree puts the system labels in. */
const SYSTEM_ORDER = FOLDERS.map((f) => f.label)

const INBOX_VIEW: MailView = { kind: 'unified', folder: 'inbox' }
const LATER_VIEW: MailView = { kind: 'later' }

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const accounts = useAccounts()
  // Only the inbox shows a count, so only the inbox is subscribed to one. The
  // sidebar used to run a countUnread query per folder and render one of them.
  const inboxUnread = useUnreadCount(INBOX_VIEW).data ?? 0
  // Threads WAITING in Later, which is a different question from unread and
  // therefore a different query. Its own method rather than the length of the
  // Later list, because that list is capped at a page.
  const laterCount = useDeferredCount().data ?? 0

  return (
      <nav aria-label="Mailboxes" className={SHELL_CARD}>
        {/* The card's top band, on EVERY platform AND in both states. On macOS
            the three lights land on it (x 16..68, y 16..28) with a symmetric
            8 px of card above and to the left of the red circle; everywhere
            else it is simply empty card. It puts the compose button at y=52,
            level with both pane headers' `border-b`, and it keeps the browser
            captures showing the real production geometry.

            Collapsed used to DROP the card below the lights instead, leaving
            an L-shaped notch of ground at the top-left with a hard edge under
            the lights and another against the list pane — "a hard cut off with
            the white part" (owner, 2026-08-31). The card now runs full height
            in both states and the collapsed rail is simply wide enough to seat
            the lights, so there is one geometry and no notch. A childless div
            carrying a bare drag attribute is always `composedPath()[0]`, so it
            drags on mousedown and zooms on double-click; in a browser the
            attribute is inert. */}
        <div data-tauri-drag-region aria-hidden className="h-(--wren-card-band) shrink-0" />
        {/* `justify-center` matters only when collapsed, and it is not
            cosmetic: expanded, Compose is `w-full` and centring is a no-op;
            collapsed it is a 36 px circle in a 52 px content box, and without
            this it sits at the flex start while every NavRow below is `w-full`
            with its glyph centred — the button lands 8 px left of the column
            it heads (owner, 2026-08-31). The offset existed at the old 56 px
            rail too, at 2 px, which is small enough to read as a rendering
            artefact rather than a mistake. */}
        <div className="flex shrink-0 justify-center px-2 pb-3">
          <ComposeButton collapsed={collapsed} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <ul className="flex flex-col gap-1">
            {FOLDERS.map((item) => (
              <NavRow
                key={item.folder}
                view={{ kind: 'unified', folder: item.folder }}
                label={item.name}
                icon={item.icon}
                collapsed={collapsed}
                count={
                  item.folder === 'inbox' && inboxUnread > 0
                    ? { value: inboxUnread, noun: 'unread' }
                    : undefined
                }
              />
            ))}
            {/* Later — BELOW the FOLDERS.map, not inside it. `FOLDERS` is the
                Gmail-system-label table and Later is not one; a fake entry
                there would break `viewLabel` and `viewClause` and would put a
                synthetic string where the type says a Gmail label id goes.
                `SYSTEM_ORDER` is untouched for the same reason.

                The count is threads WAITING, not unread ones — Later's question
                is "how much did I put off", and it is the only number in the
                sidebar that is not an unread count. */}
            <NavRow
              view={LATER_VIEW}
              label="Later"
              icon="calendar"
              collapsed={collapsed}
              count={laterCount > 0 ? { value: laterCount, noun: 'waiting' } : undefined}
            />
          </ul>

          {/* Collapsed, the accounts are one group of jump targets, so they sit
              in one list at the group's own rhythm. Expanded, each is a section
              with its own label tree. */}
          {collapsed ? (
            <ul className="mt-6 flex flex-col gap-1">
              {(accounts.data ?? []).map((account) => (
                <NavRow
                  key={account.id}
                  view={{ kind: 'account', accountId: account.id, labelId: 'INBOX' }}
                  label={`Inbox — ${account.email}`}
                  hue={hueFor(account.email)}
                  collapsed
                />
              ))}
            </ul>
          ) : (
            <AccountsGroup accounts={accounts.data ?? []} />
          )}
        </div>

        <SidebarFooter collapsed={collapsed} accounts={accounts.data ?? []} />
      </nav>
  )
}

function ComposeButton({ collapsed }: { collapsed: boolean }) {
  const { compose } = useComposeActions()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <PrimaryButton
            onClick={compose}
            // The label has to survive the collapse: in the 40 px content box
            // the word goes away and a tooltip alone is not an accessible name.
            aria-label="Compose"
            className={cn('h-9', collapsed ? 'w-9' : 'w-full gap-2')}
          />
        }
      >
        <Icon name="compose" size={collapsed ? 18 : 16} />
        {!collapsed && 'Compose'}
      </TooltipTrigger>
      <TooltipContent>
        <span>Compose</span>
        <TooltipHint>C</TooltipHint>
      </TooltipContent>
    </Tooltip>
  )
}

function NavRow({
  view,
  label,
  icon,
  collapsed,
  count,
  indent = false,
  hue,
}: {
  view: MailView
  label: string
  icon?: IconName
  collapsed: boolean
  /**
   * The row's number, and the word that makes it mean something.
   *
   * The noun is not decoration: the Inbox's number is threads UNREAD and
   * Later's is threads WAITING, and a screen reader announcing "Later, 3
   * unread" would be stating something false about mail nobody has to read
   * yet. The sidebar is the only place a mail count is shown, so the number
   * never has to be disambiguated against a second one in the list header.
   */
  count?: { value: number; noun: string }
  indent?: boolean
  /** An account row's category hue, in place of an icon. */
  hue?: Hue
}) {
  const current = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const active = viewKey(current) === viewKey(view)
  const name = count === undefined ? label : `${label}, ${count.value} ${count.noun}`

  const buttonProps = {
    type: 'button' as const,
    onClick: () => setView(view),
    'aria-current': active ? ('page' as const) : undefined,
    'data-view-key': viewKey(view),
    'aria-label': name,
    className: cn(
      // `rounded-row`, the same 10 px rect the thread rows now take, so a
      // mailbox and a message read as the same kind of object down the whole
      // window (AMIE-STUDY §5). The focus ring is a box-shadow and follows
      // that radius on its own.
      'rounded-row font-ui group flex h-9 w-full items-center text-base outline-none',
      'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
      'focus-ring',
      active ? 'bg-fill-selected text-ink font-medium' : 'text-ink-2 hover:bg-fill-hover',
      collapsed ? 'justify-center px-0' : 'gap-2 px-2',
      indent && !collapsed && 'pl-8',
    ),
  }

  const content = (
    <>
      <span className="flex w-6 shrink-0 items-center justify-center">
        {icon ? (
          // Resting at the meta tier and stepping up on hover: structure felt,
          // not seen (MAGIC §3.1, Linear's invisible refresh). The active row
          // gets the accent AND the Style=Filled twin — filled plus colour is
          // what "selected" looks like in this system, and it is the one thing
          // in a sidebar row that has to be seen from across the pane.
          <Icon
            name={icon}
            size={20}
            filled={active}
            // The seam's semantic colour rules here (owner ruling 2026-08-31,
            // superseding the flatten-to-accent override): the active inbox
            // fills coral, the star gold, the trash red, sent sky-blue. Each
            // folder announces itself in its own colour; the selected-row wash
            // still carries the "you are here".
            className={active ? undefined : 'text-ink-3 group-hover:text-ink-2'}
          />
        ) : hue ? (
          collapsed ? (
            // Collapsed, an account row used to fall through to a naked 6 px dot
            // floating in a 40×36 button, which reads as a rendering fault
            // (N3). An inbox glyph in the account's hue says the same thing
            // and looks intended.
            <Icon name="inbox" size={20} filled={active} style={{ color: hueSolid(hue) }} />
          ) : (
            <AccountDot hue={hue} />
          )
        ) : null}
      </span>
      {!collapsed && (
        // The count rides inline, immediately after the name, rather than
        // right-aligned in its own column — Amie's small, very deliberate move
        // (AMIE-STUDY §5). `Inbox 4` reads as part of the name; a right-aligned
        // 4 reads as a metric to be compared against the other rows' metrics,
        // and there are none.
        <span aria-hidden className="flex min-w-0 flex-1 items-baseline gap-2 text-left">
          <span className="truncate">{label}</span>
          {count !== undefined && <UnreadCount value={count.value} active={active} />}
        </span>
      )}
    </>
  )

  // Collapsed, the tooltip is the *only* way to learn what a glyph means, and
  // the native `title` it replaced never appeared on keyboard focus at all
  // (S12). Expanded, the label is on screen and a tooltip would repeat it.
  return (
    <li>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={<button {...buttonProps} />}>{content}</TooltipTrigger>
          <TooltipContent side="right">{name}</TooltipContent>
        </Tooltip>
      ) : (
        <button {...buttonProps}>{content}</button>
      )}
    </li>
  )
}

/**
 * The inbox count, popping once when it RISES — mail arriving is feedback
 * worth feeling; mail being read is the user's own doing and stays silent.
 * Remounting the span (key) is what re-runs the CSS animation; the tokens'
 * reduced-motion block neutralizes it (scale 1, [data-wren-pop] animation
 * none), so the pop stills itself there.
 */
function UnreadCount({ value, active }: { value: number; active: boolean }) {
  // A monotonic counter keys the span (the presses idiom in wren-controls):
  // it bumps once per rise and then holds, so an unrelated parent re-render
  // mid-pop cannot flip the key back and cut the animation short.
  const previous = useRef(value)
  const pops = useRef(0)
  if (value > previous.current) pops.current++
  useEffect(() => {
    previous.current = value
  }, [value])

  return (
    <span
      key={pops.current}
      data-wren-pop={pops.current > 0 ? '' : undefined}
      className={cn(
        'shrink-0 text-xs tabular-nums',
        active ? 'text-brand font-medium' : 'text-ink-3',
      )}
    >
      {value}
    </span>
  )
}

/**
 * All accounts under one folding header, so four addresses read as one group
 * rather than four competing sections (owner ask, 2026-08-30). Folded, the
 * header keeps every account's hue dot — the group stays glanceable at the
 * cost of one row. Navigating into an account always unfolds it (ui-store).
 */
function AccountsGroup({ accounts }: { accounts: Account[] }) {
  const collapsed = useUi((s) => s.accountsGroupCollapsed)
  const toggle = useUi((s) => s.toggleAccountsGroup)
  if (accounts.length === 0) return null

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className={cn(DISCLOSURE_ROW, SECTION_LABEL)}
      >
        <span className="flex-1 text-left">Accounts</span>
        {collapsed && (
          <span aria-hidden className="flex items-center gap-1">
            {accounts.map((account) => (
              <AccountDot key={account.id} hue={hueFor(account.email)} />
            ))}
          </span>
        )}
        <Icon name={!collapsed ? 'chevronDown' : 'chevronRight'} size={16} />
      </button>
      {/* The fold animates through grid-template-rows (0fr ↔ 1fr): a real
          transition, so a mid-fold second click reverses from where it is —
          keyframes would restart. Contents stay mounted; only rows collapse. */}
      <div
        className="grid transition-[grid-template-rows] duration-(--wren-dur-base) ease-(--wren-ease-out) motion-reduce:transition-none"
        style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}
      >
        <div className="min-h-0 overflow-hidden" inert={collapsed || undefined}>
          {accounts.map((account) => (
            <AccountSection key={account.id} account={account} />
          ))}
        </div>
      </div>
    </section>
  )
}

function AccountSection({ account }: { account: Account }) {
  const expanded = useUi((s) => s.expandedAccounts[account.id] ?? false)
  const toggle = useUi((s) => s.toggleAccount)
  const labels = useLabels(expanded ? account.id : undefined)
  const hue = hueFor(account.email)

  const items = (labels.data ?? [])
    .filter((l) => l.type === 'user' || SYSTEM_ORDER.includes(l.id))
    .sort((a, b) => {
      const ai = SYSTEM_ORDER.indexOf(a.id)
      const bi = SYSTEM_ORDER.indexOf(b.id)
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      return a.name.localeCompare(b.name)
    })

  return (
    <section className="mt-1">
      <button
        type="button"
        onClick={() => toggle(account.id)}
        aria-expanded={expanded}
        data-account-toggle={account.id}
        className={cn(
          DISCLOSURE_ROW,
          // The eyebrow's weight and tracking (AMIE-STUDY §3) but not its
          // caps: this section's label is an email address, and an address in
          // all-caps is unreadable. The caps half of the role goes where a
          // section label is a *word* — the palette's groups, the reading
          // pane's metadata keys, the composer's field labels.
          'font-ui text-ink-3 text-xs font-semibold',
        )}
      >
        <span className="flex w-6 shrink-0 items-center justify-center">
          <AccountDot hue={hue} />
        </span>
        <span className="flex-1 truncate text-left">{account.email}</span>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} />
      </button>
      {expanded && (
        <ul className="mt-1 flex flex-col gap-1">
          {items.map((label) => (
            <NavRow
              key={label.id}
              view={{ kind: 'account', accountId: account.id, labelId: label.id }}
              label={FOLDER_BY_LABEL[label.id]?.name ?? label.name}
              icon={FOLDER_BY_LABEL[label.id]?.icon}
              // A user label takes its own hue from its name; a system folder
              // has a glyph and needs none.
              hue={FOLDER_BY_LABEL[label.id] ? undefined : hueFor(label.name)}
              collapsed={false}
              indent
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function SidebarFooter({ collapsed, accounts }: { collapsed: boolean; accounts: Account[] }) {
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const { theme, toggle } = useThemeToggle()
  const statuses = useSyncStatus()
  const now = useNow()
  const themeIcon: IconName =
    theme === 'light' ? 'themeLight' : theme === 'dark' ? 'themeDark' : 'themeSystem'
  const themeLabel = `Switch theme, currently ${theme}`

  const { demo } = useMailMode()
  const openSettings = useSurfaces((s) => s.openSettings)
  // Cached, and already read by the badge below — this asks the same query for
  // the same answer, not the gateway for a second one.
  const waiting = usePendingApprovals().data?.length ?? 0

  // Three strings, not one. The long form used to be the only form and it
  // truncated mid-word — "Demo data · 2 accou…" — which made the one line that
  // says what the app is doing the one line you cannot read. The state gets
  // the pixels; the sentence gets the tooltip. Derived in sync-summary.ts so
  // the copy can be tested as data.
  // `demo && !syncPreview`: demo outranks every other state, which is right —
  // "Demo data" is the truest thing to say about a demo window. But the demo
  // service is the only way to reach these states in a browser, so ?sync= has
  // to be allowed past it or the flag could never show anything.
  // When this window started waiting, so "Starting…" can escalate rather than
  // stand forever. A ref, not state: it is read during render and never drives
  // one, and it must survive the minute tick that re-renders this footer.
  const startedAt = useRef(now)
  const sync = describeSync(accounts, statuses, demo && !syncPreview, now, startedAt.current)

  return (
    <div
      className={cn(
        // `@container`, so the status line can ask how wide the *sidebar* is.
        // The sidebar is a resizable panel with a 200 px floor, and at 950 px
        // the panel group takes it there: the label then truncated to a single
        // letter — "D" for "Demo data" — which is worse than not drawing it
        // (N7). Below 13rem of content box it drops out entirely and the glyph
        // plus the tooltip carry the state, which is the same trade the long
        // form already lost once.
        // `px-2` is the card's 8 px inset. It used to be justified as the
        // concentric step (18 − 8 = 10 = the row radius); the card is
        // `rounded-md` 12 now, so that arithmetic no longer produces the row
        // radius — see SHELL_CARD in app-shell.tsx. The inset stays at 8
        // because it is what the rows are drawn against, and it hands the
        // @container box 8 px more than it had, so the `@[13rem]` gate below
        // keeps its behaviour with more headroom. The top rule still needs no
        // inset of its own: the footer is 48 px tall, so it sits 48 px above
        // the card's bottom edge and never enters the corner curve at all —
        // which was true at 18 and is more true at 12 — and the nav's
        // `overflow-hidden` clips it flush to the sides.
        'border-hairline @container flex shrink-0 items-center border-t px-2 py-2',
        collapsed ? 'flex-col gap-1' : 'gap-2',
      )}
    >
      <ApprovalsBadge />
      {/* The status line's own box, which stays whatever the line inside it
          does. It owns the flex-1 that pushes the three chrome buttons to the
          right edge, so the row keeps its arrangement at the width where the
          line drops out (issue 3). No `overflow-hidden` here: the line clips
          itself, and the button form's -mx-1 hover fill is meant to bleed into
          the gap on either side. */}
      {!collapsed && (
        <div className="flex min-w-0 flex-1 items-center">
          <SyncLine sync={sync} waiting={waiting} openSettings={openSettings} />
        </div>
      )}
      {/* Collapsed, the status line is gone — so without this a dead grant is
          invisible at 68 px and mail silently stops. Exactly one addition, and
          only for the two states a person can act on: the rail is a column of
          jump targets, so a still glyph meaning "wait" is decoration there and
          a red glyph meaning "act" is information. The account rows keep their
          identity hue untouched; nothing gains a badge or a ring. */}
      {collapsed && isUrgent(sync) && sync.action !== null && (
        <IconButton
          name="error"
          tone="alert"
          label={sync.detail}
          onClick={() => openSettings(sync.action ?? undefined)}
        />
      )}
      {/* These three are toolbar chrome: 18, like every other toolbar
          (DIRECTION §8, S8). The sync glyph above stays at 16 because it sits
          inline with text, which is the size the same rule gives it.

          The first of them is the sidebar toggle, moved out of the deleted
          titlebar and parked to the LEFT of settings (owner ask, 2026-08-31).
          One glyph, label swapped — Finder's arrangement. NOT `active`:
          IconButton tints `text-brand` when active and a window-layout state
          is not what the one accent is spent on (DIRECTION §10.2b). ⌥⌘S and
          the palette carry the discoverability the titlebar slot used to. */}
      <IconButton
        name="panelLeft"
        label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        className="shrink-0"
        onClick={toggleSidebar}
      />
      <IconButton name="settings" label="Settings" className="shrink-0" onClick={() => openSettings()} />
      <IconButton name={themeIcon} label={themeLabel} className="shrink-0" onClick={toggle} />
    </div>
  )
}

/**
 * The status line. A control when there is somewhere to go, a plain span
 * otherwise — the same doctrine ApprovalsBadge argues below: a permanent
 * control that does nothing six days a week teaches people to stop looking at
 * it. A clickable "Up to date" is a focus stop that buys nothing.
 */
/**
 * The status line's box, declared once for the two element types it can be.
 *
 * A span when there is nothing to do about the state and a button when there
 * is — one sentence of layout either way, so the line does not change shape as
 * it becomes actionable. `flex` itself is left to the `room` gate beside it,
 * which is the thing that decides whether the line is laid out at all.
 */
const SYNC_LINE = 'min-w-0 flex-1 items-center gap-2 overflow-hidden text-xs'

function SyncLine({
  sync,
  waiting,
  openSettings,
}: {
  sync: SyncSummary
  waiting: number
  openSettings: (section?: SettingsSection) => void
}) {
  // Asked of the kind, never inferred from `action`: a transient blip routes to
  // Settings too, so `action !== null` would have let a dropped connection take
  // the destructive glyph and displace the approvals pill.
  const urgent = isUrgent(sync)

  /**
   * Whether there is room for the line at all.
   *
   * The three chrome buttons and their gaps take ~128 px and no longer shrink;
   * the approvals pill takes ~56 px more when it is up. At the sidebar's 200 px
   * floor — which the panel group reaches at about a 950 px window — that left
   * the line a 1 px box, and its 16 px glyph overhung the collapse button
   * beside it (issue 3). Below the gate the line drops out whole: a glyph drawn
   * on top of a control is not information.
   *
   * The gate is on the LINE and not on the wrapper around it, because the
   * wrapper is also the flex-1 that holds the three chrome buttons at the right
   * edge. Hiding the wrapper would take that spacer away and slide them left at
   * exactly the width issue 3 was about.
   *
   * Written out in full, both branches, so Tailwind can see the class names.
   */
  const room = waiting > 0 ? 'hidden @[13rem]:flex' : 'flex'

  const body = (
    <>
      <Icon
        name={urgent ? 'error' : 'sync'}
        size={16}
        className={cn(
          'shrink-0',
          sync.kind === 'syncing' && 'motion-safe:animate-spin',
          urgent && 'text-destructive',
        )}
      />
      {/* Dropped whole, never sliced. The badge is what takes the room — with
          it up, "Demo data" had about 64 px and rendered "Demo da…", and at the
          sidebar's 200 px floor it rendered "D" (N7). The gate stays where it
          was; the strings were budgeted to it instead of moving it.

          The one exception is an actionable state: when an approval is waiting
          AND an account is dead, suppressing the words left a pill, a red glyph
          and nothing to read. The approvals pill can lose its neighbour; a dead
          grant cannot — but a Wi-Fi blip can, which is why this asks `urgent`
          and not `action`. */}
      {(waiting === 0 || urgent) && (
        <>
          {/* The gates move when the approvals pill is up, because the pill is
              ~55 px of the same row. Measured on the real footer: three 18 px
              buttons plus gaps take ~128 px, so a 13rem (208 px) container
              leaves ~80 px for the line — enough. Add the pill and the same
              container leaves ~57 px, which sliced "Sign in" to "Si…" — the
              exact N7 failure the gate exists to prevent. Both class strings
              are written out in full so Tailwind can see them. */}
          <span
            className={cn(
              'hidden truncate',
              waiting > 0
                ? '@[16rem]:inline @[20rem]:hidden'
                : '@[13rem]:inline @[17rem]:hidden',
            )}
          >
            {sync.short}
          </span>
          <span
            className={cn(
              'hidden min-w-0 items-baseline gap-1',
              waiting > 0 ? '@[20rem]:flex' : '@[17rem]:flex',
            )}
          >
            {/* Only the address truncates. The verb phrase never does, so the
                worst case is "Sign in again — nick@metad…" — the instruction
                survives whole, which is what separates this from the N7 failure
                where the sliced word carried all the meaning. The separator
                lives here rather than inside `full`, so `full` is never a
                string with a dangling dash when there is no address. */}
            <span className="shrink-0">{sync.full}</span>
            {sync.address && (
              <>
                <span aria-hidden className="shrink-0">
                  —
                </span>
                <span className="truncate">{sync.address}</span>
              </>
            )}
          </span>
        </>
      )}
      <span className="sr-only">{sync.detail}</span>
    </>
  )

  // Hoisted so the JSX below closes over a narrowed value. The `?? 'accounts'`
  // this replaces was TypeScript appeasement that also encoded a wrong default:
  // if a future urgent state routed to 'google' and the narrowing lapsed, it
  // would have quietly opened the wrong pane instead of failing loudly.
  const action = sync.action
  if (action === null) {
    return (
      <span title={sync.detail} className={cn(SYNC_LINE, room, 'text-ink-3')}>
        {body}
      </span>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={sync.detail}
            onClick={() => openSettings(action)}
            className={cn(
              SYNC_LINE,
              room,
              // NavRow's own radius and focus ring, so the hit target reads as
              // the same kind of object as a mailbox row. -mx-1 px-1 = 4 px, on
              // grid.
              'rounded-row focus-ring text-ink-2 -mx-1 px-1',
              'duration-(--wren-dur-fast) ease-(--wren-ease-out) transition-colors',
              'hover:bg-fill-hover hover:text-ink',
            )}
          />
        }
      >
        {body}
      </TooltipTrigger>
      <TooltipContent side="top">{sync.detail}</TooltipContent>
    </Tooltip>
  )
}

/**
 * "Something is waiting on you" — the approval queue's only entry point.
 *
 * It is absent at zero rather than dimmed at zero. A permanent control that is
 * empty six days a week teaches people to stop looking at it, and the whole
 * point of this one is that it is worth looking at when it appears.
 *
 * An accent-washed pill, not a red dot: a queued send is information, which is
 * what DIRECTION §3 spends the one accent on. It is not an alarm — the agent
 * asked politely and the mail is not going anywhere.
 */
function ApprovalsBadge() {
  const pending = usePendingApprovals()
  const setApprovals = useSurfaces((s) => s.setApprovals)
  const count = pending.data?.length ?? 0
  if (count === 0) return null

  const label = `${count} approval${count === 1 ? '' : 's'} waiting`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            data-wren-approvals
            onClick={() => setApprovals(true)}
            className={cn(
              // Ink on the wash, not accent on the wash. `--wren-fill-selected`
              // is the accent at 8% and it composites *darker* than the canvas
              // it sits on, so accent ink measured 4.21:1 here — under the 4.5
              // this 11.5 px numeral needs, on the one entry point to the
              // approval queue (UI-REVIEW-2026-08-29 S2). text-1 on the same
              // composited fill, rgb(23,23,25) on rgb(230,232,243), computes to
              // 14.63:1 light and clears it with room to spare; dark is higher
              // still. The accent stays on the glyph, which is non-text and
              // needs 3.0 — it has 4.21.
              'bg-fill-selected text-ink font-ui inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-medium outline-none',
              'transition-[background-color,scale] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
              PRESS,
              'focus-ring hover:bg-fill-active',
            )}
          />
        }
      >
        <Icon name="check" size={16} className="text-brand" />
        <span className="tabular-nums">{count}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
