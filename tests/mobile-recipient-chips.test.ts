import { describe, expect, it } from 'vitest'

import type { EmailAddress } from '@/core/types'
import {
  isRecipientCommitKey,
  recipientChipState,
  recipientSuggestions,
  reduceRecipientChips,
} from '@/features/compose/recipient-chips'

const address = (email: string, name?: string): EmailAddress => name ? { email, name } : { email }

describe('recipient chip reducer', () => {
  it('commits one address and preserves its display name', () => {
    const typed = reduceRecipientChips(recipientChipState(), [], {
      type: 'input',
      value: 'Ada Lovelace <ada@example.com>',
    })
    expect(reduceRecipientChips(typed.state, typed.recipients, { type: 'commit' })).toEqual({
      recipients: [address('ada@example.com', 'Ada Lovelace')],
      state: { input: '', invalid: false },
    })
  })

  it('commits every valid pasted address and leaves invalid text editable', () => {
    const result = reduceRecipientChips(recipientChipState(), [], {
      type: 'paste',
      value: 'Ada <ada@example.com>, broken, bob@example.com',
    })
    expect(result.recipients.map((item) => item.email)).toEqual([
      'ada@example.com',
      'bob@example.com',
    ])
    expect(result.state).toEqual({ input: 'broken', invalid: true })
  })

  it('removes the last chip on Backspace only when the input is empty', () => {
    const recipients = [address('a@example.com'), address('b@example.com')]
    const initial = recipientChipState()
    expect(reduceRecipientChips(initial, recipients, { type: 'backspace' }).recipients).toEqual([
      address('a@example.com'),
    ])
    const typing = { ...initial, input: 'c' }
    expect(reduceRecipientChips(typing, recipients, { type: 'backspace' })).toEqual({
      state: typing,
      recipients,
    })
  })

  it('removes a tapped chip case-insensitively', () => {
    const recipients = [address('Ada@Example.com'), address('b@example.com')]
    expect(reduceRecipientChips(recipientChipState(), recipients, { type: 'remove', email: 'ada@example.com' }).recipients)
      .toEqual([address('b@example.com')])
  })

  it('uses the same commit keys on desktop and phone', () => {
    for (const key of ['Enter', ',', ';', 'Tab']) {
      expect(isRecipientCommitKey(key, 'ada@example.com')).toBe(true)
    }
    expect(isRecipientCommitKey(' ', 'ada@example.com')).toBe(true)
    expect(isRecipientCommitKey(' ', 'Ada Lovelace')).toBe(false)
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
