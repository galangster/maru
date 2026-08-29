// The navigation pane: compose, the unified folders, one section per account,
// and a footer that says what the app is currently doing.
//
// Selection is a soft fill plus an accent-tinted icon. Never a left bar —
// DIRECTION §2 (Juicebox) and §10.2.

import { Icon, type IconName } from '@/components/ui/icon'
import { AccountDot, IconButton, PrimaryButton } from '@/components/wren-controls'
import { FOLDERS, FOLDER_BY_LABEL } from '@/core/defaults'
import type { Account, MailView } from '@/core/types'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import { useAccounts, useLabels, useSyncStatus, useUnreadCount } from '@/features/mail/queries'
import { useMailMode } from '@/features/mail/service'
import { useUi, viewKey } from '@/features/mail/ui-store'
import { useSurfaces } from '@/features/shell/surface-store'
import { useThemeToggle } from '@/features/shell/use-theme'
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
                dot={account.color}
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
    <PrimaryButton
      onClick={compose}
      title="Compose (C)"
      // The label has to survive the collapse: at 64 px the word goes away and
      // `title` alone is not an accessible name.
      aria-label="Compose"
      className={cn('h-9', collapsed ? 'w-9' : 'w-full gap-2')}
    >
      <Icon name="compose" size={collapsed ? 18 : 16} />
      {!collapsed && 'Compose'}
    </PrimaryButton>
  )
}

function NavRow({
  view,
  label,
  icon,
  collapsed,
  unread,
  indent = false,
  dot,
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
  dot?: string
}) {
  const current = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const active = viewKey(current) === viewKey(view)
  const name = unread === undefined ? label : `${label}, ${unread} unread`

  return (
    <li>
      <button
        type="button"
        onClick={() => setView(view)}
        aria-current={active ? 'page' : undefined}
        data-view-key={viewKey(view)}
        title={collapsed ? name : undefined}
        aria-label={name}
        className={cn(
          'font-ui flex h-9 w-full items-center rounded-md text-base outline-none',
          'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
          'focus-visible:ring-3 focus-visible:ring-ring/50',
          active ? 'bg-fill-selected text-ink font-medium' : 'text-ink-2 hover:bg-fill-hover',
          collapsed ? 'justify-center px-0' : 'gap-2 px-2',
          indent && !collapsed && 'pl-8',
        )}
      >
        <span className="flex w-6 shrink-0 items-center justify-center">
          {icon ? (
            <Icon name={icon} size={20} className={active ? 'text-brand' : 'text-ink-3'} />
          ) : dot ? (
            <AccountDot color={dot} />
          ) : null}
        </span>
        {!collapsed && (
          <span aria-hidden className="flex-1 truncate text-left">
            {label}
          </span>
        )}
        {!collapsed && unread !== undefined && (
          <span
            aria-hidden
            className={cn(
              'shrink-0 text-xs tabular-nums',
              active ? 'text-brand font-medium' : 'text-ink-3',
            )}
          >
            {unread}
          </span>
        )}
      </button>
    </li>
  )
}

function AccountSection({ account }: { account: Account }) {
  const expanded = useUi((s) => s.expandedAccounts[account.id] ?? false)
  const toggle = useUi((s) => s.toggleAccount)
  const labels = useLabels(expanded ? account.id : undefined)

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
          'font-ui text-ink-3 flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs outline-none',
          'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
          'hover:bg-fill-hover hover:text-ink-2 focus-visible:ring-3 focus-visible:ring-ring/50',
        )}
      >
        <span className="flex w-6 shrink-0 items-center justify-center">
          <AccountDot color={account.color} />
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
              dot={account.color}
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
        'border-hairline flex shrink-0 items-center border-t px-3 py-2',
        collapsed ? 'flex-col gap-1' : 'gap-2',
      )}
    >
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
          <span className="truncate">{state}</span>
          <span className="sr-only">{detail}</span>
        </span>
      )}
      <IconButton
        name="settings"
        label="Settings"
        size={16}
        onClick={() => openSettings()}
      />
      <IconButton name={themeIcon} label={themeLabel} size={16} onClick={toggle} />
    </div>
  )
}
