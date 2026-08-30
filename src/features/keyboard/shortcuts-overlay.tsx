// The "?" sheet. A small card listing everything the keymap answers to,
// grouped the way the hands are: move, triage, write, everything else.
//
// Opaque, with the ring-plus-shadow recipe. Glass is the command palette and
// the composer only (owner ruling, 2026-08-28), and this surface is a table to
// be read — DIRECTION §1 already refuses glass behind text that must be read.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Keycap, SECTION_LABEL } from '@/components/wren-controls'
import { focusThreadList, useSurfaces } from '@/features/shell/surface-store'

import { SHORTCUT_GROUPS, shortcutsIn } from './keymap'

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
        className="bg-raised rounded-xl shadow-lg w-[520px] max-w-[calc(100%-2rem)] gap-0 border-0 p-6 ring-0 sm:max-w-[520px]"
      >
        <DialogTitle className="font-ui text-ink pb-4 text-base font-semibold">
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription className="sr-only">
          Every key Maru answers to, grouped by what it does.
        </DialogDescription>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6">
          {/* Rows come from the keymap table use-shortcuts binds, so a key
              cannot be documented here and dead there, or the reverse. */}
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group} className="flex flex-col gap-2">
              {/* The eyebrow — AMIE-STUDY §3. One word naming the section it owns. */}
              <h3 className={SECTION_LABEL}>{group}</h3>
              <ul className="flex flex-col gap-2">
                {shortcutsIn(group).map((shortcut) => (
                  <li key={shortcut.id} className="flex items-center gap-2">
                    {/* A fixed 72 px column, right-aligned against the labels.
                        The cluster used to be `shrink-0` with no width, so a
                        label's x was a function of its keycap text and the
                        "Move" column drifted 46.9 px on the ⌘1 … ⌘4 row (S5).
                        This is the one surface whose whole job is to be scanned
                        as a table, and it was the one place DIRECTION §1's
                        column rule was broken outright. 72 clears the 66.9 px
                        worst case and sits on the 4 px grid. */}
                    <span className="flex w-18 shrink-0 items-center justify-end gap-1">
                      {shortcut.keys.map((key, index) => (
                        <span key={key} className="flex items-center gap-1">
                          {index > 0 && <span className="text-ink-3 text-xs">…</span>}
                          <Keycap className="text-ink-2">{key}</Keycap>
                        </span>
                      ))}
                    </span>
                    <span className="text-ink-2 min-w-0 flex-1 truncate text-sm">
                      {shortcut.label}
                    </span>
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
