// The docked composer: a glass sheet in the bottom-right of the reading area,
// 560 px wide, minimizable to a chip. DIRECTION §7 lists the composer sheet as
// one of the surfaces glass is *for*.
//
// It mounts at the app root (never inside a pane) so no ancestor's transform
// or opacity can steal the backdrop root — DIRECTION §7, WebView2 rule 6.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { toast } from 'sonner'

import { ConfirmPopover } from '@/components/confirm-popover'
import { Icon } from '@/components/ui/icon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconButton, PrimaryButton, iconButtonClass } from '@/components/wren-controls'
import type { Account } from '@/core/types'
import { useAccounts } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useAnyDialogOpen } from '@/features/shell/surface-store'
import { ATTACHMENT_WARN_BYTES, totalBytes, type ReplyMode } from '@/lib/compose'
import { formatBytes } from '@/lib/format'
import { exitTransition, sheetPreset, useMotionMode } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { BodyEditor, FormatToolbar, useBodyEditor } from './body-editor'
import { ChipInput } from './chip-input'
import {
  toComposeDraft,
  useComposer,
  type Draft,
  type DraftAttachment,
} from './compose-store'

const TITLES: Record<ReplyMode, string> = {
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward',
}

export function Composer() {
  const open = useComposer((s) => s.open)
  const seed = useComposer((s) => s.seed)
  // A fresh seed is a fresh draft, and Tiptap takes its content once — so the
  // sheet remounts rather than trying to reconcile an editor mid-flight.
  //
  // AnimatePresence holds the sheet on screen long enough for it to leave.
  // `initial={false}` so a draft restored on load does not animate in.
  return (
    <AnimatePresence initial={false}>
      {open ? <ComposerSheet key={seed} /> : null}
    </AnimatePresence>
  )
}

function ComposerSheet() {
  const liveDraft = useComposer((s) => s.draft)
  const liveMinimized = useComposer((s) => s.minimized)
  // `close()` empties the draft the moment it is called, but the sheet is
  // still on screen for the length of its exit. Freeze what is rendered the
  // instant it starts leaving, or the recipients and the subject blink out
  // from under the animation.
  const present = useIsPresent()
  const frozen = useRef({ draft: liveDraft, minimized: liveMinimized })
  if (present) frozen.current = { draft: liveDraft, minimized: liveMinimized }
  const { draft, minimized } = frozen.current

  const showCc = useComposer((s) => s.showCc)
  const dirty = useComposer((s) => s.dirty)
  const confirming = useComposer((s) => s.confirming)
  const edit = useComposer((s) => s.edit)
  const setField = useComposer((s) => s.set)
  const setShowCc = useComposer((s) => s.setShowCc)
  const setMinimized = useComposer((s) => s.setMinimized)
  const setConfirming = useComposer((s) => s.setConfirming)
  const close = useComposer((s) => s.close)
  const openWith = useComposer((s) => s.openWith)
  const remember = useComposer((s) => s.remember)

  const accounts = useAccounts()
  const service = useMailService()
  const dialogOpen = useAnyDialogOpen()
  const fileRef = useRef<HTMLInputElement>(null)

  const onBody = useCallback((bodyHtml: string) => edit({ bodyHtml }), [edit])
  const editor = useBodyEditor({ initialHtml: draft.bodyHtml, onChange: onBody })

  const mode = useMotionMode()
  const preset = sheetPreset(mode)

  // The From account: the one passed in (a reply keeps its thread's account),
  // else the last one used, else the first there is.
  const list = accounts.data ?? []
  const firstAccountId = list[0]?.id
  useEffect(() => {
    if (draft.accountId || !firstAccountId) return
    setField({ accountId: firstAccountId })
  }, [draft.accountId, firstAccountId, setField])
  const account = list.find((a) => a.id === draft.accountId)

  const attachedBytes = useMemo(
    () => totalBytes(draft.attachments.map((a) => a.sizeBytes)),
    [draft.attachments],
  )
  const tooLarge = attachedBytes > ATTACHMENT_WARN_BYTES
  const canSend = Boolean(draft.accountId) && draft.to.length > 0

  const title = draft.reply ? TITLES[draft.reply.mode] : 'New message'

  const send = async () => {
    if (!canSend) return
    const payload = toComposeDraft(draft)
    const kept: Draft = draft
    // Optimistic: the sheet goes as soon as the user commits, and only an
    // actual failure brings it back.
    close()
    remember(payload.accountId)
    try {
      await service.send(payload)
      toast.success('Sent', { description: payload.subject || '(no subject)' })
    } catch (cause) {
      toast.error('Could not send', {
        description: cause instanceof Error ? cause.message : 'The draft is back, unchanged.',
      })
      openWith(kept)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Composer-scoped: these two work while the user is typing.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void send()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (confirming) setConfirming(false)
      else if (dirty) setConfirming(true)
      else close()
    }
  }

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const read = await Promise.all([...files].map(readAsAttachment))
    edit({ attachments: [...draft.attachments, ...read] })
    if (fileRef.current) fileRef.current.value = ''
  }

  // Glass over glass is two layers; a dialog's scrim would make a third, which
  // DIRECTION §7 rules out. The sheet drops its blur while one is open.
  const glassOff = dialogOpen
    ? { backdropFilter: 'none', WebkitBackdropFilter: 'none', backgroundColor: 'var(--wren-surface-raised)' }
    : undefined

  // Both states dock to the same corner, so letting them overlap for the
  // length of the crossfade is what makes minimize read as one thing changing
  // size rather than two things swapping.
  return (
    <AnimatePresence initial={false}>
      {minimized ? (
        <motion.div
          key="chip"
          initial={preset.initial}
          animate={preset.animate}
          exit={{ ...preset.exit, transition: exitTransition(mode) }}
          transition={preset.transition}
          className="glass fixed right-4 bottom-4 z-40 flex h-10 w-72 items-center gap-2 pr-1 pl-4"
          style={glassOff}
          onKeyDown={onKeyDown}
        >
          <button
            type="button"
            onClick={() => setMinimized(false)}
            aria-label={`Reopen ${draft.subject || title}`}
            className="font-ui text-ink focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded-xs text-left text-base font-medium outline-none focus-visible:ring-3"
          >
            {draft.subject || title}
          </button>
          <CloseControl
            confirming={confirming}
            setConfirming={setConfirming}
            dirty={dirty}
            onClose={close}
          />
        </motion.div>
      ) : (
        <motion.section
          key="sheet"
          aria-label={title}
          onKeyDown={onKeyDown}
          initial={preset.initial}
          animate={preset.animate}
          exit={{ ...preset.exit, transition: exitTransition(mode) }}
          transition={preset.transition}
          style={glassOff}
          className={cn(
            'glass fixed right-4 bottom-4 z-40 flex w-[560px] flex-col overflow-hidden',
            // A fresh compose used to collapse to the height of its own
            // chrome, which made the writing surface an afterthought.
            'min-h-[440px] max-h-[calc(100vh-var(--wren-titlebar-h)-32px)]',
          )}
        >
      <header className="border-hairline flex h-10 shrink-0 items-center gap-1 border-b pr-1 pl-4">
        <h2 className="font-ui text-ink min-w-0 flex-1 truncate text-base font-semibold">
          {title}
        </h2>
        <IconButton
          name="minimize"
          label="Minimize"
          size={16}
          className="shrink-0"
          onClick={() => setMinimized(true)}
        />
        <CloseControl
          confirming={confirming}
          setConfirming={setConfirming}
          dirty={dirty}
          onClose={close}
        />
      </header>

      <FromRow accounts={list} account={account} onChange={(id) => edit({ accountId: id })} />

      <ChipInput
        label="To"
        value={draft.to}
        onChange={(to) => edit({ to })}
        autoFocus
        trailing={
          showCc ? undefined : (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              // "Cc Bcc" read as one word. The slash says it is two fields,
              // and the label says what pressing it does.
              aria-label="Add Cc and Bcc"
              className="font-ui text-ink-3 hover:text-ink focus-visible:ring-ring/50 h-6 rounded-xs px-1 text-xs outline-none focus-visible:ring-3"
            >
              Cc / Bcc
            </button>
          )
        }
      />

      {showCc && (
        <>
          <ChipInput label="Cc" value={draft.cc} onChange={(cc) => edit({ cc })} />
          <ChipInput label="Bcc" value={draft.bcc} onChange={(bcc) => edit({ bcc })} />
        </>
      )}

      <div className="border-hairline flex min-h-9 items-center gap-3 border-b px-4">
        <label htmlFor="wren-subject" className="font-ui text-ink-3 w-12 shrink-0 text-xs">
          Subject
        </label>
        <input
          id="wren-subject"
          type="text"
          value={draft.subject}
          onChange={(event) => edit({ subject: event.target.value })}
          className="text-ink placeholder:text-ink-3 h-6 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </div>

      <BodyEditor editor={editor} />

      {draft.attachments.length > 0 && (
        <div className="border-hairline flex flex-col gap-2 border-t px-4 py-2">
          <ul className="flex flex-wrap gap-2">
            {draft.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="bg-sunken text-ink-2 flex h-8 max-w-full items-center gap-2 rounded-xs pr-1 pl-2 text-sm"
              >
                <Icon name="attachment" size={16} className="text-ink-3" />
                <span className="truncate">{attachment.filename}</span>
                <span className="text-ink-3 shrink-0 text-xs tabular-nums">
                  {formatBytes(attachment.sizeBytes)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.filename}`}
                  onClick={() =>
                    edit({
                      attachments: draft.attachments.filter((a) => a.id !== attachment.id),
                    })
                  }
                  className="text-ink-3 hover:text-ink focus-visible:ring-ring/50 inline-flex size-5 shrink-0 items-center justify-center rounded-xs outline-none focus-visible:ring-3"
                >
                  <Icon name="close" size={16} className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {tooLarge && (
            <p className="text-ink-2 text-xs">
              <span className="text-destructive">
                {formatBytes(attachedBytes)} attached.
              </span>{' '}
              Gmail rejects messages over 25 MB — send a link instead.
            </p>
          )}
        </div>
      )}

      <footer className="border-hairline flex h-12 shrink-0 items-center gap-2 border-t px-4">
        <FormatToolbar editor={editor} />
        <span className="bg-hairline h-4 w-px shrink-0" aria-hidden />
        <IconButton
          name="attachment"
          label="Attach files"
          size={16}
          className="shrink-0"
          onClick={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          aria-label="Attach files"
          onChange={(event) => void addFiles(event.target.files)}
        />
        <div className="flex-1" />
        <PrimaryButton
          onClick={() => void send()}
          disabled={!canSend}
          title="Send (⌘↵)"
          className="h-8 gap-2 px-3"
        >
          <Icon name="sent" size={16} />
          Send
        </PrimaryButton>
      </footer>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function FromRow({
  accounts,
  account,
  onChange,
}: {
  accounts: Account[]
  account: Account | undefined
  onChange: (accountId: string) => void
}) {
  return (
    <div className="border-hairline flex min-h-9 items-center gap-3 border-b px-4">
      <span className="font-ui text-ink-3 w-12 shrink-0 text-xs">From</span>
      {accounts.length > 1 ? (
        <Select value={account?.id ?? ''} onValueChange={(value) => onChange(String(value))}>
          <SelectTrigger size="sm" aria-label="Send from" className="-ml-2 border-0 shadow-none">
            <SelectValue>
              {(value) => accounts.find((a) => a.id === value)?.email ?? 'Pick an account'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-ink truncate text-base">{account?.email ?? '—'}</span>
      )}
    </div>
  )
}

/** Close, plus the discard confirm it raises when there is something to lose. */
function CloseControl({
  confirming,
  setConfirming,
  dirty,
  onClose,
}: {
  confirming: boolean
  setConfirming: (open: boolean) => void
  dirty: boolean
  onClose: () => void
}) {
  return (
    <ConfirmPopover
      open={confirming}
      onOpenChange={setConfirming}
      title="Discard this draft?"
      description="Wren does not keep drafts yet. Closing loses what you wrote."
      cancelLabel="Keep writing"
      confirmLabel="Discard"
      onConfirm={onClose}
      className="w-64"
      // A Base UI trigger clones the element it is given, so this is a plain
      // button wearing the IconButton recipe rather than the component.
      trigger={
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={(event) => {
            if (dirty) return
            event.preventDefault()
            onClose()
          }}
          className={iconButtonClass('default', 'shrink-0')}
        />
      }
      triggerContent={<Icon name="close" size={16} />}
    />
  )
}

function readAsAttachment(file: File): Promise<DraftAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.onload = () => {
      const url = String(reader.result)
      resolve({
        id: `${file.name}:${file.size}:${file.lastModified}`,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataBase64: url.slice(url.indexOf(',') + 1),
      })
    }
    reader.readAsDataURL(file)
  })
}
