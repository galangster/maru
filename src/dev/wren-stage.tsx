// The character tuning stage — `?tune=1` (P13 v2).
//
// A bare room for Maru: the five-beat inbox-zero sequence on a DialKit panel,
// exactly the reference workflow (kolbeyang's bunny — GSAP + DialKit; ours is
// motion/react + DialKit). main.tsx lazy-mounts this INSTEAD of the app, so
// dialkit stays in its own chunk and never loads on the mail path.
//
// The panel's defaults are CELEBRATION_DEFAULTS — tuning here changes nothing
// until the settled numbers are written back into wren-celebration.tsx and
// ratified. Timing sliders apply on the next Replay; the rest apply live.

import { useState } from 'react'
import { DialRoot, useDialKit } from 'dialkit'
import 'dialkit/styles.css'

import { CELEBRATION_DEFAULTS, WrenCelebration } from '@/components/wren-celebration'
import { useMotionMode } from '@/lib/motion'

const D = CELEBRATION_DEFAULTS

export default function WrenStage() {
  // The stage honours the OS preference like every other surface — a tuner
  // with reduced motion set sees exactly what that mode ships.
  const mode = useMotionMode()
  const [replayCount, setReplayCount] = useState(0)
  const replay = () => setReplayCount((n) => n + 1)

  const params = useDialKit(
    'Inbox zero — five beats',
    {
      timing: {
        notice: [D.timing.notice, 0, 600],
        crouch: [D.timing.crouch, 0, 800],
        leap: [D.timing.leap, 0, 1200],
        apex: [D.timing.apex, 0, 1600],
        settle: [D.timing.settle, 0, 2400],
      },
      notice: { tilt: [D.notice.tilt, -15, 15], lift: [D.notice.lift, 0, 10] },
      crouch: {
        squashY: [D.crouch.squashY, 0.7, 1],
        stretchX: [D.crouch.stretchX, 1, 1.3],
        sink: [D.crouch.sink, 0, 12],
      },
      leap: {
        rise: [D.leap.rise, 0, 60],
        tilt: [D.leap.tilt, -15, 15],
        crossfadeMs: [D.leap.crossfadeMs, 40, 400],
      },
      apex: { pop: [D.apex.pop, 1, 1.4] },
      settle: { hover: [D.settle.hover, 0, 24] },
      spring: {
        stiffness: [D.spring.stiffness, 50, 800],
        damping: [D.spring.damping, 5, 60],
      },
      replay: { type: 'action' },
    },
    { onAction: replay },
  )

  return (
    <div className="bg-canvas relative flex h-dvh items-center justify-center">
      <DialRoot position="top-right" />
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Replay the sequence"
        onClick={replay}
      />
      <div className="pointer-events-none">
        <WrenCelebration mode={mode} params={params} replayTrigger={replayCount} />
      </div>
    </div>
  )
}
