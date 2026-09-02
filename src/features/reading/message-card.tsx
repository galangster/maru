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
import { PhotoGrid } from './photo-grid'
import { isPreviewableImage } from '@/lib/format'
import { MessageBody } from './message-body'
import { BLOCKED_IMAGES } from './remote-images'

export interface MessageCardProps {
  threadKey: string
  message: Message
  /** Controlled by the pane, so expand-all and the keymap can reach it. */
  expanded: boolean
  onToggle: () => void
  now: number
  imagesAllowed: boolean
  onAllowImages: () => void
}

export function MessageCard({
  threadKey,
  message,
  expanded,
  onToggle,
  now,
  imagesAllowed,
  onAllowImages,
}: MessageCardProps) {
  const [blocked, setBlocked] = useState(0)
  const onBlockedImages = useCallback((count: number) => setBlocked(count), [])
  const shown = message.attachments.filter((a) => !a.inline)
  // A photo's content is its preview; everything else is named by its chip.
  const photos = shown.filter((a) => isPreviewableImage(a.mimeType))
  const attachments = shown.filter((a) => !isPreviewableImage(a.mimeType))

  if (!expanded) {
    return (
      <button
        type="button"
        data-message-card
        aria-expanded={false}
        onClick={onToggle}
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
      {/* The header is the collapse control, exactly as the collapsed row is
          the expand control — the same click in both directions. A real
          button, full-width, with the row's own layout inside it. */}
      <button
        type="button"
        aria-expanded
        onClick={onToggle}
        className="focus-ring -m-1 flex w-full items-start gap-3 rounded-md p-1 text-left"
      >
        <AccountAvatar address={message.from} hue={hueFor(message.from.email)} />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-ink truncate text-base font-semibold">
            {displayName(message.from)}
          </p>
          <p className="text-ink-3 truncate text-sm">{message.from.email}</p>
        </div>
        <time className={META_TEXT} title={fullTimestamp(message.date)}>
          {relativeTime(message.date, now)}
        </time>
      </button>

      {blocked > 0 && !imagesAllowed && (
        <div className="bg-sunken text-ink-2 mt-4 flex items-center gap-2 rounded-xs px-3 py-2 text-sm">
          <Icon name="imageOff" size={16} className="text-ink-3" />
          <span className="flex-1">
            {BLOCKED_IMAGES.notice}
            <span className="text-ink-3"> · {BLOCKED_IMAGES.why}</span>
          </span>
          <button
            type="button"
            onClick={onAllowImages}
            className="font-ui text-brand hover:text-brand-hover focus-ring shrink-0 rounded-xs text-sm font-medium"
          >
            {BLOCKED_IMAGES.action}
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

      {photos.length > 0 && (
        <div className="mt-4">
          <PhotoGrid threadKey={threadKey} photos={photos} />
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <AttachmentChip key={attachment.id} threadKey={threadKey} attachment={attachment} />
          ))}
        </div>
      )}
    </article>
  )
}
