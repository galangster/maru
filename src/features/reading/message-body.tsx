// A message body, rendered in a sandboxed iframe.
//
// The frame is `sandbox="allow-same-origin"` and nothing else: no scripts, no
// forms, no top navigation, no popups. Because it stays same-origin, the
// *parent* can measure it and intercept its links — so the frame never needs
// `allow-scripts`, which is the flag that would let sanitized-but-hostile mail
// climb back out.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { base64EncodeBytes } from '@/core/mime'
import type { Message } from '@/core/types'
import { useMailService } from '@/features/mail/service'
import { escapeHtml } from '@/lib/compose'
import { openExternalUrl } from '@/lib/env'
import { buildSrcdoc, sanitizeBody } from '@/lib/sanitize'

function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  // core/mime's encoder chunks the byte run: a spread over a megabyte-sized
  // image blows the argument stack, which is exactly what an inline image is.
  return `data:${mimeType};base64,${base64EncodeBytes(bytes)}`
}

/**
 * Sanitizing is the one main-thread-blocking step in opening a thread, and the
 * reading pane remounts every card on the crossfade between threads — so
 * re-reading a thread you just left used to re-run DOMPurify over every
 * message in it. Keyed by the message and by the two inputs that change what
 * sanitizing produces.
 *
 * Bounded, and oldest-out: a long session must not hold every body it has ever
 * rendered.
 */
const SANITIZE_CACHE_LIMIT = 64
const sanitized = new Map<string, ReturnType<typeof sanitizeBody>>()

function sanitizeCached(
  cacheKey: string,
  raw: string,
  options: { allowRemoteImages: boolean; inlineImages: Map<string, string> | undefined },
): ReturnType<typeof sanitizeBody> {
  const hit = sanitized.get(cacheKey)
  if (hit) return hit
  const result = sanitizeBody(raw, options)
  if (sanitized.size >= SANITIZE_CACHE_LIMIT) {
    const oldest = sanitized.keys().next().value
    if (oldest !== undefined) sanitized.delete(oldest)
  }
  sanitized.set(cacheKey, result)
  return result
}

/**
 * Last measured height per message id.
 *
 * Every frame used to mount at a flat 120 px and jump to its measured height
 * once the ResizeObserver fired — a several-hundred-pixel shift after paint on
 * a long message, taking the reply tiles below it with it (S6). Re-opening a
 * thread now starts at the height it ended at, and a message never seen before
 * starts at an estimate from its own body length rather than at a constant.
 *
 * Bounded and oldest-out, alongside the sanitize cache and for the same reason.
 */
const HEIGHT_CACHE_LIMIT = 256
const heights = new Map<string, number>()

function rememberHeight(messageId: string, height: number): void {
  if (heights.size >= HEIGHT_CACHE_LIMIT && !heights.has(messageId)) {
    const oldest = heights.keys().next().value
    if (oldest !== undefined) heights.delete(oldest)
  }
  heights.set(messageId, height)
}

/**
 * A first guess from data. Mail bodies are mostly text at ~90 characters to a
 * 24 px line inside the 68ch measure; markup inflates the raw length, so the
 * divisor is deliberately generous and the result is clamped. Wrong by a little
 * beats wrong by three hundred pixels.
 */
function estimateHeight(message: Message): number {
  const known = heights.get(message.id)
  if (known !== undefined) return known
  const length = (message.bodyText ?? message.bodyHtml ?? message.snippet ?? '').length
  return Math.min(720, Math.max(120, Math.ceil(length / 90) * 24 + 48))
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
  const [height, setHeight] = useState(() => estimateHeight(message))

  const { html, blockedImages } = useMemo(
    () =>
      sanitizeCached(`${message.id}:${allowRemoteImages}:${inlineImages?.size ?? 0}`, raw, {
        allowRemoteImages,
        inlineImages,
      }),
    [message.id, raw, allowRemoteImages, inlineImages],
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
        const measured = Math.ceil(
          Math.max(
            root.scrollHeight,
            root.offsetHeight,
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
            body?.getBoundingClientRect().height ?? 0,
          ),
        )
        rememberHeight(message.id, measured)
        setHeight(measured)
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
  }, [srcDoc, message.id])

  return (
    <iframe
      ref={frameRef}
      title={message.subject || 'Message body'}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      // An iframe is focusable by default, and this one had no focus indicator
      // and — because keydown inside a same-origin frame never reaches the
      // parent window — swallowed every shortcut in the app with no visible
      // reason (N10). It is content, not a control.
      tabIndex={-1}
      // The body always renders on paper — see buildSrcdoc(). `rounded-sm`,
      // not `rounded-md`: the card is `rounded-lg` (16) at `p-4` (16), so
      // DIRECTION §6's concentric rule (inner = outer − padding) puts the
      // frame at 0 — but a hard-cornered white slab inside a cloud-soft card
      // reads as a hole, so it takes the smallest step on the scale (N2).
      className="block w-full rounded-sm bg-white"
      style={{ height }}
    />
  )
}

/** A plain-text body, made safe to put in the frame. */
function escapeText(text: string): string {
  return `<div style="white-space:pre-wrap">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`
}
