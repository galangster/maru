// The four ways a composer opens: a blank one, and the three reply modes on
// the current selection. One hook, so the reading pane, the keyboard layer and
// the command palette cannot disagree about what `r` means.

import { useCallback } from 'react'

import { useAccounts, useThread } from '@/features/mail/queries'
import { useUi } from '@/features/mail/ui-store'
import { deriveRecipients, quoteOriginal, replySubject, type ReplyMode } from '@/lib/compose'
import { fullTimestamp } from '@/lib/format'

import { useComposer } from './compose-store'

export interface ComposeActions {
  compose: () => void
  replyTo: (detail: NonNullable<ReturnType<typeof useThread>['data']>, mode: ReplyMode) => void
  /** Opens a reply on the selected thread. A no-op when nothing is open. */
  replyToSelected: (mode: ReplyMode) => void
  canReply: boolean
}

export function useComposeActions(): ComposeActions {
  const selected = useUi((s) => s.selected)
  const detail = useThread(selected)
  const accounts = useAccounts()
  const openWith = useComposer((s) => s.openWith)

  const data = detail.data
  const accountList = accounts.data

  const compose = useCallback(() => openWith({}), [openWith])

  const replyTo = useCallback(
    (replyDetail: NonNullable<typeof data>, mode: ReplyMode) => {
      const { thread, messages } = replyDetail
      const message = messages[messages.length - 1]
      if (!message) return
      const selfEmails = (accountList ?? []).map((account) => account.email)
      const { to, cc } = deriveRecipients(message, mode, selfEmails)
      openWith({
        accountId: thread.accountId,
        to,
        cc,
        subject: replySubject(thread.subject, mode),
        bodyHtml: quoteOriginal(message, mode, fullTimestamp),
        reply: { threadKey: thread.key, messageId: message.id, mode },
      })
    },
    [accountList, openWith],
  )

  const replyToSelected = useCallback(
    (mode: ReplyMode) => {
      if (!data) return
      replyTo(data, mode)
    },
    [data, replyTo],
  )

  return { compose, replyTo, replyToSelected, canReply: Boolean(data) }
}
