import type { EmailAddress } from '@/core/types'
import { dedupeAddresses, parseAddresses } from '@/lib/compose'

export interface RecipientChipState {
  recipients: EmailAddress[]
  input: string
  invalid: string[]
}

export type RecipientChipAction =
  | { type: 'input'; value: string }
  | { type: 'commit' }
  | { type: 'paste'; value: string }
  | { type: 'backspace' }
  | { type: 'remove'; email: string }
  | { type: 'select'; address: EmailAddress }

export function recipientChipState(recipients: EmailAddress[] = []): RecipientChipState {
  return { recipients: dedupeAddresses(recipients), input: '', invalid: [] }
}

export function reduceRecipientChips(
  state: RecipientChipState,
  action: RecipientChipAction,
): RecipientChipState {
  switch (action.type) {
    case 'input':
      return { ...state, input: action.value, invalid: [] }
    case 'commit':
      return commitRecipientInput(state)
    case 'paste':
      return commitRecipientInput({
        ...state,
        input: state.input.trim() ? `${state.input}, ${action.value}` : action.value,
      })
    case 'backspace':
      if (state.input !== '' || state.recipients.length === 0) return state
      return { ...state, recipients: state.recipients.slice(0, -1), invalid: [] }
    case 'remove':
      return {
        ...state,
        recipients: state.recipients.filter(
          (address) => address.email.toLowerCase() !== action.email.toLowerCase(),
        ),
        invalid: [],
      }
    case 'select':
      return {
        recipients: dedupeAddresses([...state.recipients, action.address]),
        input: '',
        invalid: [],
      }
  }
}

export function commitRecipientInput(state: RecipientChipState): RecipientChipState {
  if (state.input.trim() === '') return { ...state, input: '', invalid: [] }
  const parsed = parseAddresses(state.input)
  return {
    recipients: dedupeAddresses([...state.recipients, ...parsed.addresses]),
    input: parsed.invalid.join(', '),
    invalid: parsed.invalid,
  }
}

export function recipientSuggestions(
  participants: EmailAddress[],
  query: string,
  selected: EmailAddress[],
  selfEmails: string[],
  limit = 4,
): EmailAddress[] {
  const term = query.trim().toLowerCase()
  if (!term) return []
  const blocked = new Set(
    [...selected.map((address) => address.email), ...selfEmails].map((email) => email.toLowerCase()),
  )
  return dedupeAddresses(participants)
    .filter((address) => !blocked.has(address.email.toLowerCase()))
    .filter((address) =>
      address.email.toLowerCase().includes(term) || address.name?.toLowerCase().includes(term),
    )
    .slice(0, limit)
}
