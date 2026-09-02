// A search hit: the compact 52 px row DIRECTION §5 reserves for results and
// palette rows. Same fixed sender column as the list, so subjects still start
// at the same x — and after that column, everything left on the line is the
// subject's.

import { Icon } from '@/components/ui/icon'
import { AccountAvatar, ICON_SLOT } from '@/components/wren-controls'
import type { Thread } from '@/core/types'
import { correspondents, fullTimestamp, participantLine } from '@/lib/format'
import { hueFor } from '@/lib/hue'
import { cn } from '@/lib/utils'

export interface ThreadResultProps {
  thread: Thread
  selfEmails: string[]
  /** The list shows avatars; the palette shows a mail glyph in the icon slot. */
  avatar?: boolean
  className?: string
}

export function ThreadResult({
  thread,
  selfEmails,
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
          share it. */}
      <span className="font-ui text-ink w-(--wren-result-sender-w) shrink-0 truncate text-base font-medium">
        {participantLine(people)}
      </span>
      {/* Everything after the sender column, and it is the last thing on the
          line — issue #23, second pass.

          Fixing the ragged left edge did not stop the truncation it was filed
          beside: a 400 px list card leaves 236 px for sender and subject
          together, so the split gave the subject 140 and seven of the nine
          demo results still stopped mid-title, the longest needing 244. The
          arithmetic is the whole finding. A one-line row cannot hold a sender
          column, a subject and a trailing column in 236 px, and DIRECTION §5
          reserves the single-line 52 px row for exactly this surface — so the
          column that leaves is the trailing one.

          The relative time went. It is the tertiary datum on a hunting
          surface: results are ordered by it, the reading pane states it in
          full the moment a result is opened, and no one scans a search list
          for a timestamp. Cutting seven subjects in nine to keep it is the
          wrong way round. It is still ANNOUNCED — the `time` below is
          sr-only — so nothing is lost to a screen reader, only to the column
          that was starving the subject.

          It is ABSOLUTE rather than relative, which is why this row takes no
          `now`. A relative time has to be recomputed against the ticking
          clock, so every search result and every palette row re-rendered once
          a minute to update text no sighted reader can see and no screen
          reader was re-reading. The full stamp is the better announcement
          anyway: a result list is scanned out of order, and "Sep 2, 2026 at
          14:03" does not depend on when it is read. */}
      <span className="text-ink-2 min-w-0 flex-1 truncate text-sm">
        {thread.subject || '(no subject)'}
      </span>
      <time className="sr-only" dateTime={new Date(thread.lastMessageAt).toISOString()}>
        {fullTimestamp(thread.lastMessageAt)}
      </time>
    </span>
  )
}
