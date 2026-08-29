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
import { keys as queryKeys, registerActionUndo, usePerformAction } from '@/features/mail/queries'
import { threadActions } from '@/features/mail/thread-actions'
import { useUi } from '@/features/mail/ui-store'
import { anyDialogOpen, useSurfaces } from '@/features/shell/surface-store'
import { playSound } from '@/lib/sound'
import { UNDO_TOAST_ID } from '@/lib/undo'

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
      const selected = useUi.getState().selected
      if (!selected) return
      const next = { type, threadKey: selected }
      action.mutate(next)
      // Every triage key is a deliberate press, so every one is undoable. The
      // two that remove a thread from view also say so out loud, because the
      // keyboard path has no row animation to stand in for the confirmation.
      registerActionUndo(action.mutate, next)
      if (type !== 'archive' && type !== 'trash') return
      toast(type === 'archive' ? 'Archived' : 'Moved to trash', {
        id: UNDO_TOAST_ID,
        action: { label: 'Undo', onClick: () => useUi.getState().runUndo() },
      })
    },
    markRead: (threadKey) => action.mutate({ type: 'markRead', threadKey }),
    compose,
    reply: replyToSelected,
    threads: () => client.getQueryData<Thread[]>(queryKeys.threads(useUi.getState().view)) ?? [],
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
      trash: () => withThread((t) => live.current.act(threadActions(t).trash.type)),
      star: () => withThread((t) => live.current.act(threadActions(t).star.type)),
      read: () => withThread((t) => live.current.act(threadActions(t).read.type)),
      compose: () => live.current.compose(),
      reply: () => live.current.reply('reply'),
      replyAll: () => live.current.reply('replyAll'),
      forward: () => live.current.reply('forward'),
      search: () => useSurfaces.getState().openSearch(),
      help: () => useSurfaces.getState().setShortcuts(true),
      // Handled ahead of the table, because they must also fire while typing
      // or while a surface is up. Listed so the record stays exhaustive.
      folders: () => {},
      palette: () => {},
      send: () => {},
      escape: () => {},
      undo: () => {},
    }

    /** A triage key with nothing selected is a no-op, not a crash. */
    function withThread(fn: (thread: Thread) => void): void {
      const thread = currentThread()
      if (thread) fn(thread)
    }

    const onKeyDown = (event: KeyboardEvent) => {
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
        const index = Number(event.key) - 1
        if (Number.isInteger(index) && index >= 0 && index < UNIFIED_ORDER.length) {
          event.preventDefault()
          useUi.getState().setView({ kind: 'unified', folder: UNIFIED_ORDER[index] })
        }
        return
      }

      if (isTyping(event.target)) return

      // Topmost first: the search bar, then the composer.
      if (event.key === 'Escape') {
        if (useSurfaces.getState().searchOpen) {
          event.preventDefault()
          useSurfaces.getState().closeSearch()
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
