import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  toComposeDraft,
  useComposer,
  type Draft,
  type DraftAttachment,
} from '@/features/compose/compose-store'
import { useAccountsById, useCorrespondents } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { sendToastOptions } from '@/features/compose/send-toast'
import { sendBlockReason } from '@/lib/compose'
import { cue } from '@/lib/cue'
import { RecipientField, type RecipientFieldHandle } from '../components/recipient-field'
import { MobileIcon } from '../components/mobile-icon'
import { useModalFocus } from '../use-modal-focus'
import { useHapticBoundary } from '../use-native-shell'

const RECIPIENT_KINDS = ['to', 'cc', 'bcc'] as const
type RecipientKind = (typeof RECIPIENT_KINDS)[number]

export function ComposeSheet({ onSent }: { onSent: () => void }) {
  const service = useMailService()
  const { accounts, selfEmails } = useAccountsById()
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
  const participants = useCorrespondents(draft.accountId || accounts[0]?.id)
  const recipientRefs = useRef<Record<RecipientKind, RecipientFieldHandle | null>>({
    to: null,
    cc: null,
    bcc: null,
  })
  const recipientFields: Record<RecipientKind, { label: string; value: Draft[RecipientKind] }> = {
    to: { label: 'To', value: draft.to },
    cc: { label: 'Cc', value: draft.cc },
    bcc: { label: 'Bcc', value: draft.bcc },
  }
  const recipientEntries = Object.entries(recipientFields) as [
    RecipientKind,
    { label: string; value: Draft[RecipientKind] },
  ][]
  const copiesVisible = showCopies || draft.cc.length > 0 || draft.bcc.length > 0

  useEffect(() => {
    if (!draft.accountId && accounts[0]) set({ accountId: accounts[0].id })
  }, [accounts, draft.accountId, set])

  const close = () => {
    if (dirty && !window.confirm('Discard this draft? Your message will be lost.')) return
    closeStore()
  }
  const dialogRef = useModalFocus<HTMLElement>(close)
  useHapticBoundary()
  const send = async () => {
    const committed = recipientEntries.map(([kind]) => recipientRefs.current[kind]?.commit())
    if (committed.some((result) => result?.state.invalid)) {
      return setError('Check the recipient addresses.')
    }
    const outgoing = useComposer.getState().draft
    // The same gate and the same sentence the desktop composer uses (issue 7),
    // so a blocked send is never explained two different ways — and so the
    // phone checks the account it sends from as well as the recipients.
    const blocked = sendBlockReason(outgoing)
    if (blocked) return setError(blocked)
    setSending(true)
    setError('')
    try {
      await service.send(toComposeDraft(outgoing))
      remember(outgoing.accountId)
      // Both confirmations at one moment: the phone had the success notify and
      // no sound, and the two used to be written a screen apart.
      cue('sent')
      // And one on screen (issue 19). Sending was the only action in the app
      // that could not be taken back and the only one that said nothing —
      // archiving, which is entirely reversible, got a toast and an Undo.
      //
      // `sendToastOptions` is the desktop's, for its one id and its rule that
      // `action` is always a key: an omitted one leaves a previous Undo button
      // standing over a message that has gone. This path awaits the send
      // rather than holding it, so there is no window to offer and the option
      // is correctly absent.
      toast.success('Sent', sendToastOptions(outgoing.subject || '(no subject)'))
      onSent()
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
      <section ref={dialogRef} className="mobile-compose-sheet" role="dialog" aria-modal="true" aria-label="Compose message" tabIndex={-1}>
        <header className="mobile-sheet-nav">
          <button type="button" className="mobile-nav-text" onClick={close}>Cancel</button>
          <h2>{draft.reply ? 'Reply' : 'New Message'}</h2>
          <button type="button" className="mobile-send-button" disabled={sending} onClick={() => void send()}>{sending ? 'Sending…' : 'Send'}</button>
        </header>
        <form className="mobile-compose-form" onSubmit={(event) => { event.preventDefault(); void send() }}>
          <label className="mobile-compose-field"><span>From</span><select value={draft.accountId} onChange={(event) => edit({ accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>)}</select></label>
          {recipientEntries.map(([kind, field]) => {
            if (kind !== 'to' && !copiesVisible) return null
            const recipientField = (
              <RecipientField
                key={kind}
                ref={(handle) => { recipientRefs.current[kind] = handle }}
                label={field.label}
                value={field.value}
                participants={participants}
                selfEmails={selfEmails}
                onChange={(recipients) => edit({ [kind]: recipients } as Pick<Draft, RecipientKind>)}
              />
            )
            return kind === 'to' ? (
              <div className="mobile-compose-to-field" key={kind}>
                {recipientField}
                {!copiesVisible && <button type="button" aria-expanded="false" onClick={() => setShowCopies(true)}>Cc/Bcc</button>}
              </div>
            ) : recipientField
          })}
          <label className="mobile-compose-field"><span>Subject</span><input type="text" value={draft.subject} onChange={(event) => edit({ subject: event.target.value })} /></label>
          <label className="mobile-compose-body"><span className="sr-only">Message</span><textarea value={draft.bodyText} onChange={(event) => edit({ bodyText: event.target.value })} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void send() }} placeholder="Write a message…" /></label>
          {draft.attachments.length > 0 && <div className="mobile-draft-attachments">{draft.attachments.map((attachment) => <span key={attachment.id}><MobileIcon name="attachment" scale="small" />{attachment.filename}<button type="button" aria-label={`Remove ${attachment.filename}`} onClick={() => edit({ attachments: draft.attachments.filter((item) => item.id !== attachment.id) })}><MobileIcon name="close" scale="small" /></button></span>)}</div>}
          {error && <p className="mobile-form-error" role="alert">{error}</p>}
          <div className="mobile-compose-footer">
            <label className="mobile-attach-button"><MobileIcon name="attachment" scale="action" /><span>Add attachment</span><input type="file" multiple onChange={(event) => void addFiles(event.target.files)} /></label>
            <button type="button" className="mobile-discard-button mobile-press" onClick={close} aria-label="Discard draft"><MobileIcon name="trash" scale="action" /></button>
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
