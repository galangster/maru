// Photo attachments, shown as photographs rather than filenames.
//
// An image attachment is the one kind of file whose content *is* its preview,
// so it renders as a thumbnail — rounded to the app's radius, hairline-ringed
// the way the design system outlines images — and opens full-size in a
// lightbox. Non-image files keep the quiet AttachmentChip; a filename tells
// you everything about a PDF and nothing about a sunset.
//
// Bytes come from the same `getAttachment` seam the inline cid: images use,
// through TanStack Query so a re-opened thread does not refetch. Thumbnails
// are honest content, not tracking pixels — the remote-image privacy gate
// does not apply to a message's own attachments.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { META_TEXT, PRESS, textButtonClass } from '@/components/wren-controls'
import type { Attachment } from '@/core/types'
import { useMailService } from '@/features/mail/service'
import { formatBytes, toDataUrl } from '@/lib/format'
import { saveWithToasts } from '@/lib/save-file'
import { cn } from '@/lib/utils'

function usePhotoData(threadKey: string, attachment: Attachment) {
  const service = useMailService()
  return useQuery({
    queryKey: ['photo', attachment.messageId, attachment.id],
    queryFn: async () => {
      const bytes = await service.getAttachment(threadKey, attachment.messageId, attachment.id)
      // Only the data URL is cached: bytes exist for the rare Save click,
      // which refetches rather than keeping every photo resident twice.
      return toDataUrl(bytes, attachment.mimeType)
    },
    staleTime: Infinity,
  })
}

function PhotoThumb({
  threadKey,
  attachment,
  solo,
}: {
  threadKey: string
  attachment: Attachment
  solo: boolean
}) {
  const service = useMailService()
  const photo = usePhotoData(threadKey, attachment)
  const [open, setOpen] = useState(false)

  const save = async () => {
    const bytes = await service.getAttachment(threadKey, attachment.messageId, attachment.id)
    await saveWithToasts(attachment.filename, bytes)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!photo.data}
        aria-label={`Open ${attachment.filename}`}
        className={cn(
          // The hairline ring is the design system's image outline: it keeps a
          // photo whose edge matches the surface from dissolving into it.
          'focus-ring group relative overflow-hidden rounded-xl ring-1 ring-ink/8 ring-inset',
          'transition-[scale] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
          PRESS,
          solo ? 'max-h-80 max-w-md' : 'size-40',
        )}
      >
        {photo.data ? (
          <img
            src={photo.data}
            alt={attachment.filename}
            className={cn(
              'transition-[scale] duration-(--wren-dur-base) ease-(--wren-ease-out) motion-safe:group-hover:scale-[1.03]',
              solo ? 'max-h-80 w-auto object-contain' : 'size-full object-cover',
            )}
          />
        ) : (
          <span
            className={cn('bg-sunken block', solo ? 'aspect-[4/3] w-full max-w-md' : 'size-full')}
            aria-hidden
          />
        )}
        {/* The filename arrives with the pointer, in a bottom scrim, and never
            covers more than it must. */}
        <span
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 pb-2 pt-8 text-left',
            'bg-gradient-to-t from-black/55 to-transparent text-xs text-white',
            'opacity-0 transition-opacity duration-(--wren-dur-fast) group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          <span className="truncate">{attachment.filename}</span>
          <span className="shrink-0 text-white/70">{formatBytes(attachment.sizeBytes)}</span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-auto max-w-[min(92vw,1100px)] border-none bg-transparent p-0 shadow-none"
        >
          <DialogTitle className="sr-only">{attachment.filename}</DialogTitle>
          <DialogDescription className="sr-only">
            Full-size view. Escape closes.
          </DialogDescription>
          {photo.data && (
            <img
              src={photo.data}
              alt={attachment.filename}
              className="max-h-[82vh] w-auto rounded-2xl object-contain"
            />
          )}
          <div className="mt-3 flex items-center justify-center gap-3">
            <span className="text-sm text-white/90">{attachment.filename}</span>
            <span className={cn(META_TEXT, 'text-white/60')}>
              {formatBytes(attachment.sizeBytes)}
            </span>
            <button
              type="button"
              onClick={() => void save()}
              className={cn(textButtonClass(), 'text-white/80 hover:text-white')}
            >
              Save
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function PhotoGrid({
  threadKey,
  photos,
}: {
  threadKey: string
  photos: Attachment[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((attachment) => (
        <PhotoThumb
          key={attachment.id}
          threadKey={threadKey}
          attachment={attachment}
          solo={photos.length === 1}
        />
      ))}
    </div>
  )
}
