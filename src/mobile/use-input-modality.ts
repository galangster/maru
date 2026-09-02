import { useEffect } from 'react'

/**
 * Records how the person is driving the shell right now, as
 * `data-input-modality` on the root element.
 *
 * The phone shell draws a focus ring only under `'keyboard'` — mobile.css
 * carries the reasoning, and the short version is that `:focus-visible` is not
 * a reliable answer in WKWebView, because WebKit matches it from the element
 * type as well as from the gesture. A tapped `<select>` or text field matches
 * it, and so does an opener that has focus handed back to it when a sheet
 * closes. On a phone that reads as focus boxes appearing at random.
 *
 * Written straight to the DOM rather than held in React state on purpose. The
 * modality flips on the first key of every typed word and back on the next
 * tap; a state update would re-render the whole shell each time to change one
 * attribute that only CSS reads.
 *
 * `keydown` before `pointerdown` is not an ordering hazard: a key press lands
 * before the focus move it causes, so the attribute is already `'keyboard'` by
 * the time the ring would be painted. Modifier keys are ignored, so a
 * Cmd-click does not count as keyboard navigation.
 */
export function useInputModality(): void {
  useEffect(() => {
    const root = document.documentElement
    const set = (modality: 'keyboard' | 'pointer') => {
      if (root.dataset.inputModality !== modality) root.dataset.inputModality = modality
    }
    // A finger is the default, because on the phone it is the only thing there
    // is, and a shell that has been touched exactly zero times should not be
    // wearing a ring.
    set('pointer')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      set('keyboard')
    }
    const onPointerDown = () => set('pointer')
    // Capture, so the attribute is already right before anything downstream
    // can act on the event. Passive, because neither handler calls
    // `preventDefault` and `pointerdown` is on the path of every scroll the
    // phone starts.
    const listen = { capture: true, passive: true } as const
    window.addEventListener('keydown', onKeyDown, listen)
    window.addEventListener('pointerdown', onPointerDown, listen)
    return () => {
      window.removeEventListener('keydown', onKeyDown, listen)
      window.removeEventListener('pointerdown', onPointerDown, listen)
      delete root.dataset.inputModality
    }
  }, [])
}
