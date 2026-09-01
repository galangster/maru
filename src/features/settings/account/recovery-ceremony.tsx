import { useState } from 'react'

import { PrimaryButton } from '@/components/wren-controls'

export function RecoveryCeremony({ phrase, onConfirm }: { phrase: string; onConfirm(): Promise<void> }) {
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const words = phrase.split(' ')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-ink text-base font-medium">Save your recovery words</p>
        <p className="text-ink-3 text-sm text-pretty">
          These 12 words are the only way to recover your encrypted vault without your password. Maru shows them once.
        </p>
      </div>
      <ol className="bg-sunken grid grid-cols-3 gap-x-4 gap-y-2 rounded-md p-4 font-mono text-sm select-text">
        {words.map((word, index) => (
          <li key={`${word}-${index}`} className="text-ink flex gap-2">
            <span className="text-ink-3 w-5 text-right tabular-nums">{index + 1}</span>
            <span>{word}</span>
          </li>
        ))}
      </ol>
      <label className="text-ink-2 flex min-h-10 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="size-4" />
        <span>I saved these 12 words somewhere safe</span>
      </label>
      <PrimaryButton
        disabled={!saved || busy}
        className="h-10 w-fit px-4"
        onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)) }}
      >
        {busy ? 'Activating…' : 'Activate account'}
      </PrimaryButton>
    </div>
  )
}

