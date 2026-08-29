// A recipient field. Addresses become chips; the text you are still typing
// stays text until a separator, a paste, or blur turns it into one.
//
// Parsing and validation are pure and live in src/lib/compose.ts.

import { useId, useRef, useState } from 'react'

import { Icon } from '@/components/ui/icon'
import type { EmailAddress } from '@/core/types'
import { dedupeAddresses, formatAddress, parseAddresses } from '@/lib/compose'
import { cn } from '@/lib/utils'

export interface ChipInputProps {
  label: string
  value: EmailAddress[]
  onChange: (next: EmailAddress[]) => void
  autoFocus?: boolean
  /** Rendered at the end of the row — the "Cc Bcc" affordance on To. */
  trailing?: React.ReactNode
}

export function ChipInput({ label, value, onChange, autoFocus, trailing }: ChipInputProps) {
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const commit = (raw: string): boolean => {
    const { addresses, invalid: bad } = parseAddresses(raw)
    if (addresses.length > 0) onChange(dedupeAddresses([...value, ...addresses]))
    setInvalid(bad.length > 0)
    setText(bad.join(', '))
    return bad.length === 0
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ',' || event.key === ';' || event.key === 'Enter' || event.key === 'Tab') {
      if (text.trim() === '') return
      // Tab still moves on when the fragment was a valid address.
      if (event.key !== 'Tab') event.preventDefault()
      const ok = commit(text)
      if (event.key === 'Tab' && !ok) event.preventDefault()
      return
    }
    if (event.key === 'Backspace' && text === '' && value.length > 0) {
      event.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  return (
    // A field well, not a bordered row — Amie's sheet pattern (AMIE-STUDY §5).
    // `--wren-radius-md` is exactly the composer's 24 minus its 12 px inset,
    // so the well is concentric with the sheet by construction.
    <div className="bg-sunken rounded-md flex min-h-9 items-start gap-3 px-3">
      <label
        htmlFor={id}
        className="font-ui text-ink-3 w-14 shrink-0 cursor-text py-2 text-xs font-semibold uppercase"
      >
        {label}
      </label>
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((address) => (
          <span
            key={address.email}
            // A pill, and `raised` rather than `sunken`: the well underneath
            // is sunken now, and a chip has to sit *on* it.
            className="bg-raised text-ink-2 shadow-xs flex h-6 max-w-full items-center gap-1 rounded-full pr-1 pl-2 text-xs"
          >
            <span className="truncate">{address.name ?? address.email}</span>
            {/* 16×16 was under WCAG 2.2 SC 2.5.8's 24×24 floor and half the
                app's own 32 px `--wren-hit` (S10); the pseudo-element restores
                a 32 px box without changing the chip's height. The `size-3`
                override is gone too — it rendered a 16 px glyph at 12 and put
                it off DIRECTION §8's grid (S9). */}
            <button
              type="button"
              aria-label={`Remove ${formatAddress(address)}`}
              onClick={(event) => {
                event.stopPropagation()
                onChange(value.filter((a) => a.email !== address.email))
              }}
              className="focus-ring text-ink-3 hover:text-ink relative inline-flex size-4 shrink-0 items-center justify-center rounded-xs after:absolute after:-inset-x-2 after:-inset-y-1 after:content-['']"
            >
              <Icon name="close" size={16} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          aria-label={label}
          aria-invalid={invalid || undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (invalid) setInvalid(false)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() !== '' && commit(text)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text')
            if (!/[,;\n]/.test(pasted)) return
            event.preventDefault()
            commit(`${text}${pasted}`)
          }}
          className={cn(
            'text-ink placeholder:text-ink-3 h-6 min-w-32 flex-1 bg-transparent text-base outline-none',
            invalid && 'text-destructive',
          )}
        />
      </div>
      {trailing && <div className="flex shrink-0 items-center py-1">{trailing}</div>}
    </div>
  )
}
