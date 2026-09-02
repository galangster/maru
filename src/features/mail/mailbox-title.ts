// What a mailbox is called, and where the name of the label behind it comes
// from.
//
// One derivation for both shells. The desktop list header used to capitalize
// `view.folder` by hand, which happens to agree with `FOLDERS` for the four
// folders that exist and would stop agreeing the moment a folder's name and
// its key differed; the phone read `FOLDERS` properly and wrote its own copy
// of the same function to do it. Both shells then wrote out the same
// find-the-label-by-id lookup a second time.

import { FOLDERS } from '@/core/defaults'
import type { Account, Label, MailView } from '@/core/types'

/** The desktop's word for the unified inbox, and the default below. */
const UNIFIED_INBOX_NAME = 'Inbox'

/**
 * The name of the user label a view is looking at.
 *
 * `undefined` for every view that is not one, and — the case that matters —
 * for the frames before the per-account labels query answers, which is what
 * `mailboxTitle`'s `?? 'Label'` fallback is for.
 */
export function labelNameFor(view: MailView, labels: Label[] | undefined): string | undefined {
  if (view.kind !== 'account') return undefined
  return labels?.find((label) => label.id === view.labelId)?.name
}

/**
 * What the mailbox on screen is called.
 *
 * The unified inbox is the one cell the two shells legitimately disagree on,
 * so its word is a parameter with the desktop's as the default — the same
 * shape as `BatchNoun` in bulk.ts, and for the same reason. The desktop calls
 * it Inbox, beside a sidebar row that says Inbox and per-account rows that say
 * "Inbox — address". The phone calls it All inboxes, because its picker lists
 * it directly above the per-account inboxes, where "Inbox" over "Personal" and
 * "Work" reads as a fourth account.
 *
 * A single account's inbox is that account, by name. It used to be titled from
 * the label lookup on the desktop, and a Gmail system label's name is its id,
 * so that header read "INBOX" in capitals.
 */
export function mailboxTitle(
  view: MailView,
  accounts: Account[],
  labelName?: string,
  unifiedInboxName: string = UNIFIED_INBOX_NAME,
): string {
  if (view.kind === 'later') return 'Later'
  if (view.kind === 'unified') {
    if (view.folder === 'inbox') return unifiedInboxName
    return FOLDERS.find((folder) => folder.folder === view.folder)?.name ?? 'Mail'
  }
  if (view.labelId === 'INBOX') {
    return accounts.find((account) => account.id === view.accountId)?.displayName ?? UNIFIED_INBOX_NAME
  }
  return labelName ?? 'Label'
}
