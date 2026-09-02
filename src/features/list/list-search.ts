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
 * The search field's own state, and the rule that keeps an input method out
 * of the results — issue #60.
 *
 * Typing Japanese, Chinese or Korean puts a run of intermediate strings in the
 * field before the word has been chosen. Typing "maya" in kana wrote "m",
 * "ma", "まや" — and search answered each of them, so the results churned
 * through partial romaji and the pane read `No matches — Nothing from the last
 * 90 days mentions "まや"` for a string the person never meant to search for.
 * Only the last of those is the word they were typing.
 *
 * Debouncing cannot fix this. Every intermediate state is a real value that
 * arrives with the person still typing, so a longer wait only moves which
 * partial word gets answered. The input method itself is what says when the
 * word is finished, and `compositionstart` / `compositionend` are how it says
 * it.
 *
 * Two values rather than one, and that is the whole idea. `text` is what the
 * field shows and always follows the input method, so the candidate characters
 * appear as they are typed. `query` is what search answers, and it does not
 * move while a composition is open.
 *
 * Latin typing is unaffected: it opens no composition, so every keystroke is
 * both a `text` and a `query`, exactly as before.
 */
export interface SearchInputState {
  /** What is in the field, mid-composition included. */
  text: string
  /** What search has been asked. Never a half-finished composition. */
  query: string
  /** True between `compositionstart` and `compositionend`. */
  composing: boolean
}

export type SearchInputEvent =
  | { type: 'input'; value: string; isComposing?: boolean }
  | { type: 'compositionstart' }
  | { type: 'compositionend'; value: string }

/** The field's state at the moment it opens, from whatever it already holds. */
export function initialSearchInput(text: string): SearchInputState {
  return { text, query: text, composing: false }
}

export function searchInput(
  state: SearchInputState,
  event: SearchInputEvent,
): SearchInputState {
  switch (event.type) {
    case 'compositionstart':
      return state.composing ? state : { ...state, composing: true }
    // The word the input method settled on. It runs ONCE, here, and it runs
    // even when the browser sends no further input event of its own — WebKit
    // and Gecko order `compositionend` after the last input, Blink before it,
    // and this has to be right on both.
    case 'compositionend':
      return { text: event.value, query: event.value, composing: false }
    case 'input': {
      // `isComposing` off the event as well as the flag we are holding: the
      // event carries the browser's own answer, and a composition that is
      // cancelled rather than committed can leave the two out of step.
      const composing = state.composing || event.isComposing === true
      return {
        text: event.value,
        query: composing ? state.query : event.value,
        composing,
      }
    }
  }
}
