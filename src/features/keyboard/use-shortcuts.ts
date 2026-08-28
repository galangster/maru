// Keyboard basics. Registered once, at the root.
//
//   j / k        move down / up the list
//   Enter        open the selection (and hand focus to the reading pane)
//   e            archive        #  trash
//   s            star           u  toggle read
//   cmd/ctrl 1-4 unified views
//
// Everything is ignored while the user is typing.

import { useEffect } from 'react'

import type { MailActionType, Thread } from '@/core/types'
import { usePerformAction, useThreads } from '@/features/mail/queries'
import { UNIFIED_ORDER, useUi } from '@/features/mail/ui-store'

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
      if (isTyping(event.target) || event.altKey) return

      if (event.metaKey || event.ctrlKey) {
        const index = Number(event.key) - 1
        if (Number.isInteger(index) && index >= 0 && index < UNIFIED_ORDER.length) {
          event.preventDefault()
          setView({ kind: 'unified', folder: UNIFIED_ORDER[index] })
        }
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
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [threads.data, selected, setSelected, setView, action])
}
