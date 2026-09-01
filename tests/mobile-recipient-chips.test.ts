import { describe, expect, it } from 'vitest'

import type { EmailAddress } from '@/core/types'
import {
  recipientChipState,
  recipientSuggestions,
  reduceRecipientChips,
} from '@/mobile/recipient-chips'

const address = (email: string, name?: string): EmailAddress => name ? { email, name } : { email }

describe('recipient chip reducer', () => {
  it('commits one address and preserves its display name', () => {
    const typed = reduceRecipientChips(recipientChipState(), {
      type: 'input',
      value: 'Ada Lovelace <ada@example.com>',
    })
    expect(reduceRecipientChips(typed, { type: 'commit' })).toEqual({
      recipients: [address('ada@example.com', 'Ada Lovelace')],
      input: '',
      invalid: [],
    })
  })

  it('commits every valid pasted address and leaves invalid text editable', () => {
    const result = reduceRecipientChips(recipientChipState(), {
      type: 'paste',
      value: 'Ada <ada@example.com>, broken, bob@example.com',
    })
    expect(result.recipients.map((item) => item.email)).toEqual([
      'ada@example.com',
      'bob@example.com',
    ])
    expect(result.input).toBe('broken')
    expect(result.invalid).toEqual(['broken'])
  })

  it('removes the last chip on Backspace only when the input is empty', () => {
    const initial = recipientChipState([address('a@example.com'), address('b@example.com')])
    expect(reduceRecipientChips(initial, { type: 'backspace' }).recipients).toEqual([
      address('a@example.com'),
    ])
    const typing = { ...initial, input: 'c' }
    expect(reduceRecipientChips(typing, { type: 'backspace' })).toBe(typing)
  })

  it('removes a tapped chip case-insensitively', () => {
    const initial = recipientChipState([address('Ada@Example.com'), address('b@example.com')])
    expect(reduceRecipientChips(initial, { type: 'remove', email: 'ada@example.com' }).recipients)
      .toEqual([address('b@example.com')])
  })
})

describe('recipient suggestions', () => {
  const people = [
    address('ada@example.com', 'Ada Lovelace'),
    address('alan@example.com', 'Alan Turing'),
    address('me@example.com', 'Me'),
    address('ADA@EXAMPLE.COM'),
  ]

  it('matches names and addresses while excluding self and selected recipients', () => {
    expect(recipientSuggestions(people, 'ada', [people[1]], ['me@example.com']))
      .toEqual([people[0]])
  })

  it('returns a short deduplicated list', () => {
    const many = Array.from({ length: 8 }, (_, index) => address(`person${index}@example.com`))
    expect(recipientSuggestions(many, 'person', [], [])).toHaveLength(4)
  })
})
