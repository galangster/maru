// The search field during an input-method composition — issue #60.
//
// Typing "maya" in kana used to run a search for "m", then for "ma" — which
// matches six threads — then for "まや", which matches none, so the pane read
// "No matches" for a string the person never meant to search for. The end
// state was correct; everything in between was not.

import { describe, it, expect } from 'vitest'

import { initialSearchInput, searchInput, type SearchInputEvent } from '../src/features/list/list-search'

/** Replay a run of events the way the field would. */
function type(...events: SearchInputEvent[]) {
  return events.reduce(searchInput, initialSearchInput(''))
}

describe('the search field', () => {
  it('answers every keystroke of Latin typing, as it always did', () => {
    const state = type(
      { type: 'input', value: 'm' },
      { type: 'input', value: 'ma' },
      { type: 'input', value: 'may' },
    )
    expect(state).toEqual({ text: 'may', query: 'may', composing: false })
  })

  it('shows the composition but does not search it', () => {
    // Blink's order: compositionstart, then an input event per candidate.
    const state = type(
      { type: 'compositionstart' },
      { type: 'input', value: 'm', isComposing: true },
      { type: 'input', value: 'ma', isComposing: true },
      { type: 'input', value: 'まや', isComposing: true },
    )
    // The field shows what the input method put there...
    expect(state.text).toBe('まや')
    // ...and search has not been asked anything at all.
    expect(state.query).toBe('')
    expect(state.composing).toBe(true)
  })

  it('runs once, on the word that was chosen', () => {
    const state = type(
      { type: 'compositionstart' },
      { type: 'input', value: 'm', isComposing: true },
      { type: 'input', value: 'ma', isComposing: true },
      { type: 'input', value: 'まや', isComposing: true },
      { type: 'compositionend', value: 'マヤ' },
    )
    expect(state).toEqual({ text: 'マヤ', query: 'マヤ', composing: false })
  })

  it('is right whichever side of the last input the browser ends on', () => {
    // WebKit and Gecko send the settled value as an input event AFTER
    // compositionend. It must not re-open the composition or change the
    // answer.
    const state = type(
      { type: 'compositionstart' },
      { type: 'input', value: 'ま', isComposing: true },
      { type: 'compositionend', value: 'マヤ' },
      { type: 'input', value: 'マヤ', isComposing: false },
    )
    expect(state).toEqual({ text: 'マヤ', query: 'マヤ', composing: false })
  })

  it('keeps the previous answer on screen while a new word is composed', () => {
    // The person has searched for something, then starts composing again. The
    // results they already have must not be replaced by partial romaji.
    const settled = type(
      { type: 'input', value: 'walkthrough' },
      { type: 'compositionstart' },
      { type: 'input', value: 'ma', isComposing: true },
    )
    expect(settled.text).toBe('ma')
    expect(settled.query).toBe('walkthrough')
  })

  it('trusts the event when no compositionstart was seen', () => {
    // Some input methods and some remote-desktop paths deliver the flag
    // without the pair of events around it.
    const state = searchInput(initialSearchInput(''), {
      type: 'input',
      value: 'ま',
      isComposing: true,
    })
    expect(state.query).toBe('')
    expect(state.composing).toBe(true)
  })
})
