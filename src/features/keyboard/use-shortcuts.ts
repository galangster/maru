// The keymap, bound once, at the root.
//
// What each key does is in ./keymap.ts — the same table the "?" sheet prints,
// so a shortcut cannot be bound and undocumented. This file is only the
// binding: which handler an id runs, and the three rules about when the keymap
// stands down.
//
// Everything is ignored while the user is typing, and while a dialog owns the
// screen. Cmd/Ctrl+K is the one exception: a palette you cannot reach from a
// text field is not a palette. Cmd/Ctrl+Enter is composer-scoped and lives in
// the composer, which is the only place it means anything.
//
// The listener is registered once, with no dependencies. It reads the current
// view, selection and thread list at the moment a key is pressed rather than
// closing over them: a handler rebuilt on every keystroke of the search field
// tore down and re-added a window listener each time.

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { UNIFIED_ORDER } from '@/core/defaults'
import type { MailActionType, Thread } from '@/core/types'
import { requestComposerClose } from '@/features/compose/compose-store'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import {
  keys as queryKeys,
  registerActionUndo,
  showUndoToast,
  usePerformAction,
} from '@/features/mail/queries'
import { threadActions } from '@/features/mail/thread-actions'
import { useUi } from '@/features/mail/ui-store'
import { bulkAction, isBulkAction } from '@/features/list/bulk'
import { nextAfterRemoval, visibleThreadsSnapshot } from '@/features/list/list-prefs'
import { anyDialogOpen, useSurfaces } from '@/features/shell/surface-store'
import { playSound } from '@/lib/sound'
import { announcesItself, UNDO_LABELS, UNDO_TOAST_ID } from '@/lib/undo'

import { SHORTCUTS_BY_KEY, type ShortcutId } from './keymap'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** The per-render values a handler needs but must not close over. */
interface Live {
  act: (type: MailActionType) => void
  markRead: (threadKey: string) => void
  compose: () => void
  reply: (mode: 'reply' | 'replyAll' | 'forward') => void
  threads: () => Thread[]
}

export function useShortcuts() {
  const action = usePerformAction()
  const { compose, replyToSelected } = useComposeActions()
  const client = useQueryClient()

  const live = useRef<Live>(null as unknown as Live)
  live.current = {
    act: (type) => {
      // Checked threads turn the triage keys into batch verbs — pressing `e`
      // with twelve threads marked archives the twelve, not the one under the
      // cursor. Star stays per-thread; with nothing checked, bulkAction acts
      // on nothing and reports zero, and the key falls through to the row.
      if (isBulkAction(type) && bulkAction((a) => action.mutate(a), live.current.threads(), type) > 0)
        return
      const selected = useUi.getState().selected
      if (!selected) return
      // Removing the thread you are on selects the next one *first*, so the
      // reading pane is already showing it when the row leaves — e, e, e.
      if (type === 'archive' || type === 'trash') {
        const follow = nextAfterRemoval(live.current.threads(), selected)
        useUi.getState().setSelected(follow, 'keyboard')
      }
      const next = { type, threadKey: selected }
      action.mutate(next)
      // Every triage key is a deliberate press, so every one is undoable. The
      // two that remove a thread from view also say so out loud, because the
      // keyboard path has no row animation to stand in for the confirmation.
      registerActionUndo(action.mutate, next)
      // Every action that moves a thread between mailboxes says so, restore
      // from trash included: the keyboard path has no row animation to stand
      // in for the confirmation, and a key that seems to do nothing is worse
      // than the action it performed (issue 5).
      if (!announcesItself(type)) return
      showUndoToast(UNDO_LABELS[type])
    },
    markRead: (threadKey) => action.mutate({ type: 'markRead', threadKey }),
    compose,
    reply: replyToSelected,
    // Through the lens, not the raw query: j/k and advance-on-archive must
    // walk the same list the person is looking at (M7's filter and sort).
    threads: () => visibleThreadsSnapshot(client),
  }

  useEffect(() => {
    const move = (delta: number) => {
      const list = live.current.threads()
      if (list.length === 0) return
      const { selected, setSelected } = useUi.getState()
      const index = list.findIndex((t) => t.key === selected)
      const next = index === -1 ? (delta > 0 ? 0 : list.length - 1) : index + delta
      const thread = list[Math.min(Math.max(next, 0), list.length - 1)]
      // Traversal, not a jump: the reading pane cuts straight to the new thread
      // rather than crossfading. Held j down a mailbox, a 200 ms fade per row
      // reads as lag, and the content is legible before it finishes (S1).
      setSelected(thread.key, 'keyboard')
      if (thread.unread) live.current.markRead(thread.key)
    }

    /** The thread the keymap is about: the selected row, as it stands now. */
    const currentThread = (): Thread | undefined => {
      const selected = useUi.getState().selected
      return selected ? live.current.threads().find((t) => t.key === selected) : undefined
    }

    const run: Record<ShortcutId, () => void> = {
      next: () => move(1),
      prev: () => move(-1),
      open: () => {
        const selected = useUi.getState().selected
        if (!selected) {
          move(1)
          return
        }
        const current = currentThread()
        // `markRead`, not `act('markRead')`: opening a thread is not a triage
        // decision, and offering to undo it would put ⌘Z on the last thing the
        // user *read* rather than on the last thing they did.
        if (current?.unread) live.current.markRead(selected)
        document.querySelector<HTMLElement>('section[aria-label="Reading"]')?.focus()
      },
      // The four triage keys read their action off the same descriptor the
      // row, the toolbar and the palette render, so `#` on a trashed thread
      // restores it for exactly the reason the button says it will.
      archive: () => live.current.act('archive'),
      // `h` opens the PICKER rather than taking a default, and that is the
      // correct division rather than a consolation prize: the keyboard has
      // digits, so `h` `2` is two keystrokes and chooses. With threads checked
      // it opens on the batch, exactly as `e` archives the batch.
      later: () => {
        const ui = useUi.getState()
        const visible = live.current.threads()
        const checked = visible.filter((t) => ui.checked.has(t.key))
        if (checked.length > 0) {
          useSurfaces.getState().openLater(checked.map((t) => t.key), true)
          return
        }
        // Disabled means there is nothing to defer — a trashed thread, or one
        // already out of the inbox. Silently doing nothing is the honest answer;
        // the picker would be a menu with no effect.
        withThread((t) => {
          if (!threadActions(t).later.disabled) useSurfaces.getState().openLater([t.key])
        })
      },
      select: () => withThread((t) => useUi.getState().toggleChecked(t.key)),
      trash: () => withThread((t) => live.current.act(threadActions(t).trash.type)),
      star: () => withThread((t) => live.current.act(threadActions(t).star.type)),
      read: () => withThread((t) => live.current.act(threadActions(t).read.type)),
      compose: () => live.current.compose(),
      reply: () => live.current.reply('reply'),
      replyAll: () => live.current.reply('replyAll'),
      forward: () => live.current.reply('forward'),
      search: () => useSurfaces.getState().openSearch(),
      // The approval queue, from the keyboard. It opens whether or not anything
      // is waiting — the badge is absent at zero, so this is the only way in to
      // an empty queue, and "nothing is waiting" is an answer worth being able
      // to ask for (S9).
      approvals: () => useSurfaces.getState().setApprovals(true),
      // Blunt on purpose: from the derived default it opens everything, and a
      // second press folds the thread to its spine. The pane interprets.
      expandAll: () => {
        const ui = useUi.getState()
        if (!ui.selected) return
        ui.setReadingExpansion(ui.readingExpansion === 'all' ? 'none' : 'all')
      },
      help: () => useSurfaces.getState().setShortcuts(true),
      // `z`, Gmail's unmodified undo. ⌘Z runs the same body ahead of the
      // table because it must also work with a dialog up.
      undo: () => {
        const label = useUi.getState().runUndo()
        if (label) toast('Undone', { id: UNDO_TOAST_ID, description: label })
      },
      // Handled ahead of the table, because they carry modifiers, need the
      // event, or must fire while typing. Listed so the record stays
      // exhaustive.
      folders: () => {},
      palette: () => {},
      send: () => {},
      escape: () => {},
      scan: () => {},
      settings: () => {},
      toggleSidebar: () => {},
    }

    /** A triage key with nothing selected is a no-op, not a crash. */
    function withThread(fn: (thread: Thread) => void): void {
      const thread = currentThread()
      if (thread) fn(thread)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // ⌥⌘S — Apple's own Show/Hide Sidebar chord, and the discoverability the
      // toggle lost when it left the titlebar for the sidebar footer.
      //
      // It has to sit ABOVE the `altKey` bail below, which drops every Option
      // chord before anything else runs. And it has to match on `event.code`:
      // ⌥S emits 'ß' on the US layout, so `event.key` is never 's'.
      if (event.altKey && (event.metaKey || event.ctrlKey) && event.code === 'KeyS') {
        event.preventDefault()
        useUi.getState().toggleSidebar()
        return
      }

      if (event.altKey) return

      // The palette answers from anywhere, including a text field — but it
      // *replaces* whatever surface is up rather than landing on top of it.
      //
      // Opening the shortcut sheet and pressing ⌘K used to leave two
      // role="dialog" nodes at the same z-index with overlapping rectangles,
      // two glass layers and two scrims: focus containment between them is
      // undefined and DIRECTION §7 rule 1 calls a third glass layer "a bug"
      // (UI-REVIEW-2026-08-28 B2). The composer already solved this by dropping
      // its blur while a dialog is open; only the palette broke the rule.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const surfaces = useSurfaces.getState()
        if (surfaces.settings || surfaces.shortcuts || surfaces.onboarding) {
          useSurfaces.setState({ settings: null, shortcuts: false, onboarding: false })
        }
        const opening = !surfaces.palette
        surfaces.setPalette(opening)
        // A near-subliminal tick on open only — 3 ms of texture, not a sound
        // (SOUNDS.md §2). Closing is not an arrival and gets nothing.
        if (opening) playSound('palette')
        return
      }

      // A dialog owns the screen and its own Escape.
      if (anyDialogOpen()) return

      // ⌘Z / Ctrl+Z — the most recent undoable, if it is still inside its 10 s
      // window. Ignored while typing, without exception: inside a text field
      // and inside the composer's editor ⌘Z belongs to that field's own
      // history, and stealing it to unarchive something across the app is the
      // worst possible answer to the key.
      //
      // ⇧⌘Z is left alone. There is no redo, and swallowing the key to do
      // nothing is worse than letting it through.
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        if (isTyping(event.target)) return
        event.preventDefault()
        const label = useUi.getState().runUndo()
        if (label) toast('Undone', { id: UNDO_TOAST_ID, description: label })
        return
      }

      if (event.metaKey || event.ctrlKey) {
        // The universal chords (Nick, 2026-08-29). ⌘⌫ respects a text field's
        // own delete; the other three are app-level everywhere, which is how
        // every Mac app treats ⌘N, ⌘, and ⌘F.
        if (event.key === 'Backspace') {
          if (isTyping(event.target)) return
          event.preventDefault()
          withThread((t) => live.current.act(threadActions(t).trash.type))
          return
        }
        const chord = event.key.toLowerCase()
        if (chord === 'n') {
          event.preventDefault()
          live.current.compose()
          return
        }
        if (chord === ',') {
          event.preventDefault()
          useSurfaces.getState().openSettings()
          return
        }
        if (chord === 'f') {
          event.preventDefault()
          useSurfaces.getState().openSearch()
          return
        }
        const index = Number(event.key) - 1
        if (Number.isInteger(index) && index >= 0 && index < UNIFIED_ORDER.length) {
          event.preventDefault()
          useUi.getState().setView({ kind: 'unified', folder: UNIFIED_ORDER[index] })
          return
        }
        // ⌘5 — Later, immediately after the four folders. It is handled as its
        // own destination rather than by growing UNIFIED_ORDER, because that
        // table is the Gmail system labels and Later is not one of them.
        if (index === UNIFIED_ORDER.length) {
          event.preventDefault()
          useUi.getState().setView({ kind: 'later' })
        }
        return
      }

      if (isTyping(event.target)) return

      // Space reads; at the end of the thread it advances. Shift+Space reads
      // backwards. The overlap keeps the previous screenful's last lines in
      // view, the way every mail reader since Usenet has paged.
      if (event.key === ' ') {
        event.preventDefault()
        const pane = document.querySelector<HTMLElement>('[data-reading-scroll]')
        const dir = event.shiftKey ? -1 : 1
        if (pane && pane.scrollHeight - pane.clientHeight > 1) {
          const atEnd = dir > 0 && pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1
          const atStart = dir < 0 && pane.scrollTop <= 0
          if (!atEnd && !atStart) {
            pane.scrollBy({ top: dir * (pane.clientHeight - 80), behavior: 'smooth' })
            return
          }
        }
        run[dir > 0 ? 'next' : 'prev']()
        return
      }

      // Topmost first: the search bar, then a pending batch, then the composer.
      if (event.key === 'Escape') {
        if (useSurfaces.getState().searchOpen) {
          event.preventDefault()
          useSurfaces.getState().closeSearch()
          return
        }
        if (useUi.getState().checked.size > 0) {
          event.preventDefault()
          useUi.getState().clearChecked()
          return
        }
        if (requestComposerClose()) event.preventDefault()
        return
      }

      const id = SHORTCUTS_BY_KEY[event.key]
      if (!id) return
      event.preventDefault()
      run[id]()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
