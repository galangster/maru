// The navigation pane: compose, the unified folders, one section per account,
// and a footer that says what the app is currently doing.
//
// Selection is a soft fill plus an accent-tinted icon. Never a left bar —
// DIRECTION §2 (Juicebox) and §10.2.

import { Icon, type IconName } from '@/components/ui/icon'
import { Tooltip, TooltipContent, TooltipHint, TooltipTrigger } from '@/components/ui/tooltip'
import { AccountDot, IconButton, PRESS, PrimaryButton } from '@/components/wren-controls'
import { FOLDERS, FOLDER_BY_LABEL } from '@/core/defaults'
import type { Account, MailView } from '@/core/types'
import { usePendingApprovals } from '@/features/agents/queries'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import { useAccounts, useLabels, useSyncStatus, useUnreadCount } from '@/features/mail/queries'
import { useMailMode } from '@/features/mail/service'
import { useUi, viewKey } from '@/features/mail/ui-store'
import { useSurfaces } from '@/features/shell/surface-store'
import { useThemeToggle } from '@/features/shell/use-theme'
import { hueFor, hueSolid, type Hue } from '@/lib/hue'
import { cn } from '@/lib/utils'

/** The order the per-account label tree puts the system labels in. */
const SYSTEM_ORDER = FOLDERS.map((f) => f.label)

const INBOX_VIEW: MailView = { kind: 'unified', folder: 'inbox' }

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const accounts = useAccounts()
  // Only the inbox shows a count, so only the inbox is subscribed to one. The
  // sidebar used to run a countUnread query per folder and render one of them.
  const inboxUnread = useUnreadCount(INBOX_VIEW).data ?? 0

  return (
    <nav
      aria-label="Mailboxes"
      className="bg-canvas flex h-full flex-col"
    >
      <div className="shrink-0 px-3 pt-2 pb-3">
        <ComposeButton collapsed={collapsed} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <ul className="flex flex-col gap-1">
          {FOLDERS.map((item) => (
            <NavRow
              key={item.folder}
              view={{ kind: 'unified', folder: item.folder }}
              label={item.name}
              icon={item.icon}
              collapsed={collapsed}
              unread={item.folder === 'inbox' && inboxUnread > 0 ? inboxUnread : undefined}
            />
          ))}
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
          (accounts.data ?? []).map((account) => (
            <AccountSection key={account.id} account={account} />
          ))
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
            // The label has to survive the collapse: at 64 px the word goes
            // away and a tooltip alone is not an accessible name.
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
  unread,
  indent = false,
  hue,
}: {
  view: MailView
  label: string
  icon?: IconName
  collapsed: boolean
  /** Unread threads in this mailbox. The sidebar is the only place a mail
   *  count is shown, so the number never has to be disambiguated against a
   *  second one in the list header. */
  unread?: number
  indent?: boolean
  /** An account row's category hue, in place of an icon. */
  hue?: Hue
}) {
  const current = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const active = viewKey(current) === viewKey(view)
  const name = unread === undefined ? label : `${label}, ${unread} unread`

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
            // The current mailbox is the accent, whatever the glyph means
            // anywhere else. The icon seam gives a filled glyph its own
            // semantic colour — a filled trash is destructive red, a filled
            // star is the star hue — and neither is what a nav row is saying.
            // It is saying "you are here", which DIRECTION §3 maps to the one
            // accent. An explicit `style` is how a call site overrides the
            // seam's default, and this is one of the two that do.
            style={active ? { color: 'var(--wren-accent)' } : undefined}
            className={active ? undefined : 'text-ink-3 group-hover:text-ink-2'}
          />
        ) : hue ? (
          collapsed ? (
            // At 64 px an account row used to fall through to a naked 6 px dot
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
          {unread !== undefined && (
            <span
              className={cn(
                'shrink-0 text-xs tabular-nums',
                active ? 'text-brand font-medium' : 'text-ink-3',
              )}
            >
              {unread}
            </span>
          )}
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
    <section className="mt-6">
      <button
        type="button"
        onClick={() => toggle(account.id)}
        aria-expanded={expanded}
        data-account-toggle={account.id}
        className={cn(
          // The eyebrow's weight and tracking (AMIE-STUDY §3) but not its
          // caps: this section's label is an email address, and an address in
          // all-caps is unreadable. The caps half of the role goes where a
          // section label is a *word* — the palette's groups, the reading
          // pane's metadata keys, the composer's field labels.
          'rounded-row font-ui text-ink-3 flex h-8 w-full items-center gap-2 px-2 text-xs font-semibold outline-none',
          'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
          'hover:bg-fill-hover hover:text-ink-2 focus-ring',
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
  const { theme, toggle } = useThemeToggle()
  const statuses = Object.values(useSyncStatus())
  const themeIcon: IconName =
    theme === 'light' ? 'themeLight' : theme === 'dark' ? 'themeDark' : 'themeSystem'
  const themeLabel = `Switch theme, currently ${theme}`

  const { demo } = useMailMode()
  const openSettings = useSurfaces((s) => s.openSettings)
  // Cached, and already read by the badge below — this asks the same query for
  // the same answer, not the gateway for a second one.
  const waiting = usePendingApprovals().data?.length ?? 0
  const plural = `${accounts.length} account${accounts.length === 1 ? '' : 's'}`
  const syncing = statuses.some((s) => s.state === 'syncing')
  const failed = statuses.some((s) => s.state === 'error')

  // Two strings, not one. The long form used to be the only form and it
  // truncated in the middle of a word — "Demo data · 2 accou…" — which made the
  // one line that says what the app is doing the one line you cannot read. The
  // state gets the pixels; the detail gets the tooltip.
  const state = demo
    ? 'Demo data'
    : failed
      ? 'Sync failed'
      : syncing
        ? 'Syncing…'
        : 'Up to date'
  const detail = demo
    ? `Demo data · ${plural}`
    : failed
      ? 'Sync failed · Wren is retrying'
      : syncing
        ? `Syncing ${plural}`
        : `${plural} · up to date`

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
        'border-hairline @container flex shrink-0 items-center border-t px-3 py-2',
        collapsed ? 'flex-col gap-1' : 'gap-2',
      )}
    >
      <ApprovalsBadge />
      {!collapsed && (
        <span
          title={detail}
          className="text-ink-3 flex min-w-0 flex-1 items-center gap-2 text-xs"
        >
          <Icon
            name={failed ? 'error' : 'sync'}
            size={16}
            className={cn(
              'shrink-0',
              syncing && 'motion-safe:animate-spin',
              failed && 'text-destructive',
            )}
          />
          {/* Dropped whole, never sliced. The badge is what takes the room —
              with it up, "Demo data" had about 64 px and rendered "Demo da…",
              and at the sidebar's 200 px floor it rendered "D" (N7). The glyph
              still carries the state, the tooltip and the screen-reader line
              still carry the sentence, and none of the three is a fragment of
              a word. */}
          {waiting === 0 && <span className="hidden truncate @[13rem]:inline">{state}</span>}
          <span className="sr-only">{detail}</span>
        </span>
      )}
      {/* Toolbar chrome: 18, like every other toolbar (DIRECTION §8, S8). The
          sync glyph above stays at 16 because it sits inline with text, which
          is the size the same rule gives it. */}
      <IconButton name="settings" label="Settings" onClick={() => openSettings()} />
      <IconButton name={themeIcon} label={themeLabel} onClick={toggle} />
    </div>
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
