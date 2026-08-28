// The command palette — DIRECTION §2 (Ferndesk/Vapi/Juicebox) and §7.
//
// A centered glass-strong card over a dimmed app, ~600 px, with a permanent
// keycap footer. Selection is a soft fill and an accent-tinted icon; there is
// no left bar, which is the one thing that reference set gets wrong.

import { useMemo, useState } from 'react'
import { Command } from 'cmdk'

import { Icon, type IconName } from '@/components/ui/icon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Account, MailView, Thread } from '@/core/types'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import {
  MIN_SEARCH_LENGTH,
  useAccounts,
  usePerformAction,
  useSearch,
  useThreads,
} from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useUi } from '@/features/mail/ui-store'
import { ThreadResult } from '@/features/search/thread-result'
import { focusThreadList, useSurfaces } from '@/features/shell/surface-store'
import { useThemeToggle } from '@/features/shell/use-theme'
import { useDebounced } from '@/lib/use-debounced'
import { useNow } from '@/lib/use-now'
import { viewForThread } from '@/lib/thread-view'

export function CommandPalette() {
  const open = useSurfaces((s) => s.palette)
  const setPalette = useSurfaces((s) => s.setPalette)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setPalette(next)
        if (!next) focusThreadList()
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-label="Command palette"
        className="glass-strong wren-fixed top-[16%] flex w-[600px] max-w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 ring-0 sm:max-w-[600px]"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Run a command, jump to a mailbox, or search every thread.
        </DialogDescription>
        {open && <PaletteBody onClose={() => setPalette(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query)
  const now = useNow()

  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const selected = useUi((s) => s.selected)
  const setSelected = useUi((s) => s.setSelected)

  const service = useMailService()
  const accounts = useAccounts()
  const threads = useThreads(view)
  const action = usePerformAction()
  const results = useSearch(debounced)
  const openSettings = useSurfaces((s) => s.openSettings)
  const { compose } = useComposeActions()
  const theme = useThemeToggle()

  const accountList = accounts.data ?? []
  const accountsById = useMemo(() => {
    const map = new Map<string, Account>()
    for (const a of accountList) map.set(a.id, a)
    return map
  }, [accountList])
  const selfEmails = useMemo(() => accountList.map((a) => a.email), [accountList])

  const current = (threads.data ?? []).find((t) => t.key === selected)

  const run = (fn: () => void) => {
    onClose()
    fn()
  }

  const openThread = (thread: Thread) =>
    run(() => {
      setView(viewForThread(thread))
      setSelected(thread.key)
    })

  const goTo = (next: MailView) => run(() => setView(next))

  const hits = results.data ?? []
  const searching = debounced.trim().length >= MIN_SEARCH_LENGTH

  return (
    <Command
      loop
      label="Command palette"
      className="flex max-h-[480px] min-h-0 flex-col"
    >
      <div className="border-hairline flex h-12 shrink-0 items-center gap-3 border-b px-4">
        {/* Same 24 px icon box as every row below, so the glyphs line up. */}
        <span className="flex w-(--wren-icon-box) shrink-0 items-center justify-center">
          <Icon name="search" size={18} className="text-ink-3" />
        </span>
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search threads, or run a command…"
          className="text-ink placeholder:text-ink-3 h-8 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </div>

      <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <Command.Empty className="text-ink-3 px-2 py-8 text-center text-sm">
          Nothing matches “{query}”.
        </Command.Empty>

        <Group heading="Actions">
          <Row icon="compose" label="Compose" hint="C" onSelect={() => run(compose)} />
          {current && (
            <>
              <Row
                icon="archive"
                label="Archive"
                hint="E"
                onSelect={() =>
                  run(() => action.mutate({ type: 'archive', threadKey: current.key }))
                }
              />
              <Row
                icon="trash"
                label={current.labelIds.includes('TRASH') ? 'Restore from trash' : 'Move to trash'}
                onSelect={() =>
                  run(() =>
                    action.mutate({
                      type: current.labelIds.includes('TRASH') ? 'untrash' : 'trash',
                      threadKey: current.key,
                    }),
                  )
                }
              />
              <Row
                icon="star"
                label={current.starred ? 'Unstar' : 'Star'}
                hint="S"
                onSelect={() =>
                  run(() =>
                    action.mutate({
                      type: current.starred ? 'unstar' : 'star',
                      threadKey: current.key,
                    }),
                  )
                }
              />
              <Row
                icon={current.unread ? 'read' : 'unread'}
                label={current.unread ? 'Mark as read' : 'Mark as unread'}
                hint="U"
                onSelect={() =>
                  run(() =>
                    action.mutate({
                      type: current.unread ? 'markRead' : 'markUnread',
                      threadKey: current.key,
                    }),
                  )
                }
              />
            </>
          )}
          <Row
            icon={theme.next === 'dark' ? 'themeDark' : theme.next === 'light' ? 'themeLight' : 'themeSystem'}
            label={`Switch theme to ${theme.next}`}
            onSelect={() => run(theme.toggle)}
          />
          <Row icon="sync" label="Sync now" onSelect={() => run(() => void service.refresh())} />
          <Row icon="settings" label="Settings" onSelect={() => run(() => openSettings())} />
        </Group>

        <Group heading="Go to">
          <Row
            icon="inbox"
            label="Inbox"
            hint="⌘1"
            onSelect={() => goTo({ kind: 'unified', folder: 'inbox' })}
          />
          <Row
            icon="star"
            label="Starred"
            hint="⌘2"
            onSelect={() => goTo({ kind: 'unified', folder: 'starred' })}
          />
          <Row
            icon="sent"
            label="Sent"
            hint="⌘3"
            onSelect={() => goTo({ kind: 'unified', folder: 'sent' })}
          />
          <Row
            icon="trash"
            label="Trash"
            hint="⌘4"
            onSelect={() => goTo({ kind: 'unified', folder: 'trash' })}
          />
          {accountList.map((account) => (
            <Row
              key={account.id}
              icon="inbox"
              label={`Inbox — ${account.email}`}
              onSelect={() =>
                goTo({ kind: 'account', accountId: account.id, labelId: 'INBOX' })
              }
            />
          ))}
        </Group>

        {searching && hits.length > 0 && (
          <Group heading={`Threads · ${hits.length}`}>
            {hits.slice(0, 8).map((thread) => (
              <Command.Item
                key={thread.key}
                // The query rides in the value so cmdk's own scoring never
                // second-guesses what the search index already matched.
                value={`${debounced} ${thread.key}`}
                onSelect={() => openThread(thread)}
                className="data-[selected=true]:bg-fill-selected group flex h-(--wren-row-h-compact) cursor-default items-center rounded-md px-2 outline-none"
              >
                <ThreadResult
                  thread={thread}
                  account={accountsById.get(thread.accountId)}
                  selfEmails={selfEmails}
                  now={now}
                  avatar={false}
                />
              </Command.Item>
            ))}
          </Group>
        )}
      </Command.List>

      <footer className="border-hairline text-ink-3 flex h-9 shrink-0 items-center gap-4 border-t px-4 text-xs">
        <Hint keys={['↑', '↓']} label="navigate" />
        <Hint keys={['↵']} label="select" />
        <Hint keys={['esc']} label="close" />
      </footer>
    </Command>
  )
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:font-ui [&_[cmdk-group-heading]]:text-ink-3 pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs"
    >
      {children}
    </Command.Group>
  )
}

function Row({
  icon,
  label,
  hint,
  onSelect,
}: {
  icon: IconName
  label: string
  hint?: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      value={label}
      onSelect={onSelect}
      className="data-[selected=true]:bg-fill-selected data-[selected=true]:text-ink group text-ink-2 flex h-9 cursor-default items-center gap-3 rounded-md px-2 text-base outline-none"
    >
      <span className="flex w-(--wren-icon-box) shrink-0 items-center justify-center">
        <Icon
          name={icon}
          size={18}
          className="text-ink-3 group-data-[selected=true]:text-brand"
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <Keycap>{hint}</Keycap>}
    </Command.Item>
  )
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-ui text-ink-3 bg-sunken inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-xs px-1 text-xs">
      {children}
    </kbd>
  )
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <Keycap key={key}>{key}</Keycap>
      ))}
      {label}
    </span>
  )
}
