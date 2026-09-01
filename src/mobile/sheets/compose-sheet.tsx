import { useEffect, useState } from 'react'
import { Paperclip, Trash2, X } from 'lucide-react'

import { toComposeDraft, useComposer, type DraftAttachment } from '@/features/compose/compose-store'
import { useAccountsById } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { formatAddress, parseAddresses } from '@/lib/compose'

export function ComposeSheet() {
  const service = useMailService()
  const { accounts } = useAccountsById()
  const draft = useComposer((state) => state.draft)
  const dirty = useComposer((state) => state.dirty)
  const showCopies = useComposer((state) => state.showCc)
  const edit = useComposer((state) => state.edit)
  const set = useComposer((state) => state.set)
  const setShowCopies = useComposer((state) => state.setShowCc)
  const closeStore = useComposer((state) => state.close)
  const remember = useComposer((state) => state.remember)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [toText, setToText] = useState(() => draft.to.map(formatAddress).join(', '))
  const [ccText, setCcText] = useState(() => draft.cc.map(formatAddress).join(', '))
  const [bccText, setBccText] = useState(() => draft.bcc.map(formatAddress).join(', '))

  useEffect(() => {
    if (!draft.accountId && accounts[0]) set({ accountId: accounts[0].id })
  }, [accounts, draft.accountId, set])

  const close = () => {
    if (dirty && !window.confirm('Discard this draft? Your message will be lost.')) return
    closeStore()
  }
  const send = async () => {
    const to = parseAddresses(toText)
    const cc = parseAddresses(ccText)
    const bcc = parseAddresses(bccText)
    if ([...to.invalid, ...cc.invalid, ...bcc.invalid].length > 0) {
      return setError('Check the recipient addresses.')
    }
    if (to.addresses.length === 0) return setError('Add at least one recipient.')
    const outgoing = { ...draft, to: to.addresses, cc: cc.addresses, bcc: bcc.addresses }
    setSending(true)
    setError('')
    try {
      await service.send(toComposeDraft(outgoing))
      remember(draft.accountId)
      closeStore()
    } catch (cause) {
      setSending(false)
      setError(cause instanceof Error ? cause.message : 'Message could not be sent.')
    }
  }
  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const next = await Promise.all([...files].map(fileToAttachment))
    edit({ attachments: [...draft.attachments, ...next] })
  }

  return (
    <div className="mobile-sheet-layer" role="presentation">
      <section className="mobile-compose-sheet" role="dialog" aria-modal="true" aria-label="Compose message">
        <header className="mobile-sheet-nav">
          <button type="button" className="mobile-nav-text" onClick={close}>Cancel</button>
          <h2>{draft.reply ? 'Reply' : 'New Message'}</h2>
          <button type="button" className="mobile-send-button" disabled={sending} onClick={() => void send()}>{sending ? 'Sending…' : 'Send'}</button>
        </header>
        <form className="mobile-compose-form" onSubmit={(event) => { event.preventDefault(); void send() }}>
          <label className="mobile-compose-field"><span>From</span><select value={draft.accountId} onChange={(event) => edit({ accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>)}</select></label>
          <div className="mobile-compose-field mobile-compose-to-field">
            <label><span>To</span><input type="email" inputMode="email" multiple value={toText} onChange={(event) => { setToText(event.target.value); edit({ to: parseAddresses(event.target.value).addresses }) }} autoComplete="off" /></label>
            <button type="button" onClick={() => setShowCopies(!showCopies)}>Cc/Bcc</button>
          </div>
          {showCopies && <>
            <label className="mobile-compose-field"><span>Cc</span><input type="email" inputMode="email" multiple value={ccText} onChange={(event) => { setCcText(event.target.value); edit({ cc: parseAddresses(event.target.value).addresses }) }} autoComplete="off" /></label>
            <label className="mobile-compose-field"><span>Bcc</span><input type="email" inputMode="email" multiple value={bccText} onChange={(event) => { setBccText(event.target.value); edit({ bcc: parseAddresses(event.target.value).addresses }) }} autoComplete="off" /></label>
          </>}
          <label className="mobile-compose-field"><span>Subject</span><input type="text" value={draft.subject} onChange={(event) => edit({ subject: event.target.value })} /></label>
          <label className="mobile-compose-body"><span className="sr-only">Message</span><textarea value={draft.bodyText} onChange={(event) => edit({ bodyText: event.target.value })} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void send() }} placeholder="Write a message…" /></label>
          {draft.attachments.length > 0 && <div className="mobile-draft-attachments">{draft.attachments.map((attachment) => <span key={attachment.id}><Paperclip size={15} />{attachment.filename}<button type="button" aria-label={`Remove ${attachment.filename}`} onClick={() => edit({ attachments: draft.attachments.filter((item) => item.id !== attachment.id) })}><X size={15} /></button></span>)}</div>}
          {error && <p className="mobile-form-error" role="alert">{error}</p>}
          <div className="mobile-compose-footer">
            <label className="mobile-attach-button"><Paperclip size={19} /><span>Add attachment</span><input type="file" multiple onChange={(event) => void addFiles(event.target.files)} /></label>
            <button type="button" className="mobile-discard-button mobile-press" onClick={close} aria-label="Discard draft"><Trash2 size={19} /></button>
          </div>
        </form>
      </section>
    </div>
  )
}

async function fileToAttachment(file: File): Promise<DraftAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return { id: crypto.randomUUID(), filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, dataBase64: btoa(binary) }
}
