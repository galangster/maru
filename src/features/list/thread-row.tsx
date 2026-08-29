// One row of the thread list — 68 px, two lines, identical anatomy on every
// row (DIRECTION §2, Phantom 2 and Superhuman 1):
//
//   [dot gutter] [avatar] | sender (fixed 152 px) · count ......... time
//                         | subject · snippet ................ star / clip
//
// The fixed sender column is what makes every subject and every snippet start
// at the same x. Unread is a gutter dot and a weight change — never a tint,
// never a left bar.
//
// Which account a row came from used to be a separate 6 px dot at the far
// right of line two, after the snippet. It read as a stray bullet on a ragged
// edge and it ate the snippet's last characters. Wherever it was moved it was
// still a loose element looking for a column, so it is not a separate element
// any more: the avatar already carries the account colour, and in a unified
// view it now carries a full-chroma hairline of it too. One saturated chip
// leads the row and answers "whose is this" — DIRECTION §2, Family 3.

import { memo, useCallback } from 'react'

import { Icon } from '@/components/ui/icon'
import { AccountAvatar, IconButton } from '@/components/wren-controls'
import type { Account, MailActionType, Thread } from '@/core/types'
import { THREAD_ACTION_ORDER, threadActions } from '@/features/mail/thread-actions'
import { correspondents, participantLine, relativeTime } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

export interface ThreadRowProps {
  thread: Thread
  account: Account | undefined
  selected: boolean
  showAccount: boolean
  selfEmails: string[]
  /**
   * Both take the thread rather than closing over it, so the list can hand
   * every row the same two function identities and `memo` actually holds. A
   * per-row arrow made the memo a no-op and re-rendered the whole viewport on
   * every keystroke in the search field.
   */
  onSelect: (thread: Thread) => void
  onAction: (thread: Thread, type: MailActionType) => void
}

/** The DOM id of a row, so the listbox can point `aria-activedescendant` at it.
 *  Thread keys are `accountId/gmailThreadId`, which is a legal id and is never
 *  used as a CSS selector. */
export function threadRowId(threadKey: string): string {
  return `wren-row-${threadKey}`
}

export const ThreadRow = memo(function ThreadRow({
  thread,
  account,
  selected,
  showAccount,
  selfEmails,
  onSelect,
  onAction,
}: ThreadRowProps) {
  // The row owns its own clock. Held by the list, the minute tick re-rendered
  // every row in the viewport; here it re-renders only the timestamps.
  const now = useNow()
  const people = correspondents(thread.participants, selfEmails)
  const sender = participantLine(people)
  const lead = people[0] ?? { email: sender }
  const act = useCallback((type: MailActionType) => onAction(thread, type), [onAction, thread])

  return (
    <div
      role="option"
      id={threadRowId(thread.key)}
      aria-selected={selected}
      data-thread-key={thread.key}
      data-unread={thread.unread || undefined}
      onClick={() => onSelect(thread)}
      className={cn(
        'group relative flex h-(--wren-row-h) w-full cursor-default items-center gap-3 px-4',
        'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        selected ? 'bg-fill-selected' : 'hover:bg-fill-hover',
      )}
    >
      <span className="flex w-3 shrink-0 justify-center">
        {thread.unread && (
          <>
            <span className="bg-brand size-1.5 rounded-full" aria-hidden />
            <span className="sr-only">Unread</span>
          </>
        )}
      </span>

      <AccountAvatar address={lead} color={account?.color ?? '#94a3b8'} ring={showAccount} />
      {showAccount && account && <span className="sr-only">{account.email}</span>}

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
          {/* Fixed width, right-aligned. "02:30", "Sat" and "Yesterday" are
              three different widths; a shrink-to-fit column would leave the
              left edge of the timestamps ragged down the list, which is the
              one thing DIRECTION §1 says a column may never do. 64 px holds
              the longest value. */}
          <time className="text-ink-3 w-16 shrink-0 text-right text-xs tabular-nums">
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
          {/* Below ~380 px of list the snippet degrades to one or two
              characters and an ellipsis, which is noise, not preview. It is
              dropped outright at that width and the row falls back to sender
              plus subject. */}
          <span className="text-ink-3 hidden min-w-0 flex-1 truncate text-sm leading-5 @min-[380px]:block">
            {thread.snippet}
          </span>
          <span className="min-w-0 flex-1 @min-[380px]:hidden" />
          {/* Both are state, not controls. ARIA forbids focusable content
              inside a `role="option"`, and a screen reader flattens an option
              to its text label anyway, so the star used to be announced
              inconsistently or not at all (UI-REVIEW-2026-08-28 B3). It is now
              a glyph plus an sr-only word; `S`, the hover cluster and the
              reading toolbar all still toggle it. */}
          <span className="flex shrink-0 items-center gap-2">
            {thread.starred && (
              <span className="text-star inline-flex">
                <Icon name="star" size={16} filled />
                <span className="sr-only">Starred</span>
              </span>
            )}
            {thread.hasAttachments && (
              <span className="inline-flex">
                <Icon name="attachment" size={16} className="text-ink-3" />
                <span className="sr-only">Has attachments</span>
              </span>
            )}
          </span>
        </div>
      </div>

      <QuickActions thread={thread} onAction={act} />
    </div>
  )
})

/**
 * The row's mouse convenience: four actions revealed on hover, opaque so they
 * never sit as glass over text.
 *
 * It owns **no tab stops**. Every rendered row used to mount four `opacity-0`
 * buttons that were fully in the tab order, which put 79 invisible stops
 * between the list header and the reading pane and made the standard non-mouse
 * path through the app's primary surface unusable (UI-REVIEW-2026-08-28 B1).
 * The four actions all have keyboard equivalents — `e`, `#`, `s`, `u` — printed
 * in the "?" sheet, so the cluster is `tabIndex={-1}` throughout and
 * `aria-hidden` outright: the listbox is the single stop, and an option
 * announces as its text rather than as its text plus four button labels (B3).
 *
 * There is no `@media (hover: hover)` gate here, and that is a decision rather
 * than an omission (N11): Wren is a desktop-only Tauri target with no touch
 * input, so a hover-revealed affordance has no sticky-hover case to answer for.
 * Recorded so it is not rediscovered as a defect.
 *
 * It sits on the row's *second* line. Centred, it covered the timestamp
 * column exactly (S2) — the row's right-hand anchor, hidden precisely when the
 * cursor is on the row being read. There is no room in a 400 px pane to reserve
 * 130 px of gutter, so the cluster moved down instead of the content moving
 * over: nothing reflows, nothing animates but opacity and a 4 px slide, and the
 * time stays visible.
 */
function QuickActions({
  thread,
  onAction,
}: {
  thread: Thread
  onAction: (type: MailActionType) => void
}) {
  const actions = threadActions(thread)
  return (
    <div
      aria-hidden
      className={cn(
        'bg-raised absolute right-3 bottom-1 flex items-center overflow-hidden rounded-md shadow-md',
        'transition-[opacity,transform] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        // The 4 px slide is what makes the cluster read as arriving rather
        // than switching on. Reduced motion drops the offset, so there is no
        // transform left to animate and only the opacity crossfades.
        'opacity-0 motion-safe:translate-x-1',
        'pointer-events-none group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {THREAD_ACTION_ORDER.map((id) => {
        const spec = actions[id]
        return (
          <IconButton
            key={spec.id}
            name={spec.icon}
            label={spec.label}
            hint={spec.hint}
            size={16}
            tabIndex={-1}
            tone={spec.tone}
            filled={spec.filled}
            pop={spec.pop}
            disabled={spec.disabled}
            onClick={() => onAction(spec.type)}
          />
        )
      })}
    </div>
  )
}
