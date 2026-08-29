// The command palette — DIRECTION §2 (Ferndesk/Vapi/Juicebox) and §7.
//
// A centered glass-strong card over a dimmed app, ~600 px, with a permanent
// keycap footer. Selection is a soft fill and an accent-tinted icon; there is
// no left bar, which is the one thing that reference set gets wrong.

import { useState } from 'react'
import { Command } from 'cmdk'

import { Icon, type IconName } from '@/components/ui/icon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Keycap } from '@/components/wren-controls'
import { FOLDERS } from '@/core/defaults'
import type { MailView, Thread } from '@/core/types'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import {
  MIN_SEARCH_LENGTH,
  useAccountsById,
  usePerformAction,
  useSearch,
  useThreads,
} from '@/features/mail/queries'
import { MOD } from '@/features/keyboard/keymap'
import { threadActions, type ThreadActionId } from '@/features/mail/thread-actions'

/** The palette lists state changes after triage, unlike the row's cluster. */
const PALETTE_ACTIONS: ThreadActionId[] = ['archive', 'trash', 'star', 'read']
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
        // Opts this one dialog out of the 200 ms spring entrance every other
        // surface gets. See features/shell/surfaces.css: the palette is a
        // 100+/day keyboard surface and has to be there before the user looks
        // (UI-REVIEW-2026-08-28 S1).
        data-wren-surface="palette"
        className="glass-strong top-[16%] flex w-[600px] max-w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 ring-0 sm:max-w-[600px]"
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
  const threads = useThreads(view)
  const action = usePerformAction()
  const results = useSearch(debounced)
  const openSettings = useSurfaces((s) => s.openSettings)
  const { compose } = useComposeActions()
  const theme = useThemeToggle()

  const { accounts: accountList, selfEmails } = useAccountsById()

  const current = (threads.data ?? []).find((t) => t.key === selected)

  const run = (fn: () => void) => {
    onClose()
    fn()
  }

  const openThread = (thread: Thread) =>
    run(() => {
      setView(viewForThread(thread))
      // A jump, not traversal: the reading pane may animate its arrival.
      setSelected(thread.key, 'pointer')
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
        <Command.Empty className="text-ink-3 mx-auto max-w-72 px-2 py-8 text-center text-sm text-pretty">
          Nothing matches “{query}”. Try a sender, a word from the subject, or a
          word from the message.
        </Command.Empty>

        <Group heading="Actions">
          <Row icon="compose" label="Compose" hint="C" onSelect={() => run(compose)} />
          {current &&
            PALETTE_ACTIONS.map((id) => {
              const spec = threadActions(current)[id]
              if (spec.disabled) return null
              return (
                <Row
                  key={spec.id}
                  icon={spec.icon}
                  label={spec.label}
                  hint={spec.hint}
                  onSelect={() =>
                    run(() => action.mutate({ type: spec.type, threadKey: current.key }))
                  }
                />
              )
            })}
          <Row
            icon={theme.next === 'dark' ? 'themeDark' : theme.next === 'light' ? 'themeLight' : 'themeSystem'}
            label={`Switch theme to ${theme.next}`}
            onSelect={() => run(theme.toggle)}
          />
          <Row icon="sync" label="Sync now" onSelect={() => run(() => void service.refresh())} />
          <Row icon="settings" label="Settings" onSelect={() => run(() => openSettings())} />
        </Group>

        <Group heading="Go to">
          {/* The folders, their names, their glyphs and their order are the
              engine's one folder table — the same one the sidebar reads, so
              ⌘1..⌘4 here cannot drift from what those keys actually do. */}
          {FOLDERS.map((folder, index) => (
            <Row
              key={folder.folder}
              icon={folder.icon}
              label={folder.name}
              hint={`${MOD}${index + 1}`}
              onSelect={() => goTo({ kind: 'unified', folder: folder.folder })}
            />
          ))}
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
                // Concentric: the palette is 24 and the list is `p-2`, so a row is 16.
                className="data-[selected=true]:bg-fill-selected group flex h-(--wren-row-h-compact) cursor-default items-center rounded-inset px-2 outline-none"
              >
                <ThreadResult
                  thread={thread}
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
      // The eyebrow — AMIE-STUDY §3. These headings are the clearest case for
      // the caps half of the role: single words, naming a section, sitting
      // above a list they own.
      className="[&_[cmdk-group-heading]]:font-ui [&_[cmdk-group-heading]]:text-ink-3 pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase"
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
      className="data-[selected=true]:bg-fill-selected data-[selected=true]:text-ink group text-ink-2 flex h-9 cursor-default items-center gap-3 rounded-inset px-2 text-base outline-none"
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
