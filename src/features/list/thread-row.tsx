// One row of the thread list — 68 px, two lines, identical anatomy on every
// row (DIRECTION §2, Phantom 2 and Superhuman 1):
//
//   [dot gutter] [avatar] | sender (fixed 152 px) · count ........ time
//                         | subject · snippet .............. star / clip / dot
//
// The fixed sender column is what makes every subject and every snippet start
// at the same x. Unread is a gutter dot and a weight change — never a tint,
// never a left bar.

import { memo } from 'react'

import { Icon } from '@/components/ui/icon'
import { AccountAvatar, AccountDot, IconButton } from '@/components/wren-controls'
import type { Account, MailActionType, Thread } from '@/core/types'
import { correspondents, participantLine, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface ThreadRowProps {
  thread: Thread
  account: Account | undefined
  selected: boolean
  showAccountDot: boolean
  now: number
  selfEmails: string[]
  onSelect: () => void
  onAction: (type: MailActionType) => void
}

export const ThreadRow = memo(function ThreadRow({
  thread,
  account,
  selected,
  showAccountDot,
  now,
  selfEmails,
  onSelect,
  onAction,
}: ThreadRowProps) {
  const people = correspondents(thread.participants, selfEmails)
  const sender = participantLine(people)
  const lead = people[0] ?? { email: sender }
  const inTrash = thread.labelIds.includes('TRASH')

  return (
    <div
      role="option"
      aria-selected={selected}
      data-thread-key={thread.key}
      data-unread={thread.unread || undefined}
      onClick={onSelect}
      className={cn(
        'group relative flex h-(--wren-row-h) w-full cursor-default items-center gap-3 px-4',
        'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        selected ? 'bg-fill-selected' : 'hover:bg-fill-hover',
      )}
    >
      <span className="flex w-3 shrink-0 justify-center" aria-hidden>
        {thread.unread && <span className="bg-brand size-1.5 rounded-full" />}
      </span>

      <AccountAvatar address={lead} color={account?.color ?? '#94a3b8'} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          {/* The fixed 152 px column. The count rides inside it, next to the
              name, so it never floats in the gap before the timestamp. */}
          <span className="flex w-(--wren-list-sender-w) shrink-0 items-baseline gap-2">
            <span
              className={cn(
                'font-ui min-w-0 truncate text-base',
                thread.unread ? 'text-ink font-semibold' : 'text-ink-2 font-medium',
              )}
            >
              {sender}
            </span>
            {thread.messageCount > 1 && (
              <span className="text-ink-3 shrink-0 text-xs tabular-nums">
                {thread.messageCount}
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1" />
          <time className="text-ink-3 shrink-0 text-xs tabular-nums">
            {relativeTime(thread.lastMessageAt, now)}
          </time>
        </div>

        <div className="flex items-baseline gap-2 leading-5">
          <span
            className={cn(
              'truncate text-sm leading-5',
              thread.unread ? 'text-ink font-medium' : 'text-ink font-normal',
            )}
          >
            {thread.subject || '(no subject)'}
          </span>
          <span className="text-ink-3 min-w-0 flex-1 truncate text-sm leading-5">
            {thread.snippet}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {thread.starred && (
              <button
                type="button"
                aria-label="Unstar"
                title="Unstar"
                onClick={(e) => {
                  e.stopPropagation()
                  onAction('unstar')
                }}
                // The visible glyph is 16 px; the pseudo-element restores the
                // 32 px hit box without changing the row's metrics.
                className="text-star relative outline-none after:absolute after:-inset-2 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon name="star" size={16} filled />
              </button>
            )}
            {thread.hasAttachments && <Icon name="attachment" size={16} className="text-ink-3" />}
            {showAccountDot && account && <AccountDot color={account.color} />}
          </span>
        </div>
      </div>

      <QuickActions thread={thread} inTrash={inTrash} onAction={onAction} />
    </div>
  )
})

/** Revealed on hover, reachable by keyboard, and opaque so it never sits as
 *  glass over text. Padding 4 puts the icon boxes back on the row's 16 px edge. */
function QuickActions({
  thread,
  inTrash,
  onAction,
}: {
  thread: Thread
  inTrash: boolean
  onAction: (type: MailActionType) => void
}) {
  return (
    <div
      className={cn(
        'bg-raised absolute top-1/2 right-3 flex -translate-y-1/2 items-center rounded-md p-1 shadow-md',
        'opacity-0 transition-opacity duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        'pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100',
        'focus-within:pointer-events-auto focus-within:opacity-100',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <IconButton
        name="archive"
        label="Archive"
        size={16}
        onClick={() => onAction('archive')}
        disabled={inTrash}
      />
      <IconButton
        name="trash"
        label={inTrash ? 'Restore from trash' : 'Move to trash'}
        size={16}
        tone="danger"
        onClick={() => onAction(inTrash ? 'untrash' : 'trash')}
      />
      <IconButton
        name={thread.unread ? 'read' : 'unread'}
        label={thread.unread ? 'Mark as read' : 'Mark as unread'}
        size={16}
        onClick={() => onAction(thread.unread ? 'markRead' : 'markUnread')}
      />
      <IconButton
        name="star"
        label={thread.starred ? 'Unstar' : 'Star'}
        size={16}
        tone={thread.starred ? 'star' : 'default'}
        filled={thread.starred}
        onClick={() => onAction(thread.starred ? 'unstar' : 'star')}
      />
    </div>
  )
}
