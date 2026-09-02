// The send toast's one rule: the Undo button exists exactly while the mail can
// still be taken back. Issue 2 was the other case — "Sent" on screen with a
// live-looking Undo that did nothing.

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SEND_TOAST, TOAST_TEXT_MAX, clampToastText, sendToastOptions } from '@/features/compose/send-toast'

describe('sendToastOptions', () => {
  it('offers Undo, for the length of the hold, while the send is still held', () => {
    const undo = () => {}
    const options = sendToastOptions('Tuesday walkthrough', { onClick: undo, durationMs: 4000 })
    expect(options.id).toBe(SEND_TOAST)
    expect(options.duration).toBe(4000)
    expect(options.action?.label).toBe('Undo')
    options.action?.onClick()
  })

  it('withdraws Undo once the send has committed', () => {
    const options = sendToastOptions('Tuesday walkthrough')
    expect(options.action).toBeUndefined()
  })

  it('always carries the action key, so an update cannot inherit the old button', () => {
    // sonner updates a toast by spreading the new options over the old ones.
    // An omitted key would leave the previous Undo standing — the defect.
    const settled = sendToastOptions('Tuesday walkthrough')
    expect(Object.hasOwn(settled, 'action')).toBe(true)

    const onScreen = { ...sendToastOptions('x', { onClick: () => {}, durationMs: 4000 }) }
    expect({ ...onScreen, ...settled }.action).toBeUndefined()
  })

  it('keeps one id, so a second send replaces the first toast', () => {
    expect(sendToastOptions('a').id).toBe(sendToastOptions('b', { onClick: () => {}, durationMs: 1 }).id)
  })

  it('clamps the subject, so the toast stays the size of a toast (issue 41)', () => {
    // The reported case: ~5,000 characters with no spaces, which printed in
    // full and made the confirmation ~3,700 px tall.
    const pasted = 'x'.repeat(5000)
    const description = sendToastOptions(pasted).description
    expect(description.length).toBe(TOAST_TEXT_MAX)
    expect(description.endsWith('…')).toBe(true)
  })

  it('clamps on the undo step too, so the two steps cannot disagree', () => {
    const held = sendToastOptions('y'.repeat(5000), { onClick: () => {}, durationMs: 4000 })
    expect(held.description.length).toBe(TOAST_TEXT_MAX)
    expect(held.action?.label).toBe('Undo')
  })
})

describe('clampToastText', () => {
  it('leaves a subject that fits exactly as it was', () => {
    expect(clampToastText('Tuesday walkthrough')).toBe('Tuesday walkthrough')
  })

  it('collapses whitespace, so a pasted newline is not a line of toast height', () => {
    expect(clampToastText('  Tuesday\n\n walkthrough  ')).toBe('Tuesday walkthrough')
  })

  it('never returns more than the maximum', () => {
    expect(clampToastText('a'.repeat(TOAST_TEXT_MAX)).length).toBe(TOAST_TEXT_MAX)
    expect(clampToastText('a'.repeat(TOAST_TEXT_MAX + 1)).length).toBe(TOAST_TEXT_MAX)
  })
})

/**
 * The other half of the same guarantee, and the half the phone was missing.
 *
 * `clampToastText` bounds the string; the two-line box bounds what the string
 * becomes when it has nothing to break on. The desktop had that box in
 * `features/shell/surfaces.css`, which `App.tsx` imports — and the phone shell
 * never mounts `App.tsx`, so a 140-character subject with no spaces still grew
 * the confirmation up the screen until it covered the app (issue 47).
 *
 * One stylesheet now, imported by both shells, so the rule cannot be fixed on
 * one of them and missed on the other. Asserted against the file rather than a
 * rendered toast because sonner renders into a portal outside any component
 * under test, and the defect is a missing rule rather than a wrong value.
 */
describe('both shells clamp the toast description box', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const css = read('../src/features/shell/toast.css')
  const rule = css.slice(css.indexOf('[data-sonner-toaster]'))
  const declarations = rule.slice(0, rule.indexOf('}'))

  it('holds the description to two lines', () => {
    expect(declarations).toContain('-webkit-line-clamp: 2')
  })

  it('lets a subject with no spaces in it break', () => {
    expect(declarations).toContain('overflow-wrap: anywhere')
  })

  it('reaches the desktop shell', () => {
    expect(read('../src/App.tsx')).toContain("import '@/features/shell/toast.css'")
  })

  it('reaches the phone shell, which never mounts App.tsx', () => {
    expect(read('../src/mobile/MobileApp.tsx')).toContain("import '@/features/shell/toast.css'")
  })

  it('is written once and not once per shell', () => {
    // The defect was two copies of five declarations, one of them missing.
    for (const path of ['../src/mobile/mobile.css', '../src/features/shell/surfaces.css']) {
      expect(read(path)).not.toContain('-webkit-line-clamp: 2')
    }
  })
})
