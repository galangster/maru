// Which view a thread belongs to.
//
// A search result can come from any folder of any account, and "open it" has
// to mean "show me where it lives" rather than "show it in whatever I happen
// to be looking at". The precedence and the labels are the engine's one folder
// table, so this cannot name a folder the sidebar does not have.

import { FOLDER_LABELS, FOLDER_PRECEDENCE } from '@/core/defaults'
import type { MailView, Thread } from '@/core/types'

export function viewForThread(thread: Thread): MailView {
  const labels = thread.labelIds
  for (const folder of FOLDER_PRECEDENCE) {
    if (labels.includes(FOLDER_LABELS[folder])) return { kind: 'unified', folder }
  }
  const userLabel = labels.find((l) => !l.startsWith('CATEGORY_') && l !== 'UNREAD')
  return { kind: 'account', accountId: thread.accountId, labelId: userLabel ?? 'INBOX' }
}
