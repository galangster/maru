// Which view a thread belongs to.
//
// A search result can come from any folder of any account, and "open it" has
// to mean "show me where it lives" rather than "show it in whatever I happen
// to be looking at". Same precedence the sidebar lists its folders in.

import type { MailView, Thread } from '@/core/types'

export function viewForThread(thread: Thread): MailView {
  const labels = thread.labelIds
  if (labels.includes('TRASH')) return { kind: 'unified', folder: 'trash' }
  if (labels.includes('INBOX')) return { kind: 'unified', folder: 'inbox' }
  if (labels.includes('SENT')) return { kind: 'unified', folder: 'sent' }
  if (labels.includes('STARRED')) return { kind: 'unified', folder: 'starred' }
  const userLabel = labels.find((l) => !l.startsWith('CATEGORY_') && l !== 'UNREAD')
  return { kind: 'account', accountId: thread.accountId, labelId: userLabel ?? 'INBOX' }
}
