// A message body, rendered in a sandboxed iframe.
//
// The frame is `sandbox="allow-same-origin allow-top-navigation-by-user-
// activation"` and nothing else: no scripts, no forms, no popups. Because it
// stays same-origin, the *parent* can measure it — never `allow-scripts`,
// which is the flag that would let sanitized-but-hostile mail climb back out.
//
// Links are `target="_top"` (set by the sanitizer) because WebKit never fires
// parent-attached listeners inside a no-scripts sandbox: in the browser build
// the click handler below intercepts them; in Tauri the click falls through
// to a real user-activated top navigation, which the Rust on_navigation guard
// (lib.rs "external-links" plugin) routes to the system browser and cancels.
// Top navigation needs the user-activation flag, so mail can't redirect on
// its own — only a real click can.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { Message } from '@/core/types'
import { useMailService } from '@/features/mail/service'
import { escapeHtml } from '@/lib/compose'
import { openExternalUrl } from '@/lib/env'
import { toDataUrl } from '@/lib/format'
import { buildSrcdoc, sanitizeBody } from '@/lib/sanitize'

/**
 * A cache that forgets its oldest entry once it is full.
 *
 * Two of them live in this file for the same reason — a long reading session
 * must not hold every body and every height it has ever rendered — and they
 * used to spell the same four-line eviction out twice, once with the
 * already-present check and once without it.
 *
 * Insertion order is Map's own, so the first key is the least recently
 * *added*. Re-setting a key it already holds never evicts anything.
 */
function boundedMap<V>(limit: number) {
  const entries = new Map<string, V>()
  return {
    get: (key: string): V | undefined => entries.get(key),
    set(key: string, value: V): void {
      if (entries.size >= limit && !entries.has(key)) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, value)
    },
  }
}

/**
 * Sanitizing is the one main-thread-blocking step in opening a thread, and the
 * reading pane remounts every card on the crossfade between threads — so
 * re-reading a thread you just left used to re-run DOMPurify over every
 * message in it. Keyed by the message and by the two inputs that change what
 * sanitizing produces.
 */
const sanitized = boundedMap<ReturnType<typeof sanitizeBody>>(64)

function sanitizeCached(
  cacheKey: string,
  raw: string,
  options: { allowRemoteImages: boolean; inlineImages: Map<string, string> | undefined },
): ReturnType<typeof sanitizeBody> {
  const hit = sanitized.get(cacheKey)
  if (hit) return hit
  const result = sanitizeBody(raw, options)
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
const heights = boundedMap<number>(256)

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
    // Attachment bytes are immutable; remounting a thread must not refetch.
    staleTime: Infinity,
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

  const { html, blockedImages, remoteImages } = useMemo(
    () =>
      sanitizeCached(`${message.id}:${allowRemoteImages}:${inlineImages?.size ?? 0}`, raw, {
        allowRemoteImages,
        inlineImages,
      }),
    [message.id, raw, allowRemoteImages, inlineImages],
  )
  // The CSP widens only for a body that actually REFERENCES a remote image.
  // Keying it on `allowRemoteImages` alone would rewrite the srcdoc of every
  // image-free message in the thread when Show is clicked — `html` is
  // byte-identical for those, but a changed CSP string still replaces the
  // document, tearing down the ResizeObserver and re-measuring. On a
  // twenty-message thread with fifteen plain replies that is fifteen
  // gratuitous reloads per click.
  //
  // `remoteImages`, NOT `blockedImages`. Every increment of the blocked count
  // lives inside a `!allowRemoteImages` guard in the sanitizer, so the instant
  // Show was clicked the count fell to zero, this went false, the CSP stayed
  // at `img-src data:` — and Show revealed nothing at all. The sanitizer was
  // un-blocking the images and the CSP was re-blocking them in the same pass.
  const wantsRemote = allowRemoteImages && remoteImages > 0
  const srcDoc = useMemo(() => buildSrcdoc(html, { allowRemoteImages: wantsRemote }), [html, wantsRemote])

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
        const root = doc.documentElement
        const body = doc.body

        // Fixed-width mail (a 600 px newsletter table) must shrink to the
        // pane, not clip mid-word: scale the whole sheet with `zoom`, which
        // reflows coherently (heights track it) in WebKit and Chromium.
        // Guarded against observer feedback by only writing a real change.
        if (body) {
          body.style.zoom = ''
          const natural = Math.max(root.scrollWidth, body.scrollWidth)
          const available = frame.clientWidth
          // Floor at 0.5: below half size mail is unreadable anyway, and a
          // pathological 3000 px table should scroll rather than shrink to
          // confetti. Heights measured below already read post-zoom.
          const fit = natural > available + 1 ? Math.max(available / natural, 0.5) : 1
          if (fit < 1) body.style.zoom = String(fit)
        }

        // A table layout's trailing padding does not always reach
        // documentElement.scrollHeight, so take the tallest honest metric.
        const measured = Math.ceil(
          Math.max(
            root.scrollHeight,
            root.offsetHeight,
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
            body?.getBoundingClientRect().height ?? 0,
          ),
        )
        heights.set(message.id, measured)
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
      if (/^(https?|mailto|tel):/i.test(href)) void openExternalUrl(href)
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
      sandbox="allow-same-origin allow-top-navigation-by-user-activation"
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
