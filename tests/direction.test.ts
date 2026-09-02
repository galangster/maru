// Which way a piece of mail reads — issue #59.
//
// Arabic and Hebrew mail rendered with a left-to-right base direction has
// correct words and wrong everything else: a sentence that ends in a full stop
// shows it at the right-hand end of the line, and a body aligns to the left
// edge of the sheet. This is the first-strong rule the fix runs on the subject,
// the sender, the snippet and the body.

import { describe, it, expect } from 'vitest'

import { textDirection } from '../src/lib/direction'

// The subject from the issue's own reproduction, and its Hebrew counterpart.
const ARABIC = 'مرحبا بالعالم.'
const HEBREW = 'שלום עולם.'

describe('textDirection', () => {
  it('reads Arabic and Hebrew right to left', () => {
    expect(textDirection(ARABIC)).toBe('rtl')
    expect(textDirection(HEBREW)).toBe('rtl')
  })

  it('reads a whole Arabic body right to left', () => {
    expect(textDirection('هذه رسالة من سطرين. والسطر الثاني هنا.')).toBe('rtl')
  })

  it('leaves the chrome and English mail alone', () => {
    expect(textDirection('Tuesday walkthrough')).toBe('ltr')
    expect(textDirection('(no subject)')).toBe('ltr')
  })

  it('follows whichever script leads on a mixed line', () => {
    expect(textDirection(`${ARABIC} and a note in English`)).toBe('rtl')
    expect(textDirection(`A note in English and ${ARABIC}`)).toBe('ltr')
    expect(textDirection(`${HEBREW} Nick Galang`)).toBe('rtl')
  })

  it('skips the neutrals in front of the first real word', () => {
    // Punctuation, digits, spaces and emoji have no direction of their own, so
    // a forwarded Arabic subject still reads right to left.
    expect(textDirection(`«${ARABIC}»`)).toBe('rtl')
    expect(textDirection(`2026 ${HEBREW}`)).toBe('rtl')
    expect(textDirection(`👨‍👩‍👧‍👦 ${ARABIC}`)).toBe('rtl')
    // ...and a Latin prefix still leads, which is what "Re:" does in practice.
    expect(textDirection(`Re: ${ARABIC}`)).toBe('ltr')
  })

  it('falls back to the app own direction when there is nothing to read', () => {
    expect(textDirection('')).toBe('ltr')
    expect(textDirection(null)).toBe('ltr')
    expect(textDirection(undefined)).toBe('ltr')
    expect(textDirection('… — · 2026')).toBe('ltr')
    expect(textDirection('👍')).toBe('ltr')
  })

  it('does not mistake an email address for prose', () => {
    // An address is an identifier and is written the same way in every
    // language, which is why the reading pane leaves it left to right.
    expect(textDirection('nick@gmail.com')).toBe('ltr')
  })
})
