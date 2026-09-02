// The send toast's one rule: the Undo button exists exactly while the mail can
// still be taken back. Issue 2 was the other case — "Sent" on screen with a
// live-looking Undo that did nothing.

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
