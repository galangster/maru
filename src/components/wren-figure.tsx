// Maru the wren, as a figure — the canonical character (P13, Nick's sheet)
// rendered from the traced pose paths in src/assets/wren-poses.ts.
//
// The character's palette is its own (sheet: #FF4F87 · #FFD6E1 · #FEE9EF ·
// ink #1A1A1A) and deliberately NOT the app accent: Maru the bird is hot
// pink whatever the chrome does. The white body needs ground, so the figure
// sits on a soft blob — pale pink on paper, a pink wash in the dark theme.
//
// Idle life (perched, `alive`): breathing (2.5% scale from the feet, 3.4s),
// a blink every 3–7s (eye scaleY), and the pupil-gaze the old mark had.
// All of it is gated to full motion mode — reduced motion and the capture
// path get a perfectly still bird.

import { useEffect, useRef } from 'react'

import { WREN_FLIGHT, WREN_PERCHED, type WrenPose } from '@/assets/wren-poses'
import { cn } from '@/lib/utils'

const WREN_PINK = '#FF4F87'
const PALE = '#FFD6E1'
const SHADOW = '#FF7BA1'

/**
 * The ground the white body needs: a soft blob, pale pink on paper, a pink
 * wash in the dark theme. It lives here — the blob is part of how the
 * character is presented, not a consumer's styling decision.
 */
export function WrenBlob({
  align = 'center',
  className,
  children,
}: {
  align?: 'center' | 'end'
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'flex h-28 w-36 justify-center rounded-[28px]',
        'bg-[#FEE9EF] dark:bg-[#FF4F87]/14 select-none pointer-events-none',
        align === 'end' ? 'items-end pb-1' : 'items-center',
        className,
      )}
    >
      {children}
    </span>
  )
}

function Pose({
  pose,
  eyeRef,
  eyeScale = 1,
  shadow = true,
}: {
  pose: WrenPose
  eyeRef?: React.Ref<SVGGElement>
  eyeScale?: number
  shadow?: boolean
}) {
  const [x0, y0, x1, y1] = pose.eye
  const w = (x1 - x0) * eyeScale
  const h = (y1 - y0) * eyeScale
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2

  return (
    <>
      {shadow && <ellipse cx="230" cy="404" rx="95" ry="11" fill={SHADOW} opacity="0.35" />}
      {pose.pale.map((d) => (
        <path key={d.slice(0, 24)} d={d} fill={PALE} />
      ))}
      {/* data-wren-body is the breathing joint. */}
      <g data-wren-body>
        <path d={pose.body} fill="#FFFFFF" />
        {pose.pink.map((d) => (
          <path key={d.slice(0, 24)} d={d} fill={WREN_PINK} />
        ))}
        {/* The eye: a hot-pink pill with the sheet's top highlight. The group
            is the blink joint (scaleY from its own center). */}
        <g
          ref={eyeRef}
          data-wren-eye
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={w / 2} fill={WREN_PINK} />
          <circle cx={cx} cy={cy - h / 2 + w / 2} r={w / 3} fill="#FFFFFF" />
        </g>
      </g>
    </>
  )
}

/**
 * The gaze: the eye follows the pointer by up to 2px, written to
 * `style.translate` so it composes with the blink's `style.transform` on the
 * same group. Measures the STATIC svg root and derives the eye's center from
 * the pose data — never the translated group itself, whose rect would feed
 * each frame's answer into the next (the guard the old pupil carried).
 */
function useGaze(
  on: boolean,
  svg: React.RefObject<SVGSVGElement | null>,
  eye: React.RefObject<SVGGElement | null>,
  pose: WrenPose,
) {
  useEffect(() => {
    if (!on) return
    const [x0, y0, x1, y1] = pose.eye
    const fx = (x0 + x1) / 2 / 440
    const fy = (y0 + y1) / 2 / 440
    let frame = 0
    const onMove = (event: MouseEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = eye.current
        const root = svg.current
        if (!el || !root) return
        const box = root.getBoundingClientRect()
        const dx = event.clientX - (box.left + box.width * fx)
        const dy = event.clientY - (box.top + box.height * fy)
        const distance = Math.hypot(dx, dy) || 1
        const reach = Math.min(distance / 40, 1) * 2
        el.style.translate = `${((dx / distance) * reach).toFixed(1)}px ${((dy / distance) * reach).toFixed(1)}px`
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (frame) cancelAnimationFrame(frame)
      if (eye.current) eye.current.style.translate = ''
    }
  }, [on, svg, eye, pose])
}

/** Blink on a natural clock: 120ms closed, 3–7s apart, only while `on`. */
function useBlink(on: boolean) {
  const eye = useRef<SVGGElement>(null)

  useEffect(() => {
    if (!on) return
    let timer: ReturnType<typeof setTimeout>
    let closed: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      timer = setTimeout(() => {
        const el = eye.current
        if (el) {
          el.style.transform = 'scaleY(0.12)'
          closed = setTimeout(() => {
            el.style.transform = ''
            schedule()
          }, 120)
        }
      }, 3000 + Math.random() * 4000)
    }
    schedule()
    return () => {
      clearTimeout(timer)
      if (closed) clearTimeout(closed)
      if (eye.current) eye.current.style.transform = ''
    }
  }, [on])

  return eye
}

/**
 * The perched Maru — empty states. `alive` turns on breathing, blinking and
 * the gaze; still otherwise (reduced motion, captures).
 */
export function WrenPerched({ alive, className }: { alive: boolean; className?: string }) {
  const svg = useRef<SVGSVGElement>(null)
  const eye = useBlink(alive)
  useGaze(alive, svg, eye, WREN_PERCHED)

  return (
    <svg
      ref={svg}
      viewBox="0 0 440 440"
      aria-hidden
      className={cn('pointer-events-none select-none', className)}
      data-wren-alive={alive || undefined}
    >
      <Pose pose={WREN_PERCHED} eyeRef={eye} />
    </svg>
  )
}

/** The flying Maru — the inbox-zero celebration, sparkles included. */
export function WrenFlying({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 440"
      aria-hidden
      className={cn('pointer-events-none select-none', className)}
    >
      <Pose pose={WREN_FLIGHT} shadow={false} />
    </svg>
  )
}

/**
 * The flight bird arriving on `wren-celebrate-in` and bobbing on `wren-float`.
 * One markup for every celebration surface — the shipped CelebrationMark and
 * the five-beat scaffold's reduced-motion path both render this, so the
 * reduced/capture contract cannot fork across files.
 *
 * The keyframes are unconditional. Every quantity in them — the start scale,
 * the overshoot, the spin, the duration, the float distance — is a token the
 * reduced-motion block in tokens.css zeroes, so what plays there is the 120 ms
 * opacity crossfade DIRECTION §9 asks for, and `.screenshot` removes it
 * outright in the capture path. A JS copy of that rule would be a second
 * answer to a question tokens.css has already settled.
 */
export function WrenFlyingArrival() {
  return (
    <span
      aria-hidden
      className="inline-flex leading-none"
      style={{
        animation:
          'wren-celebrate-in var(--wren-dur-celebrate) var(--wren-ease-spring) both, ' +
          'wren-float var(--wren-dur-float) ease-in-out var(--wren-dur-celebrate) infinite alternate',
      }}
    >
      <WrenBlob>
        <WrenFlying className="h-24 w-24" />
      </WrenBlob>
    </span>
  )
}
