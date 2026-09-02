// The list header's search field, bound to the query layer.
//
// This is the whole of the binding, and it lives here rather than in
// `features/mail/queries.ts` on purpose: the search field belongs to the
// desktop shell, and a hook in the data module that reads the shell store makes
// every consumer of the mail cache — the palette, the mobile shell, a test —
// depend on a surface it does not have.
//
// `useQuerySearch` answers "is a search running, and what did it find" from a
// query string alone. The two lines below are the only place that says the
// query comes from the header, and that it is empty while the header is closed.

import { useQuerySearch } from '@/features/mail/queries'
import { useSurfaces } from '@/features/shell/surface-store'
import { useDebounced } from '@/lib/use-debounced'

/**
 * The list header's search, as ONE derivation shared with the reading pane.
 *
 * The pane was telling people to "pick a thread on the left" while the list
 * said there was nothing there (issue #33). Both callers read this.
 */
export function useListSearch() {
  const searchOpen = useSurfaces((s) => s.searchOpen)
  /** The settled query — what the results on screen actually answer. */
  const query = useDebounced(useSurfaces((s) => s.searchQuery))
  return { query, ...useQuerySearch(searchOpen ? query : '') }
}

/**
 * A search field with an IME in front of it.
 *
 * Typing Japanese, Chinese or Korean goes through a composition: the field
 * fills with intermediate syllables that the person has not chosen yet and is
 * still deciding between, and each of them fires `change` exactly as a typed
 * letter does. A field that searches on every change therefore sends a query
 * for に, then にほ, then にほん — none of which was asked for, and the last of
 * which arrives before the candidate is picked. `compositionend` is the event
 * that says the text is finally what was meant.
 *
 * Two strings, because they are two different facts and the field needs both:
 * `text` is what is drawn, and it must follow every keystroke or the field
 * would fight the IME for the caret. `query` is what is worth searching for,
 * and it stands still until the composition settles.
 *
 * Pure, and a function of the current pair rather than a hook, so both shells
 * can hold the pair wherever they already hold their query — the desktop in
 * the surface store, the phone in the shell above a screen that unmounts
 * (issue 49) — and the rule itself is checked without a keyboard.
 */
export interface SearchInput {
  /** What the field shows. Every keystroke, composed or not. */
  text: string
  /** What to actually search for: the last text that was not mid-composition. */
  query: string
}

export function searchInput(
  current: SearchInput,
  next: { text: string; composing: boolean },
): SearchInput {
  return { text: next.text, query: next.composing ? current.query : next.text }
}
