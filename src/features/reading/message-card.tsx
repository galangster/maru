// One message. Earlier messages in a thread collapse to a single line; the
// last one is open. Clicking a collapsed line expands it.

import { useCallback, useState } from 'react'

import { Icon } from '@/components/ui/icon'
import { AccountAvatar, META_TEXT } from '@/components/wren-controls'
import type { Message } from '@/core/types'
import { displayName, fullTimestamp, relativeTime } from '@/lib/format'
import { hueFor } from '@/lib/hue'
import { cn } from '@/lib/utils'

import { AttachmentChip } from './attachment-chip'
import { MessageBody } from './message-body'

export interface MessageCardProps {
  threadKey: string
  message: Message
  defaultExpanded: boolean
  now: number
  imagesAllowed: boolean
  onAllowImages: () => void
}

export function MessageCard({
  threadKey,
  message,
  defaultExpanded,
  now,
  imagesAllowed,
  onAllowImages,
}: MessageCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [blocked, setBlocked] = useState(0)
  const onBlockedImages = useCallback((count: number) => setBlocked(count), [])
  const attachments = message.attachments.filter((a) => !a.inline)

  if (!expanded) {
    return (
      <button
        type="button"
        data-message-card
        onClick={() => setExpanded(true)}
        className={cn(
          'focus-ring bg-surface hover:bg-fill-hover flex h-(--wren-row-h-compact) w-full items-center gap-3 rounded-lg px-4 text-left',
          'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        )}
      >
        <AccountAvatar address={message.from} hue={hueFor(message.from.email)} />
        <span className="font-ui text-ink-2 shrink-0 text-base font-medium">
          {displayName(message.from)}
        </span>
        <span className="text-ink-3 min-w-0 flex-1 truncate text-sm">{message.snippet}</span>
        <span className={META_TEXT}>
          {relativeTime(message.date, now)}
        </span>
      </button>
    )
  }

  return (
    <article data-message-card className="bg-surface rounded-lg p-4 shadow-xs">
      <header className="flex items-start gap-3">
        <AccountAvatar address={message.from} hue={hueFor(message.from.email)} />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-ink truncate text-base font-semibold">
            {displayName(message.from)}
          </p>
          <p className="text-ink-3 truncate text-sm">{message.from.email}</p>
        </div>
        <time
          className={META_TEXT}
          title={fullTimestamp(message.date)}
        >
          {relativeTime(message.date, now)}
        </time>
      </header>

      {blocked > 0 && !imagesAllowed && (
        <div className="bg-sunken text-ink-2 mt-4 flex items-center gap-2 rounded-xs px-3 py-2 text-sm">
          <Icon name="imageOff" size={16} className="text-ink-3" />
          <span className="flex-1">
            Remote images blocked
            <span className="text-ink-3"> · they can tell the sender you opened this</span>
          </span>
          <button
            type="button"
            onClick={onAllowImages}
            className="font-ui text-brand hover:text-brand-hover focus-ring shrink-0 rounded-xs text-sm font-medium"
          >
            Show
          </button>
        </div>
      )}

      <div className="mt-4">
        <MessageBody
          threadKey={threadKey}
          message={message}
          allowRemoteImages={imagesAllowed}
          onBlockedImages={onBlockedImages}
        />
      </div>

      {attachments.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <AttachmentChip key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}
    </article>
  )
}
