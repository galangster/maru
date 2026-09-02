// The one door onto the sidebar toggle — issue #57.
//
// Three controls ask for the same flip: ⌥⌘S, the palette's "Toggle sidebar",
// and the footer's panel button. All three used to write the preference
// directly, which is why a narrow window answered the key by drawing the wide
// sidebar inside a rail it could not fill.
//
// The decision is one line — `toggleSidebar` refuses when the window cannot
// seat a wide sidebar — and this file is what turns that refusal into
// something the person can read. A shortcut that does nothing and says nothing
// is the other half of what the issue reported: "there is nothing on screen to
// say that is what to do."

import { toast } from 'sonner'

import { useUi } from '@/features/mail/ui-store'

/**
 * A no-op with a hint, rather than an overlay sidebar.
 *
 * An overlay would be a new class of surface — a fifth thing that floats, with
 * its own scrim, its own focus trap and its own dismissal — bought for a
 * window size the desktop app is rarely at and that Maru already answers with
 * a whole phone shell. It would also spend a glass layer the way DIRECTION §7
 * rule 1 forbids, on top of whatever dialog is already up. The rail is not a
 * broken sidebar: every mailbox is still one click away, and the toggle's job
 * at that width is to say why the wide form is not available and what returns
 * it. The issue asked for exactly this — "at a width where neither is possible
 * it should do nothing" — plus the sentence that was missing.
 */
export function requestSidebarToggle(): void {
  if (useUi.getState().toggleSidebar()) return
  toast('The window is too narrow for the wide sidebar', {
    description: 'Make the window wider and it opens again.',
  })
}
