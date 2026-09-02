/**
 * "Is this keystroke going into a field?" — asked in one place.
 *
 * The global keymap has always asked it: a shortcut is a shortcut only while
 * nothing is taking typed text, or `e` archives the thread you are naming in a
 * search box. What the app did not have was the same question available to a
 * *surface* that binds its own accelerators, so the Later menu's `1`..`4`
 * carried on firing after "Pick a date…" replaced the four preset rows with a
 * date field. The field took focus and showed a caret, and every digit in a
 * date that happened to be a preset number closed the menu and saved the thread
 * for a time nobody chose — silently, with a toast that confirmed it (issue
 * #54).
 *
 * So the rule is a module rather than a private helper: an accelerator is
 * suspended while the caret is in something that takes typed text, everywhere,
 * and there is one definition of "takes typed text" to keep current.
 *
 * `closest` rather than the target's own tag, because a field can be reached
 * through a wrapper the surface put around it — and a caret inside a label or a
 * combobox's inner element is still a caret.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.closest('input, textarea, select') !== null
}
