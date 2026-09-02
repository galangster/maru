// @vitest-environment jsdom
//
// Closing an inline surface puts focus back where it was — issue 44.
//
// The four dialogs trap focus and hand it to the thread list, and that is
// right for them: they take the screen. The composer and the search field do
// not, so a keyboard user reaches them from wherever they had tabbed to, and
// dropping focus on the page throws that position away — the next Tab starts
// again at the first control in the app.

import { afterEach, describe, expect, it } from 'vitest'

import { rememberFocusOrigin, restoreFocusOrigin } from '@/features/shell/surface-store'

function button(label: string): HTMLButtonElement {
  const el = document.createElement('button')
  el.textContent = label
  // jsdom lays nothing out, so `getClientRects` is empty for every element it
  // holds. The stub is what makes "still on screen" answerable here; the
  // detached case below overrides it back to nothing.
  el.getClientRects = (() => [{}]) as unknown as HTMLButtonElement['getClientRects']
  document.body.append(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('inline surface focus', () => {
  it('goes back to the control that opened the surface', () => {
    const mailbox = button('Starred')
    const elsewhere = button('Elsewhere')

    mailbox.focus()
    rememberFocusOrigin('composer')
    // What the composer does on open: its To field takes focus.
    elsewhere.focus()

    restoreFocusOrigin('composer')
    expect(document.activeElement).toBe(mailbox)
  })

  it('does not reach for an element that has gone', () => {
    const trigger = button('Search mail')
    trigger.focus()
    rememberFocusOrigin('search')
    // The search trigger is replaced by the field it opens, so by the time the
    // field closes the button that opened it is not in the document.
    trigger.remove()

    restoreFocusOrigin('search')
    expect(document.activeElement).not.toBe(trigger)
  })

  it('keeps a slot per surface, so a search inside a compose loses neither', () => {
    const mailbox = button('Starred')
    const listRow = button('Threads')

    mailbox.focus()
    rememberFocusOrigin('composer')
    listRow.focus()
    rememberFocusOrigin('search')

    restoreFocusOrigin('search')
    expect(document.activeElement).toBe(listRow)
    restoreFocusOrigin('composer')
    expect(document.activeElement).toBe(mailbox)
  })

  it('spends the slot once, so a second close cannot land on a stale origin', () => {
    const mailbox = button('Starred')
    const elsewhere = button('Elsewhere')

    mailbox.focus()
    rememberFocusOrigin('composer')
    elsewhere.focus()
    restoreFocusOrigin('composer')
    expect(document.activeElement).toBe(mailbox)

    elsewhere.focus()
    restoreFocusOrigin('composer')
    expect(document.activeElement).not.toBe(mailbox)
  })
})
