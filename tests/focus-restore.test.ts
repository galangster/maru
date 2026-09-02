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

import {
  forgetFocusOrigin,
  rememberFocusOrigin,
  restoreFocusOrigin,
  takeFocusOrigin,
  useSurfaces,
} from '@/features/shell/surface-store'

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

/**
 * The palette is the one DIALOG in this set — issue #58.
 *
 * The other four replace whatever is up, so the thread list is the right place
 * for them to land. The palette opens ON TOP: with the composer underneath the
 * caret used to leave a half-written message, and with the Save for later menu
 * underneath focus landed on the thread list while the menu was still covering
 * the window, so one Tab walked to a pane divider under a live dialog.
 *
 * The element is taken rather than focused, because Base UI's Dialog moves
 * focus itself as the popup unmounts and `finalFocus` is where it asks.
 */
describe('the command palette over another surface', () => {
  afterEach(() => {
    forgetFocusOrigin('palette')
    useSurfaces.setState({ palette: false, settings: null, later: null })
  })

  it('hands the keyboard back to the row it was opened from', () => {
    const menuRow = button('This evening')
    menuRow.focus()

    useSurfaces.getState().setPalette(true)
    // What the palette does on open: its own field takes focus.
    button('Command palette').focus()

    useSurfaces.getState().setPalette(false)
    expect(takeFocusOrigin('palette')).toBe(menuRow)
  })

  it('spends the slot, so a later close cannot land on a stale row', () => {
    const menuRow = button('This evening')
    menuRow.focus()
    useSurfaces.getState().setPalette(true)

    expect(takeFocusOrigin('palette')).toBe(menuRow)
    expect(takeFocusOrigin('palette')).toBeNull()
  })

  it('keeps the row it was opened from when the palette re-opens over it', () => {
    const menuRow = button('This evening')
    menuRow.focus()
    useSurfaces.getState().setPalette(true)
    // A failed re-open must not record the palette's own field as the origin.
    button('Command palette').focus()
    useSurfaces.getState().setPalette(true)

    expect(takeFocusOrigin('palette')).toBe(menuRow)
  })

  it('drops the slot when a surface TAKES the screen from the palette', () => {
    const listRow = button('Threads')
    listRow.focus()

    useSurfaces.getState().setPalette(true)
    // Two of the palette's own commands close it by opening something else.
    useSurfaces.getState().openLater(['thread-1'])
    expect(useSurfaces.getState().palette).toBe(false)
    // Nothing to hand back: the picker that just opened owns the keyboard.
    expect(takeFocusOrigin('palette')).toBeNull()

    listRow.focus()
    useSurfaces.getState().setPalette(true)
    useSurfaces.getState().openSettings('accounts')
    expect(takeFocusOrigin('palette')).toBeNull()
  })

  it('answers null for an origin that has gone, so the caller can fall back', () => {
    const gone = button('Row that was re-rendered away')
    gone.focus()
    useSurfaces.getState().setPalette(true)
    gone.remove()

    expect(takeFocusOrigin('palette')).toBeNull()
  })

  it('leaves the two inline surfaces to their own slots', () => {
    const mailbox = button('Starred')
    const listRow = button('Threads')

    mailbox.focus()
    rememberFocusOrigin('composer')
    listRow.focus()
    useSurfaces.getState().setPalette(true)

    expect(takeFocusOrigin('palette')).toBe(listRow)
    restoreFocusOrigin('composer')
    expect(document.activeElement).toBe(mailbox)
  })
})
