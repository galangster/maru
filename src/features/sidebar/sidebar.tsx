// The navigation pane: compose, the unified folders, one section per account,
// and a footer that says what the app is currently doing.
//
// Selection is a soft fill plus an accent-tinted icon. Never a left bar —
// DIRECTION §2 (Juicebox) and §10.2.

import { Icon, type IconName } from '@/components/ui/icon'
import { AccountDot, IconButton } from '@/components/wren-controls'
import type { Account, MailView, UnifiedFolder } from '@/core/types'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import { useAccounts, useLabels, useSyncStatus, useUnreadCount } from '@/features/mail/queries'
import { useMailMode } from '@/features/mail/service'
import { useUi, viewKey } from '@/features/mail/ui-store'
import { useSurfaces } from '@/features/shell/surface-store'
import { useThemeToggle } from '@/features/shell/use-theme'
import { cn } from '@/lib/utils'

const UNIFIED: { folder: UnifiedFolder; label: string; icon: IconName }[] = [
  { folder: 'inbox', label: 'Inbox', icon: 'inbox' },
  { folder: 'starred', label: 'Starred', icon: 'star' },
  { folder: 'sent', label: 'Sent', icon: 'sent' },
  { folder: 'trash', label: 'Trash', icon: 'trash' },
]

const SYSTEM_LABEL_NAMES: Record<string, { label: string; icon: IconName }> = {
  INBOX: { label: 'Inbox', icon: 'inbox' },
  STARRED: { label: 'Starred', icon: 'star' },
  SENT: { label: 'Sent', icon: 'sent' },
  TRASH: { label: 'Trash', icon: 'trash' },
}

const SYSTEM_ORDER = ['INBOX', 'STARRED', 'SENT', 'TRASH']

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const accounts = useAccounts()

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
          {UNIFIED.map((item) => (
            <UnifiedItem key={item.folder} {...item} collapsed={collapsed} />
          ))}
        </ul>

        {(accounts.data ?? []).map((account) => (
          <AccountSection key={account.id} account={account} collapsed={collapsed} />
        ))}
      </div>

      <SidebarFooter collapsed={collapsed} accounts={accounts.data ?? []} />
    </nav>
  )
}

function ComposeButton({ collapsed }: { collapsed: boolean }) {
  const { compose } = useComposeActions()

  return (
    <button
      type="button"
      onClick={compose}
      title="Compose (C)"
      className={cn(
        'font-ui bg-primary text-primary-foreground inline-flex h-9 items-center rounded-md text-base font-medium',
        'shadow-xs transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        'hover:bg-brand-hover focus-visible:ring-3 focus-visible:ring-ring/50 outline-none',
        collapsed ? 'w-9 justify-center' : 'w-full justify-center gap-2',
      )}
    >
      <Icon name="compose" size={collapsed ? 18 : 16} />
      {!collapsed && 'Compose'}
    </button>
  )
}

function UnifiedItem({
  folder,
  label,
  icon,
  collapsed,
}: {
  folder: UnifiedFolder
  label: string
  icon: IconName
  collapsed: boolean
}) {
  const view: MailView = { kind: 'unified', folder }
  const unread = useUnreadCount(view)
  const count = folder === 'inbox' ? (unread.data ?? 0) : 0
  return (
    <NavRow
      view={view}
      label={label}
      icon={icon}
      collapsed={collapsed}
      count={count > 0 ? count : undefined}
    />
  )
}

function NavRow({
  view,
  label,
  icon,
  collapsed,
  count,
  indent = false,
  dot,
}: {
  view: MailView
  label: string
  icon?: IconName
  collapsed: boolean
  count?: number
  indent?: boolean
  dot?: string
}) {
  const current = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const active = viewKey(current) === viewKey(view)

  return (
    <li>
      <button
        type="button"
        onClick={() => setView(view)}
        aria-current={active ? 'page' : undefined}
        data-view-key={viewKey(view)}
        title={collapsed ? label : undefined}
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
        {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
        {!collapsed && count !== undefined && (
          <span
            className={cn(
              'shrink-0 text-xs tabular-nums',
              active ? 'text-brand font-medium' : 'text-ink-3',
            )}
          >
            {count}
          </span>
        )}
      </button>
    </li>
  )
}

function AccountSection({ account, collapsed }: { account: Account; collapsed: boolean }) {
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

  if (collapsed) {
    return (
      <div className="mt-3 flex justify-center pt-3" title={account.email}>
        <AccountDot color={account.color} />
      </div>
    )
  }

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
              label={SYSTEM_LABEL_NAMES[label.id]?.label ?? label.name}
              icon={SYSTEM_LABEL_NAMES[label.id]?.icon}
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
  const themeLabel = `Theme: ${theme}. Switch.`

  const { demo } = useMailMode()
  const openSettings = useSurfaces((s) => s.openSettings)
  const plural = `${accounts.length} account${accounts.length === 1 ? '' : 's'}`
  const syncing = statuses.some((s) => s.state === 'syncing')
  const failed = statuses.some((s) => s.state === 'error')
  const status = demo
    ? `Demo data · ${plural}`
    : failed
      ? 'Sync failed · retrying'
      : syncing
        ? `Syncing · ${plural}`
        : `${plural} · up to date`

  return (
    <div
      className={cn(
        'border-hairline flex shrink-0 items-center border-t px-3 py-2',
        collapsed ? 'flex-col gap-1' : 'gap-2',
      )}
    >
      {!collapsed && (
        <span className="text-ink-3 flex min-w-0 flex-1 items-center gap-2 text-xs">
          <Icon
            name={failed ? 'error' : 'sync'}
            size={16}
            className={cn('shrink-0', syncing && 'animate-spin', failed && 'text-destructive')}
          />
          <span className="truncate">{status}</span>
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
