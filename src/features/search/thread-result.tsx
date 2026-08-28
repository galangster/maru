// A search hit: the compact 52 px row DIRECTION §5 reserves for results and
// palette rows. Same fixed sender column as the list, so subjects still start
// at the same x.

import { Icon } from '@/components/ui/icon'
import { AccountAvatar } from '@/components/wren-controls'
import type { Account, Thread } from '@/core/types'
import { correspondents, participantLine, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface ThreadResultProps {
  thread: Thread
  account: Account | undefined
  selfEmails: string[]
  now: number
  /** The list shows avatars; the palette shows a mail glyph in the icon slot. */
  avatar?: boolean
  className?: string
}

export function ThreadResult({
  thread,
  account,
  selfEmails,
  now,
  avatar = true,
  className,
}: ThreadResultProps) {
  const people = correspondents(thread.participants, selfEmails)

  return (
    <span className={cn('flex w-full min-w-0 items-center gap-3', className)}>
      {avatar ? (
        <AccountAvatar address={people[0] ?? { email: '?' }} color={account?.color ?? '#94a3b8'} />
      ) : (
        <span className="flex w-(--wren-icon-box) shrink-0 items-center justify-center">
          <Icon
            name={thread.unread ? 'unread' : 'read'}
            size={16}
            className="text-ink-3 group-data-[selected=true]:text-brand"
          />
        </span>
      )}
      <span className="font-ui text-ink w-(--wren-list-sender-w) shrink-0 truncate text-base font-medium">
        {participantLine(people)}
      </span>
      <span className="text-ink-2 min-w-0 flex-1 truncate text-sm">
        {thread.subject || '(no subject)'}
      </span>
      <span className="text-ink-3 shrink-0 text-xs tabular-nums">
        {relativeTime(thread.lastMessageAt, now)}
      </span>
    </span>
  )
}
