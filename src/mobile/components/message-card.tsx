import { useEffect, useState } from 'react'
import { ChevronRight, Paperclip } from 'lucide-react'

import type { Attachment, Message } from '@/core/types'
import { useMessageBodyFrame } from '@/features/reading/message-body'
import { usePhotoData } from '@/features/reading/photo-grid'
import { displayName, formatBytes, isPreviewableImage, relativeTime } from '@/lib/format'

export function MobileMessageCard({
  threadKey,
  message,
  expanded,
  newest,
  allowRemoteImages,
  now,
  onToggle,
}: {
  threadKey: string
  message: Message
  expanded: boolean
  newest: boolean
  allowRemoteImages: boolean
  now: number
  onToggle: () => void
}) {
  return (
    <article className={`mobile-message-card${expanded ? ' is-expanded' : ''}`}>
      <button className="mobile-message-header" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="mobile-avatar">{displayName(message.from).slice(0, 1).toUpperCase()}</span>
        <span className="mobile-message-meta">
          <strong>{displayName(message.from)}</strong>
          <span>{expanded ? `to ${message.to.map(displayName).join(', ') || 'me'}` : message.snippet}</span>
        </span>
        <time>{relativeTime(message.date, now)}</time>
        <ChevronRight className="mobile-message-chevron" size={17} />
      </button>
      {expanded && (
        <div className="mobile-message-content">
          <SafeMessageBody threadKey={threadKey} message={message} allowRemoteImages={allowRemoteImages} />
          {message.attachments.length > 0 && <MobileAttachments threadKey={threadKey} message={message} />}
          {newest && <span className="mobile-newest-label">Newest message</span>}
        </div>
      )}
    </article>
  )
}

function SafeMessageBody({ threadKey, message, allowRemoteImages }: { threadKey: string; message: Message; allowRemoteImages: boolean }) {
  const { frameRef, height, srcDoc } = useMessageBodyFrame({
    threadKey,
    message,
    allowRemoteImages,
    onBlockedImages: () => {},
  })
  return (
    <iframe
      ref={frameRef}
      className="mobile-message-body"
      title={message.subject || 'Message body'}
      sandbox="allow-same-origin allow-top-navigation-by-user-activation"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      tabIndex={-1}
      style={{ height }}
    />
  )
}

function MobileAttachments({ threadKey, message }: { threadKey: string; message: Message }) {
  const images = message.attachments.filter((attachment) => isPreviewableImage(attachment.mimeType))
  const files = message.attachments.filter((attachment) => !isPreviewableImage(attachment.mimeType))
  return (
    <div className="mobile-attachments">
      {images.length > 0 && <div className="mobile-image-grid">{images.map((attachment) => <AttachmentImage key={attachment.id} threadKey={threadKey} attachment={attachment} />)}</div>}
      {files.map((attachment) => (
        <div className="mobile-attachment-chip" key={attachment.id}>
          <Paperclip size={16} /><span>{attachment.filename}</span><small>{formatBytes(attachment.sizeBytes)}</small>
        </div>
      ))}
    </div>
  )
}

function AttachmentImage({ threadKey, attachment }: { threadKey: string; attachment: Attachment }) {
  const photo = usePhotoData(threadKey, attachment)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photo.data) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(photo.data)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [photo.data])
  return url
    ? <img src={url} alt={attachment.filename} loading="lazy" decoding="async" />
    : <div className="mobile-image-placeholder" />
}
