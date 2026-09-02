// A search hit: the compact 52 px row DIRECTION §5 reserves for results and
// palette rows. Same fixed sender column as the list, so subjects still start
// at the same x.

import { Icon } from '@/components/ui/icon'
import { AccountAvatar, DATE_COLUMN, ICON_SLOT } from '@/components/wren-controls'
import type { Thread } from '@/core/types'
import { correspondents, participantLine, relativeTime } from '@/lib/format'
import { hueFor } from '@/lib/hue'
import { cn } from '@/lib/utils'

export interface ThreadResultProps {
  thread: Thread
  selfEmails: string[]
  now: number
  /** The list shows avatars; the palette shows a mail glyph in the icon slot. */
  avatar?: boolean
  className?: string
}

export function ThreadResult({
  thread,
  selfEmails,
  now,
  avatar = true,
  className,
}: ThreadResultProps) {
  const people = correspondents(thread.participants, selfEmails)
  const lead = people[0] ?? { email: '?' }

  return (
    <span className={cn('flex w-full min-w-0 items-center gap-3', className)}>
      {avatar ? (
        <AccountAvatar address={lead} hue={hueFor(lead.email)} />
      ) : (
        <span className={ICON_SLOT}>
          <Icon
            name={thread.unread ? 'unread' : 'read'}
            size={16}
            className="text-ink-3 group-data-[selected=true]:text-brand"
          />
        </span>
      )}
      {/* A fixed column, like the inbox's — DIRECTION §1, columns line up
          across every row of a list, always. It was a *cap* (S4), which let the
          sender set the column: nine results started their subjects anywhere
          across a 76 px band and seven of the nine truncated, in the one place
          a person is hunting hardest (issue #23). The measure is its own token
          rather than the list's 152, because this row is one line and the two
          share it — see tokens.css for the 96 / 140 split. */}
      <span className="font-ui text-ink w-(--wren-result-sender-w) shrink-0 truncate text-base font-medium">
        {participantLine(people)}
      </span>
      <span className="text-ink-2 min-w-0 flex-1 truncate text-sm">
        {thread.subject || '(no subject)'}
      </span>
      {/* Same `w-16 text-right` as thread-row.tsx: "Yesterday" and "Sun" are
          different widths, and a shrink-to-fit column leaves the left edge of
          the timestamps ragged down the list — the one thing DIRECTION §1 says
          a column may never do. The rule was written on the list row and not
          applied here (S3). */}
      <span className={DATE_COLUMN}>
        {relativeTime(thread.lastMessageAt, now)}
      </span>
    </span>
  )
}
