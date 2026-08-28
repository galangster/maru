// The keymap. Registered once, at the root.
//
//   j / k        move down / up the list
//   Enter        open the selection (and hand focus to the reading pane)
//   e            archive        #  trash
//   s            star           u  toggle read
//   c            compose        r  reply      a  reply all   f  forward
//   /            focus search   ?  this list
//   cmd/ctrl k   command palette
//   cmd/ctrl 1-4 unified views
//   Esc          close the topmost surface
//
// Everything is ignored while the user is typing, and while a dialog owns the
// screen. Cmd/Ctrl+K is the one exception: a palette you cannot reach from a
// text field is not a palette. Cmd/Ctrl+Enter is composer-scoped and lives in
// the composer, which is the only place it means anything.

import { useEffect } from 'react'

import type { MailActionType, Thread } from '@/core/types'
import { requestComposerClose } from '@/features/compose/compose-store'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import { usePerformAction, useThreads } from '@/features/mail/queries'
import { UNIFIED_ORDER, useUi } from '@/features/mail/ui-store'
import { anyDialogOpen, useSurfaces } from '@/features/shell/surface-store'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useShortcuts() {
  const view = useUi((s) => s.view)
  const selected = useUi((s) => s.selected)
  const setSelected = useUi((s) => s.setSelected)
  const setView = useUi((s) => s.setView)
  const threads = useThreads(view)
  const action = usePerformAction()
  const { compose, replyToSelected } = useComposeActions()

  const setPalette = useSurfaces((s) => s.setPalette)
  const setShortcuts = useSurfaces((s) => s.setShortcuts)
  const openSearch = useSurfaces((s) => s.openSearch)
  const closeSearch = useSurfaces((s) => s.closeSearch)

  useEffect(() => {
    const list: Thread[] = threads.data ?? []

    const move = (delta: number) => {
      if (list.length === 0) return
      const index = list.findIndex((t) => t.key === selected)
      const next = index === -1 ? (delta > 0 ? 0 : list.length - 1) : index + delta
      const clamped = Math.min(Math.max(next, 0), list.length - 1)
      const thread = list[clamped]
      setSelected(thread.key)
      if (thread.unread) action.mutate({ type: 'markRead', threadKey: thread.key })
    }

    const act = (type: MailActionType) => {
      if (!selected) return
      action.mutate({ type, threadKey: selected })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) return

      // The palette answers from anywhere, including a text field.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPalette(!useSurfaces.getState().palette)
        return
      }

      // A dialog owns the screen and its own Escape.
      if (anyDialogOpen()) return

      if (event.metaKey || event.ctrlKey) {
        const index = Number(event.key) - 1
        if (Number.isInteger(index) && index >= 0 && index < UNIFIED_ORDER.length) {
          event.preventDefault()
          setView({ kind: 'unified', folder: UNIFIED_ORDER[index] })
        }
        return
      }

      if (isTyping(event.target)) return

      // Topmost first: the search bar, then the composer.
      if (event.key === 'Escape') {
        if (useSurfaces.getState().searchOpen) {
          event.preventDefault()
          closeSearch()
          return
        }
        if (requestComposerClose()) event.preventDefault()
        return
      }

      const current = list.find((t) => t.key === selected)

      switch (event.key) {
        case 'j':
          event.preventDefault()
          move(1)
          break
        case 'k':
          event.preventDefault()
          move(-1)
          break
        case 'Enter': {
          if (!selected) {
            event.preventDefault()
            move(1)
            break
          }
          event.preventDefault()
          if (current?.unread) act('markRead')
          document.querySelector<HTMLElement>('section[aria-label="Reading"]')?.focus()
          break
        }
        case 'e':
          event.preventDefault()
          act('archive')
          break
        case '#':
          event.preventDefault()
          act(current?.labelIds.includes('TRASH') ? 'untrash' : 'trash')
          break
        case 's':
          event.preventDefault()
          act(current?.starred ? 'unstar' : 'star')
          break
        case 'u':
          event.preventDefault()
          act(current?.unread ? 'markRead' : 'markUnread')
          break
        case 'c':
          event.preventDefault()
          compose()
          break
        case 'r':
          event.preventDefault()
          replyToSelected('reply')
          break
        case 'a':
          event.preventDefault()
          replyToSelected('replyAll')
          break
        case 'f':
          event.preventDefault()
          replyToSelected('forward')
          break
        case '/':
          event.preventDefault()
          openSearch()
          break
        case '?':
          event.preventDefault()
          setShortcuts(true)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    threads.data,
    selected,
    setSelected,
    setView,
    action,
    compose,
    replyToSelected,
    setPalette,
    setShortcuts,
    openSearch,
    closeSearch,
  ])
}
