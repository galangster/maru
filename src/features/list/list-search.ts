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
