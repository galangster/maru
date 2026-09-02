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

const UNIFIED_INBOX: MailView = { kind: 'unified', folder: 'inbox' }
const LATER_VIEW: MailView = { kind: 'later' }

function mailbox(name: string, icon: IconName, view: MailView): MobileMailbox {
  return { key: viewKey(view), name, icon, view }
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
  const inboxes = [mailbox('All inboxes', 'inbox', UNIFIED_INBOX)]
  for (const account of accounts) {
    inboxes.push(
      mailbox(account.displayName, 'inbox', {
        kind: 'account',
        accountId: account.id,
        labelId: 'INBOX',
      }),
    )
  }

  const others = FOLDERS.filter((folder) => folder.folder !== 'inbox').map((folder) =>
    mailbox(folder.name, folder.icon, { kind: 'unified', folder: folder.folder }),
  )
  others.push(mailbox('Later', 'calendar', LATER_VIEW))

  return [
    { title: 'Inboxes', mailboxes: inboxes },
    { title: 'Mailboxes', mailboxes: others },
  ]
}

/** One account's user labels as mailboxes. System labels are the FOLDERS above. */
export function labelMailboxes(accountId: string, labels: Label[]): MobileMailbox[] {
  return labels
    .filter((label) => label.type === 'user')
    .map((label) =>
      mailbox(label.name, 'listBullet', { kind: 'account', accountId, labelId: label.id }),
    )
}

/**
 * What the inbox header calls the mailbox on screen — the phone's twin of the
 * desktop list header's title, including its `?? 'Label'` fallback for a label
 * whose name has not arrived yet.
 */
export function mailboxTitle(view: MailView, accounts: Account[], labelName?: string): string {
  if (view.kind === 'later') return 'Later'
  if (view.kind === 'unified') {
    if (view.folder === 'inbox') return 'All inboxes'
    return FOLDERS.find((folder) => folder.folder === view.folder)?.name ?? 'Mail'
  }
  if (view.labelId === 'INBOX') {
    return accounts.find((account) => account.id === view.accountId)?.displayName ?? 'Inbox'
  }
  return labelName ?? 'Label'
}

/**
 * What an empty mailbox says. One table, because "Nothing here" four times
 * over is the shape of a list that does not know what it holds — and because
 * three of these four are the only place the phone explains what the mailbox
 * is FOR.
 *
 * The inbox is deliberately absent: inbox zero earns the character and its own
 * copy, and this is what every other mailbox gets instead.
 */
export function emptyMailboxCopy(view: MailView, title: string): { title: string; copy: string } {
  if (view.kind === 'later') {
    return {
      title: 'Nothing saved for later',
      copy: 'Swipe a conversation left to put it off until a better time. It comes back to your inbox on its own.',
    }
  }
  if (view.kind === 'unified') {
    if (view.folder === 'sent') return { title: 'Nothing sent yet', copy: 'Messages you send show up here.' }
    if (view.folder === 'trash') return { title: 'Trash is empty', copy: 'Conversations you delete wait here before they go.' }
    if (view.folder === 'starred') return { title: 'Nothing starred', copy: 'Star a conversation to keep it within reach.' }
  }
  return { title: `Nothing in ${title}`, copy: 'Mail with this label shows up here.' }
}
