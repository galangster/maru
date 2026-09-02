import { useEffect } from 'react'

/**
 * Holds the page still while a sheet is up.
 *
 * The document is the phone's scroller now (mobile.css), so without this a drag
 * anywhere on a sheet or its scrim scrolls the inbox behind it — and scrolling
 * behind a modal is also what would minimize the native tab bar under one.
 *
 * `position: fixed` on the body rather than `overflow: hidden` on the root:
 * WebKit keeps touch-scrolling a document that was already scrolled when the
 * overflow changes, and pinning the body is the only version that holds for
 * both the scrim drag and the momentum of a fling already in flight. The offset
 * is put back on release, so the sheet closes onto the same rows it opened on.
 *
 * Counted, because the account route can stack a sheet over a sheet.
 */
let locks = 0
let offset = 0

export function useBodyScrollLock(): void {
  useEffect(() => {
    if (locks === 0) {
      offset = window.scrollY
      const style = document.body.style
      style.position = 'fixed'
      style.top = `${-offset}px`
      style.left = '0'
      style.right = '0'
    }
    locks += 1
    return () => {
      locks -= 1
      if (locks > 0) return
      const style = document.body.style
      style.position = ''
      style.top = ''
      style.left = ''
      style.right = ''
      window.scrollTo(0, offset)
    }
  }, [])
}
