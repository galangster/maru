// A message body, rendered in a sandboxed iframe.
//
// The frame is `sandbox="allow-same-origin"` and nothing else: no scripts, no
// forms, no top navigation, no popups. Because it stays same-origin, the
// *parent* can measure it and intercept its links — so the frame never needs
// `allow-scripts`, which is the flag that would let sanitized-but-hostile mail
// climb back out.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { Message } from '@/core/types'
import { useMailService } from '@/features/mail/service'
import { openExternalUrl } from '@/lib/env'
import { buildSrcdoc, sanitizeBody } from '@/lib/sanitize'

function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${mimeType};base64,${btoa(binary)}`
}

/** cid: sources resolve from the message's own inline attachments. */
function useInlineImages(threadKey: string, message: Message, needed: boolean) {
  const service = useMailService()
  const inline = message.attachments.filter((a) => a.inline && a.contentId)

  const query = useQuery({
    queryKey: ['inline-images', message.id],
    enabled: needed && inline.length > 0,
    queryFn: async () => {
      const map = new Map<string, string>()
      for (const attachment of inline) {
        const bytes = await service.getAttachment(threadKey, message.id, attachment.id)
        map.set(attachment.contentId as string, toDataUrl(bytes, attachment.mimeType))
      }
      return map
    },
  })
  return query.data
}

export interface MessageBodyProps {
  threadKey: string
  message: Message
  allowRemoteImages: boolean
  onBlockedImages: (count: number) => void
}

export function MessageBody({
  threadKey,
  message,
  allowRemoteImages,
  onBlockedImages,
}: MessageBodyProps) {
  const raw = message.bodyHtml ?? escapeText(message.bodyText ?? '')
  const inlineImages = useInlineImages(threadKey, message, raw.includes('cid:'))
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)

  const { html, blockedImages } = useMemo(
    () => sanitizeBody(raw, { allowRemoteImages, inlineImages }),
    [raw, allowRemoteImages, inlineImages],
  )
  const srcDoc = useMemo(() => buildSrcdoc(html), [html])

  useEffect(() => onBlockedImages(blockedImages), [blockedImages, onBlockedImages])

  // Measure and link-handle from the parent side. Re-runs whenever the srcdoc
  // changes, because that replaces the frame's document.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let observer: ResizeObserver | undefined

    const attach = () => {
      const doc = frame.contentDocument
      if (!doc?.documentElement) return
      const measure = () => {
        // A table layout's trailing padding does not always reach
        // documentElement.scrollHeight, so take the tallest honest metric.
        const root = doc.documentElement
        const body = doc.body
        setHeight(
          Math.ceil(
            Math.max(
              root.scrollHeight,
              root.offsetHeight,
              body?.scrollHeight ?? 0,
              body?.offsetHeight ?? 0,
              body?.getBoundingClientRect().height ?? 0,
            ),
          ),
        )
      }
      measure()
      observer = new ResizeObserver(measure)
      observer.observe(doc.documentElement)
      if (doc.body) observer.observe(doc.body)
      doc.addEventListener('click', onClick)
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      event.preventDefault()
      const href = anchor.getAttribute('href') ?? ''
      if (/^(https?|mailto):/i.test(href)) void openExternalUrl(href)
    }

    frame.addEventListener('load', attach)
    // srcdoc frames can already be parsed by the time this effect runs.
    if (frame.contentDocument?.readyState === 'complete') attach()

    return () => {
      frame.removeEventListener('load', attach)
      observer?.disconnect()
      frame.contentDocument?.removeEventListener('click', onClick)
    }
  }, [srcDoc])

  return (
    <iframe
      ref={frameRef}
      title={message.subject || 'Message body'}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      // The body always renders on paper — see buildSrcdoc().
      className="block w-full rounded-md bg-white"
      style={{ height }}
    />
  )
}

function escapeText(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return `<div style="white-space:pre-wrap">${escaped}</div>`
}
