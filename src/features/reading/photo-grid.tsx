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

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'

import { META_TEXT, PRESS, textButtonClass } from '@/components/wren-controls'
import type { Attachment } from '@/core/types'
import { useMailService } from '@/features/mail/service'
import { formatBytes } from '@/lib/format'
import { DUR, EASE_OUT, EXIT_DUR, crossfadePreset, useMotionMode } from '@/lib/motion'
import { saveWithToasts } from '@/lib/save-file'
import { cn } from '@/lib/utils'

export function usePhotoData(threadKey: string, attachment: Attachment) {
  const service = useMailService()
  return useQuery({
    queryKey: ['photo', attachment.messageId, attachment.id],
    queryFn: async () => {
      const bytes = await service.getAttachment(threadKey, attachment.messageId, attachment.id)
      return new Blob([Uint8Array.from(bytes)], { type: attachment.mimeType })
    },
    staleTime: Infinity,
  })
}

function usePhotoUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
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
  const photoUrl = usePhotoUrl(photo.data)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const mode = useMotionMode()
  const morph = mode === 'full'
  const morphId = `photo-${attachment.messageId}-${attachment.id}`
  const fade = crossfadePreset(mode)

  // Escape closes; focus moves into the dialog and returns to the thumbnail
  // after. The nearest scroller locks while open — not cosmetics: if the pane
  // scrolled under the overlay, the close morph would fly to a stale target.
  useEffect(() => {
    if (!open) return
    overlay.current?.focus()
    let scroller: HTMLElement | null = trigger.current?.parentElement ?? null
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
      scroller = scroller.parentElement
    }
    const previousOverflow = scroller?.style.overflow ?? ''
    if (scroller) scroller.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (scroller) scroller.style.overflow = previousOverflow
      trigger.current?.focus()
    }
  }, [open])

  const save = async () => {
    const bytes = await service.getAttachment(threadKey, attachment.messageId, attachment.id)
    await saveWithToasts(attachment.filename, bytes)
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        disabled={!photoUrl}
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
        {photoUrl ? (
          <motion.img
            // `!open` is load-bearing: while the lightbox is up, the thumb
            // must NOT share the id, or Motion hides it as the non-lead of
            // the pair. Dropping the id re-targets the close morph home.
            layoutId={morph && !open ? morphId : undefined}
            src={photoUrl}
            alt={attachment.filename}
            loading="lazy"
            decoding="async"
            style={{ borderRadius: 12 }}
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

      {/* The lightbox grows out of the thumbnail (shared layoutId): the photo
          the user clicked is the photo on screen, moved — object permanence,
          not a second copy fading in from nowhere. Reduced motion drops the
          morph and keeps the crossfade; the capture path holds still.
          Hand-rolled rather than the Dialog primitive because the close morph
          needs AnimatePresence to own the exit — Base UI removes its node on
          close, so the image could never fly home (same division of labour as
          lib/motion.ts's header and the composer). The price is the trap and
          scroll lock below, paid by hand. */}
      <AnimatePresence>
        {open && photoUrl && (
          <motion.div
            ref={overlay}
            role="dialog"
            aria-modal="true"
            aria-label={attachment.filename}
            tabIndex={-1}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-8 outline-none"
            initial={fade.initial}
            animate={fade.animate}
            exit={{ ...fade.exit, transition: { duration: EXIT_DUR } }}
            transition={fade.transition}
            onClick={() => setOpen(false)}
            onKeyDown={(event) => {
              // One focusable inside (Save): the whole focus trap is this.
              if (event.key === 'Tab') {
                event.preventDefault()
                saveButton.current?.focus()
              }
            }}
          >
            <div aria-hidden className="absolute inset-0" style={{ backgroundColor: 'var(--wren-scrim)' }} />
            <motion.img
              layoutId={morph ? morphId : undefined}
              transition={{ duration: DUR.base, ease: EASE_OUT }}
              src={photoUrl}
              alt={attachment.filename}
              style={{ borderRadius: 16 }}
              className="relative max-h-[82vh] max-w-[min(92vw,1100px)] object-contain"
              onClick={(event) => event.stopPropagation()}
            />
            <div
              className="relative flex items-center gap-3"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="text-sm text-white/90">{attachment.filename}</span>
              <span className={cn(META_TEXT, 'text-white/60')}>
                {formatBytes(attachment.sizeBytes)}
              </span>
              <button
                ref={saveButton}
                type="button"
                onClick={() => void save()}
                className={cn(textButtonClass(), 'text-white/80 hover:text-white')}
              >
                Save
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
