// The mailboxes the phone can reach, and what each one is called.
//
// Derived from the desktop's own tables rather than re-declared: `FOLDERS` is
// the one unified-folder table (its order is the sidebar's order and ⌘1..⌘4),
// and Later sits BELOW it exactly as it does in the sidebar, because `FOLDERS`
// is the Gmail-system-label table and Later is not one of those labels.
//
// Pure, so the whole lens can be checked without a phone —
// tests/mobile-mailboxes.test.ts.

import type { IconName } from '@/components/ui/icon'
import { FOLDERS } from '@/core/defaults'
import type { Account, Label, MailView } from '@/core/types'
import { mailboxTitle } from '@/features/mail/mailbox-title'
import { viewKey } from '@/features/mail/ui-store'

export interface MobileMailbox {
  /**
   * Stable id for the row. It is the desktop's own `viewKey`, not a second
   * spelling of the same thing — the picker's checkmark compares these, and a
   * private key here is how the phone would come to disagree with the query
   * cache about which two views are the same view.
   */
  key: string
  name: string
  icon: IconName
  view: MailView
}

export interface MobileMailboxSection {
  title: string
  mailboxes: MobileMailbox[]
}

/** Where the list starts, and where the Inbox tab always lands. */
export const UNIFIED_INBOX: MailView = { kind: 'unified', folder: 'inbox' }
const LATER_VIEW: MailView = { kind: 'later' }

/**
 * What the phone calls the unified inbox. Not the desktop's word: the picker
 * lists it directly above the per-account inboxes, where "Inbox" over
 * "Personal" and "Work" reads as a fourth account.
 */
export const ALL_INBOXES = 'All inboxes'

/**
 * The glyph a mailbox is drawn with, wherever it is drawn — a picker row, or
 * the hero of its own empty state. Derived from the view rather than carried
 * beside it, so the two cannot show the same mailbox as two different things.
 */
export function mailboxIcon(view: MailView): IconName {
  if (view.kind === 'later') return 'calendar'
  if (view.kind === 'unified') {
    return FOLDERS.find((folder) => folder.folder === view.folder)?.icon ?? 'inbox'
  }
  return view.labelId === 'INBOX' ? 'inbox' : 'listBullet'
}

function mailbox(name: string, view: MailView): MobileMailbox {
  return { key: viewKey(view), name, icon: mailboxIcon(view), view }
}

/**
 * The two fixed sections of the picker: every inbox, then every other place
 * mail can be.
 *
 * The per-account label sections are NOT here. Labels are one query per
 * account, so they are asked for by the rows that draw them and joined through
 * `labelMailboxes` — this half stays pure and stays synchronous.
 */
export function mailboxSections(accounts: Account[]): MobileMailboxSection[] {
  const inboxes = [mailbox(ALL_INBOXES, UNIFIED_INBOX)]
  for (const account of accounts) {
    inboxes.push(
      mailbox(account.displayName, {
        kind: 'account',
        accountId: account.id,
        labelId: 'INBOX',
      }),
    )
  }

  const others = FOLDERS.filter((folder) => folder.folder !== 'inbox').map((folder) =>
    mailbox(folder.name, { kind: 'unified', folder: folder.folder }),
  )
  others.push(mailbox('Later', LATER_VIEW))

  return [
    { title: 'Inboxes', mailboxes: inboxes },
    { title: 'Mailboxes', mailboxes: others },
  ]
}

/**
 * One account's user labels as mailboxes. The caller hands in the user labels
 * — `useUserLabels` is where the system ones are dropped, for every label
 * surface at once. System labels are the FOLDERS table above.
 */
export function labelMailboxes(accountId: string, userLabels: Label[]): MobileMailbox[] {
  return userLabels.map((label) =>
    mailbox(label.name, { kind: 'account', accountId, labelId: label.id }),
  )
}

/**
 * What the inbox header calls the mailbox on screen — the desktop's own
 * `mailboxTitle`, in the phone's word for the unified inbox.
 */
export function mobileMailboxTitle(
  view: MailView,
  accounts: Account[],
  labelName?: string,
): string {
  return mailboxTitle(view, accounts, labelName, ALL_INBOXES)
}
