// The character tuning stage — `?tune=1` (P13 v2).
//
// A bare room for Maru: the SHIPPED inbox-zero sequence on a DialKit panel,
// exactly the reference workflow (kolbeyang's bunny — GSAP + DialKit; ours is
// WAAPI + motion/react + DialKit). main.tsx lazy-mounts this INSTEAD of the
// app, so dialkit stays in its own chunk and never loads on the mail path.
//
// The dials write the character's amplitude TOKENS onto <html>, which is where
// the sequencer reads them from (getComputedStyle at call time). That is the
// whole reason this stage tunes the real thing rather than a copy of it:
// there is no second set of numbers to write back at seal, only the defaults
// in tokens.css to update if the owner ratifies a change. Amplitudes apply on
// the next replay, because the WAAPI timeline is built when it is called.

import { useEffect, useState } from 'react'
import { DialRoot, useDialKit } from 'dialkit'
import 'dialkit/styles.css'

import { WrenCelebration } from '@/components/wren-celebration'
import { useMotionMode } from '@/lib/motion'

/**
 * Every dial is one custom property: its default here is the token's default
 * in tokens.css, and `unit` is what CSS needs appended to a slider's number.
 */
const DIALS = {
  size: { prop: '--wren-maru-size', range: [144, 96, 240], unit: 'px' },
  fly: { prop: '--wren-fly', range: [64, 0, 160], unit: 'px' },
  squash: { prop: '--wren-squash', range: [0.12, 0, 0.4], unit: '' },
  spin: { prop: '--wren-spin', range: [-8, -24, 24], unit: 'deg' },
  flap: { prop: '--wren-flap', range: [14, 0, 45], unit: 'deg' },
  pop: { prop: '--wren-pop-lg', range: [1.12, 1, 1.4], unit: '' },
  float: { prop: '--wren-float', range: [7, 0, 24], unit: 'px' },
  breath: { prop: '--wren-breath', range: [0.025, 0, 0.12], unit: '' },
  tilt: { prop: '--wren-tilt', range: [3.5, 0, 15], unit: 'deg' },
  shift: { prop: '--wren-shift', range: [3, 0, 12], unit: 'px' },
  shrug: { prop: '--wren-shrug', range: [5, 0, 24], unit: 'deg' },
} as const satisfies Record<string, { prop: string; range: [number, number, number]; unit: string }>

type DialName = keyof typeof DIALS
const NAMES = Object.keys(DIALS) as DialName[]

export default function WrenStage() {
  // The stage honours the OS preference like every other surface — a tuner
  // with reduced motion set sees exactly what that mode ships.
  const mode = useMotionMode()
  const [replayCount, setReplayCount] = useState(0)
  const replay = () => setReplayCount((n) => n + 1)

  // The cast is because the panel's config is built from DIALS rather than
  // written out as a literal, so dialkit's generic cannot see the keys. One
  // table beats two parallel ones that can drift.
  const values = useDialKit(
    'Inbox zero — the character',
    {
      ...Object.fromEntries(NAMES.map((name) => [name, [...DIALS[name].range]])),
      replay: { type: 'action' },
    },
    { onAction: replay },
  ) as unknown as Record<DialName, number>

  useEffect(() => {
    const root = document.documentElement
    for (const name of NAMES) {
      const { prop, unit } = DIALS[name]
      if (typeof values[name] === 'number') root.style.setProperty(prop, `${values[name]}${unit}`)
    }
    return () => {
      for (const name of NAMES) root.style.removeProperty(DIALS[name].prop)
    }
  }, [values])

  return (
    <div className="bg-canvas relative flex h-dvh items-center justify-center">
      <DialRoot position="top-right" />
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Replay the sequence"
        onClick={replay}
      />
      <div className="wren-empty pointer-events-none flex h-dvh w-full items-center justify-center">
        <WrenCelebration mode={mode} replayTrigger={replayCount} />
      </div>
    </div>
  )
}
