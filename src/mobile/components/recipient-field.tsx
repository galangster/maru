import {
  forwardRef,
  memo,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { EmailAddress } from '@/core/types'
import {
  isRecipientCommitKey,
  recipientChipState,
  recipientSuggestions,
  reduceRecipientChips,
  type RecipientChipAction,
  type RecipientChipResult,
} from '@/features/compose/recipient-chips'
import { formatAddress } from '@/lib/compose'

export interface RecipientFieldHandle {
  commit: () => RecipientChipResult
}

interface RecipientFieldProps {
  label: string
  value: EmailAddress[]
  participants: EmailAddress[]
  selfEmails: string[]
  onChange: (recipients: EmailAddress[]) => void
}

export const RecipientField = forwardRef<RecipientFieldHandle, RecipientFieldProps>(
  function RecipientField({ label, value, participants, selfEmails, onChange }, ref) {
    const id = useId()
    const hintId = `${id}-hint`
    const [state, setState] = useState(recipientChipState)
    const [openChip, setOpenChip] = useState<string | null>(null)
    const stateRef = useRef(state)
    const valueRef = useRef(value)
    const onChangeRef = useRef(onChange)
    stateRef.current = state
    valueRef.current = value
    onChangeRef.current = onChange

    const dispatch = useCallback((action: RecipientChipAction) => {
      const currentRecipients = valueRef.current
      const next = reduceRecipientChips(stateRef.current, currentRecipients, action)
      stateRef.current = next.state
      setState(next.state)
      if (next.recipients !== currentRecipients) {
        valueRef.current = next.recipients
        onChangeRef.current(next.recipients)
      }
      return next
    }, [])
    useImperativeHandle(ref, () => ({ commit: () => dispatch({ type: 'commit' }) }), [dispatch])

    const suggestions = useMemo(
      () => recipientSuggestions(participants, state.input, value, selfEmails),
      [participants, selfEmails, state.input, value],
    )
    const toggleChip = useCallback((email: string) => {
      setOpenChip((current) => current?.toLowerCase() === email.toLowerCase() ? null : email)
    }, [])
    const closeChip = useCallback(() => setOpenChip(null), [])

    return (
      <div className="mobile-recipient-row">
        <label htmlFor={id}>{label}</label>
        <div className="mobile-recipient-control">
          <div className="mobile-recipient-well">
            {value.map((address) => (
              <RecipientChip
                key={address.email.toLowerCase()}
                address={address}
                expanded={openChip?.toLowerCase() === address.email.toLowerCase()}
                dispatch={dispatch}
                onToggle={toggleChip}
                onClose={closeChip}
              />
            ))}
            <input
              id={id}
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-label={`${label} recipients`}
              aria-invalid={state.invalid || undefined}
              aria-describedby={state.invalid ? hintId : undefined}
              value={state.input}
              onChange={(event) => dispatch({ type: 'input', value: event.target.value })}
              onBlur={() => {
                if (state.input.trim()) dispatch({ type: 'commit' })
              }}
              onKeyDown={(event) => {
                if (isRecipientCommitKey(event.key, state.input) && state.input.trim()) {
                  const next = dispatch({ type: 'commit' })
                  if (event.key !== 'Tab' || next.state.invalid) event.preventDefault()
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
          {state.invalid && (
            <p id={hintId} className="mobile-recipient-hint" role="alert">
              Enter a complete email address.
            </p>
          )}
          {suggestions.length > 0 && (
            <div className="mobile-recipient-suggestions" role="group" aria-label={`${label} suggestions`}>
              {suggestions.map((address) => (
                <button
                  key={address.email.toLowerCase()}
                  type="button"
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
  },
)

const RecipientChip = memo(function RecipientChip({
  address,
  expanded,
  dispatch,
  onToggle,
  onClose,
}: {
  address: EmailAddress
  expanded: boolean
  dispatch: (action: RecipientChipAction) => RecipientChipResult
  onToggle: (email: string) => void
  onClose: () => void
}) {
  return (
    <span className="mobile-recipient-chip-wrap">
      <button
        className="mobile-recipient-chip"
        type="button"
        aria-label={address.email}
        aria-expanded={expanded}
        onClick={() => onToggle(address.email)}
      >
        {address.name ?? address.email}
      </button>
      {expanded && (
        <span className="mobile-recipient-menu">
          <span>{formatAddress(address)}</span>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'remove', email: address.email })
              onClose()
            }}
          >
            Remove
          </button>
        </span>
      )}
    </span>
  )
})
