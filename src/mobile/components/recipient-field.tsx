import { useId, useState, type Dispatch, type SetStateAction } from 'react'

import type { EmailAddress } from '@/core/types'
import { formatAddress, parseAddress } from '@/lib/compose'
import {
  recipientSuggestions,
  reduceRecipientChips,
  type RecipientChipAction,
  type RecipientChipState,
} from '../recipient-chips'

export function RecipientField({
  label,
  state,
  setState,
  participants,
  selfEmails,
  onRecipientsChange,
}: {
  label: string
  state: RecipientChipState
  setState: Dispatch<SetStateAction<RecipientChipState>>
  participants: EmailAddress[]
  selfEmails: string[]
  onRecipientsChange: (recipients: EmailAddress[]) => void
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const [openChip, setOpenChip] = useState<string | null>(null)
  const suggestions = recipientSuggestions(participants, state.input, state.recipients, selfEmails)

  const dispatch = (action: RecipientChipAction) => {
    setState((current) => {
      const next = reduceRecipientChips(current, action)
      if (next.recipients !== current.recipients) onRecipientsChange(next.recipients)
      return next
    })
  }

  return (
    <div className="mobile-recipient-row">
      <label htmlFor={id}>{label}</label>
      <div className="mobile-recipient-control">
        <div className="mobile-recipient-well">
          {state.recipients.map((address) => {
            const expanded = openChip?.toLowerCase() === address.email.toLowerCase()
            return (
              <span className="mobile-recipient-chip-wrap" key={address.email.toLowerCase()}>
                <button
                  className="mobile-recipient-chip"
                  type="button"
                  aria-label={address.email}
                  aria-expanded={expanded}
                  aria-haspopup="menu"
                  onClick={() => setOpenChip(expanded ? null : address.email)}
                >
                  {address.name ?? address.email}
                </button>
                {expanded && (
                  <span className="mobile-recipient-menu" role="menu" aria-label={`${address.email} actions`}>
                    <span>{formatAddress(address)}</span>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        dispatch({ type: 'remove', email: address.email })
                        setOpenChip(null)
                      }}
                    >
                      Remove
                    </button>
                  </span>
                )}
              </span>
            )
          })}
          <input
            id={id}
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label={`${label} recipients`}
            aria-invalid={state.invalid.length > 0 || undefined}
            aria-describedby={state.invalid.length > 0 ? hintId : undefined}
            value={state.input}
            onChange={(event) => dispatch({ type: 'input', value: event.target.value })}
            onBlur={() => {
              if (state.input.trim()) dispatch({ type: 'commit' })
            }}
            onKeyDown={(event) => {
              const commits = event.key === 'Enter' || event.key === ','
                || (event.key === ' ' && parseAddress(state.input) !== null)
              if (commits && state.input.trim()) {
                event.preventDefault()
                dispatch({ type: 'commit' })
              } else if (event.key === 'Backspace' && state.input === '') {
                dispatch({ type: 'backspace' })
              }
            }}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text')
              if (!/[,;\n]/.test(pasted)) return
              event.preventDefault()
              dispatch({ type: 'paste', value: pasted })
            }}
          />
        </div>
        {state.invalid.length > 0 && (
          <p id={hintId} className="mobile-recipient-hint" role="alert">
            Enter a complete email address.
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="mobile-recipient-suggestions" role="listbox" aria-label={`${label} suggestions`}>
            {suggestions.map((address) => (
              <button
                key={address.email.toLowerCase()}
                type="button"
                role="option"
                aria-selected="false"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => dispatch({ type: 'select', address })}
              >
                <strong>{address.name ?? address.email}</strong>
                {address.name && <span>{address.email}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
