// A search hit: the compact 52 px row DIRECTION §5 reserves for results and
// palette rows. Same fixed sender column as the list, so subjects still start
// at the same x.

import { Icon } from '@/components/ui/icon'
import { AccountAvatar } from '@/components/wren-controls'
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
        <span className="flex w-(--wren-icon-box) shrink-0 items-center justify-center">
          <Icon
            name={thread.unread ? 'unread' : 'read'}
            size={16}
            className="text-ink-3 group-data-[selected=true]:text-brand"
          />
        </span>
      )}
      {/* A *cap*, not a fixed column. The 152 px measure is right for the
          two-line list row, where the subject lives on line 2 at full width; on
          a one-line result the sender and the subject share the line, and the
          fixed column left ~97 px of dead space inside it while the subject
          truncated at 14 characters (S4). Alignment across results is carried
          by the avatar on the left and the fixed time column on the right. */}
      <span className="font-ui text-ink max-w-(--wren-list-sender-w) shrink-0 truncate text-base font-medium">
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
      <span className="text-ink-3 w-16 shrink-0 text-right text-xs tabular-nums">
        {relativeTime(thread.lastMessageAt, now)}
      </span>
    </span>
  )
}
