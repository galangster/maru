// The "?" sheet. A small glass card listing everything the keymap answers to,
// grouped the way the hands are: move, triage, write, everything else.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { focusThreadList, useSurfaces } from '@/features/shell/surface-store'
import { platformOS } from '@/lib/env'

const MOD = platformOS === 'mac' ? '⌘' : 'Ctrl'

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Move',
    rows: [
      [['J'], 'Next thread'],
      [['K'], 'Previous thread'],
      [['↵'], 'Open the selection'],
      [[`${MOD}1`, `${MOD}4`], 'Inbox … Trash'],
    ],
  },
  {
    title: 'Triage',
    rows: [
      [['E'], 'Archive'],
      [['#'], 'Trash or restore'],
      [['S'], 'Star'],
      [['U'], 'Read / unread'],
    ],
  },
  {
    title: 'Write',
    rows: [
      [['C'], 'Compose'],
      [['R'], 'Reply'],
      [['A'], 'Reply all'],
      [['F'], 'Forward'],
      [[`${MOD}↵`], 'Send'],
    ],
  },
  {
    title: 'Find',
    rows: [
      [[`${MOD}K`], 'Command palette'],
      [['/'], 'Search mail'],
      [['?'], 'Show this list'],
      [['esc'], 'Close the top surface'],
    ],
  },
]

export function ShortcutsOverlay() {
  const open = useSurfaces((s) => s.shortcuts)
  const setShortcuts = useSurfaces((s) => s.setShortcuts)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setShortcuts(next)
        if (!next) focusThreadList()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="glass wren-fixed w-[520px] max-w-[calc(100%-2rem)] gap-0 p-6 ring-0 sm:max-w-[520px]"
      >
        <DialogTitle className="font-ui text-ink pb-4 text-base font-semibold">
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription className="sr-only">
          Every key Wren answers to, grouped by what it does.
        </DialogDescription>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6">
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <h3 className="font-ui text-ink-3 text-xs">{group.title}</h3>
              <ul className="flex flex-col gap-2">
                {group.rows.map(([keys, label]) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1">
                      {keys.map((key, index) => (
                        <span key={key} className="flex items-center gap-1">
                          {index > 0 && <span className="text-ink-3 text-xs">…</span>}
                          <kbd className="font-ui text-ink-2 bg-sunken inline-flex h-5 min-w-5 items-center justify-center rounded-xs px-1 text-xs">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </span>
                    <span className="text-ink-2 min-w-0 flex-1 truncate text-sm">{label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
