import type { EmailAddress } from '@/core/types'
import { dedupeAddresses, parseAddress, parseAddresses } from '@/lib/compose'
import { correspondents } from '@/lib/format'

export interface RecipientChipState {
  input: string
  invalid: boolean
}

export interface RecipientChipResult {
  state: RecipientChipState
  recipients: EmailAddress[]
}

export type RecipientChipAction =
  | { type: 'input'; value: string }
  | { type: 'commit' }
  | { type: 'paste'; value: string }
  | { type: 'backspace' }
  | { type: 'remove'; email: string }
  | { type: 'select'; address: EmailAddress }

export function recipientChipState(): RecipientChipState {
  return { input: '', invalid: false }
}

export function reduceRecipientChips(
  state: RecipientChipState,
  recipients: EmailAddress[],
  action: RecipientChipAction,
): RecipientChipResult {
  switch (action.type) {
    case 'input':
      return result(recipients, action.value, false)
    case 'commit':
      return commitRecipientInput(state, recipients)
    case 'paste':
      return commitRecipientInput(
        { input: state.input.trim() ? `${state.input}, ${action.value}` : action.value, invalid: false },
        recipients,
      )
    case 'backspace':
      if (state.input !== '' || recipients.length === 0) return { state, recipients }
      return result(recipients.slice(0, -1), '', false)
    case 'remove':
      return result(
        recipients.filter((address) => address.email.toLowerCase() !== action.email.toLowerCase()),
        state.input,
        false,
      )
    case 'select':
      return result(dedupeAddresses([...recipients, action.address]), '', false)
  }
}

export function commitRecipientInput(
  state: RecipientChipState,
  recipients: EmailAddress[],
): RecipientChipResult {
  if (state.input.trim() === '') return result(recipients, '', false)
  const parsed = parseAddresses(state.input)
  return result(
    parsed.addresses.length > 0
      ? dedupeAddresses([...recipients, ...parsed.addresses])
      : recipients,
    parsed.invalid.join(', '),
    parsed.invalid.length > 0,
  )
}

/** The keyboard contract shared by desktop and phone recipient fields. */
export function isRecipientCommitKey(key: string, input: string): boolean {
  return key === 'Enter'
    || key === ','
    || key === ';'
    || key === 'Tab'
    || (key === ' ' && parseAddress(input) !== null)
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
  const self = new Set(selfEmails.map((email) => email.toLowerCase()))
  const blocked = new Set(selected.map((address) => address.email.toLowerCase()))
  return dedupeAddresses(correspondents(participants, selfEmails))
    .filter((address) => !self.has(address.email.toLowerCase()))
    .filter((address) => !blocked.has(address.email.toLowerCase()))
    .filter((address) =>
      address.email.toLowerCase().includes(term) || address.name?.toLowerCase().includes(term),
    )
    .slice(0, limit)
}

function result(
  recipients: EmailAddress[],
  input: string,
  invalid: boolean,
): RecipientChipResult {
  return { state: { input, invalid }, recipients }
}
