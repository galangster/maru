// The docked composer: a glass sheet in the bottom-right of the reading area,
// 560 px wide, minimizable to a chip. DIRECTION §7 lists the composer sheet as
// one of the surfaces glass is *for*.
//
// It mounts at the app root (never inside a pane) so no ancestor's transform
// or opacity can steal the backdrop root — DIRECTION §7, WebView2 rule 6.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { toast } from 'sonner'

import { ConfirmPopover } from '@/components/confirm-popover'
import { Icon } from '@/components/ui/icon'
import { Tooltip, TooltipContent, TooltipHint, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  IconButton,
  META_TEXT,
  PrimaryButton,
  SEND_BUTTON,
  SEND_CONFIRM,
  SURFACE_TITLE,
  iconButtonClass,
} from '@/components/wren-controls'
import type { Account } from '@/core/types'
import { useAccounts } from '@/features/mail/queries'
import { useMailService } from '@/features/mail/service'
import { useUi } from '@/features/mail/ui-store'
import { useAnyDialogOpen } from '@/features/shell/surface-store'
import {
  ATTACHMENT_WARN_BYTES,
  sendBlockReason,
  totalBytes,
  type ReplyMode,
} from '@/lib/compose'
import { HeldMutations } from '@/lib/deferred'
import { formatBytes } from '@/lib/format'
import { MOD } from '@/features/keyboard/keymap'
import { DUR, exitTransition, sheetPreset, useMotionMode } from '@/lib/motion'
import { cue } from '@/lib/cue'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'

import { BodyEditor, FormatToolbar, useBodyEditor } from './body-editor'
import { ChipInput, FIELD_LABEL } from './chip-input'
import {
  toComposeDraft,
  useComposer,
  type Draft,
  type DraftAttachment,
} from './compose-store'
import { sendToastOptions } from './send-toast'

const TITLES: Record<ReplyMode, string> = {
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward',
}

/**
 * How long the mail is genuinely held before it goes — MAGIC §3.3, Superhuman's
 * pattern 10. An undo affordance is what licenses instant, un-confirmed action;
 * without a real hold the toast would be decoration.
 *
 * Shorter than the registry's own window in lib/undo.ts, and it has to be: a
 * mail action can be reversed after the fact, and a send cannot. This number is
 * the whole of the send's undo, not a display duration on top of one.
 */
const UNDO_WINDOW_MS = 4000

/**
 * The send waiting out its undo window, if there is one.
 *
 * Module scope, because it has to outlive the sheet: the composer unmounts the
 * instant the user commits, and the mail leaves several seconds later. One key,
 * because there is only ever one — a second send flushes the first, so two in a
 * row never race and never reorder.
 */
const heldSend = new HeldMutations()
const SEND_KEY = 'send'

/** The send's slot in the ⌘Z registry. Withdrawn the moment the mail goes. */
const SEND_UNDO = 'send'

if (typeof window !== 'undefined') {
  // Closing the window must not eat a held message. Whatever is waiting goes
  // now, in the same turn.
  window.addEventListener('beforeunload', () => heldSend.flushAll())
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
  // Held for the length of the send sequence, so the label reads "Sent" while
  // the sheet is on its way out and the button cannot fire twice.
  const [sending, setSending] = useState(false)

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

  /**
   * Why the mail cannot go yet, in a sentence — issue 7.
   *
   * The button is `aria-disabled` rather than `disabled` so it keeps its hover
   * and its focus: a `disabled` button fires no pointer events, so the tooltip
   * carrying the reason could never open on the one control that needs it.
   * Pressing it, or pressing ⌘↵, is not swallowed either — it says the reason
   * out loud and puts the caret where the answer goes.
   */
  const blocked = sendBlockReason(draft)
  const toRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  // The reason stops being true the moment it stops being true.
  useEffect(() => {
    if (!blocked) setNotice('')
  }, [blocked])

  const title = draft.reply ? TITLES[draft.reply.mode] : 'New message'

  /**
   * The flagship moment — MAGIC §3.3. One sequence, about 420 ms of it visible:
   *
   *   0 ms    the arrow becomes a check, the fill crossfades to green, and
   *           the button runs one 200 ms pop — AMIE-STUDY §7(c).3
   *   200 ms  the sheet exits (opacity, a 2% scale step and 8 px, ease-in)
   *   280 ms  the toast rises bottom-left carrying UNDO
   *   4 s     the mail actually goes, and the earned cue plays
   *
   * The mail is genuinely held for that window, so UNDO is a real undo rather
   * than a retraction the server may already have refused. Nothing blocks: the
   * sheet is gone and the app is usable from 140 ms onward.
   */
  const send = () => {
    if (sending) return
    if (blocked) {
      // Never a silent key. The sentence appears beside the button and the
      // caret lands in the field that answers it.
      setNotice(blocked)
      playSound('error')
      toRef.current?.focus()
      return
    }
    const payload = toComposeDraft(draft)
    const kept: Draft = draft
    setSending(true)
    playSound('send')
    remember(payload.accountId)

    // Motion off (captures) and reduced motion both collapse the beat to zero
    // rather than replaying it faster — there is nothing to see either way.
    // --wren-dur-base is long enough for the fill to land and the pop to read,
    // short enough that the app is usable again before the eye has moved. Under
    // reduced motion the fill and the check still swap; only the waiting goes
    // away. Read from the motion tokens so it cannot drift from the animation
    // it is waiting on.
    const beat = mode === 'full' ? Math.round(DUR.base * 1000) : 0

    window.setTimeout(() => {
      close()
      const subject = payload.subject || '(no subject)'

      const cancel = heldSend.hold(SEND_KEY, () => {
        // The window is over and the mail is going. Withdraw the offer before
        // the request, not after it: ⌘Z landing on a send that is already in
        // flight would reopen a composer for a message the server has.
        useUi.getState().clearUndo(SEND_UNDO)
        // The toast's button is the other half of the same offer, and it goes
        // in the same turn. The words still say "Sending…" — the network is
        // still out there — but the send is past taking back, and a button
        // that is on screen has to still work (issue 2).
        toast('Sending…', sendToastOptions(subject))
        void (async () => {
          try {
            await service.send(payload)
            cue('sent')
            toast.success('Sent', sendToastOptions(subject))
          } catch (cause) {
            playSound('error')
            toast.error(
              'Could not send',
              sendToastOptions(
                cause instanceof Error ? cause.message : 'The draft is back, unchanged.',
              ),
            )
            openWith(kept)
          }
        })()
      }, UNDO_WINDOW_MS)

      /**
       * Take the send back: cancel the held mutation and put the draft on
       * screen exactly as it was.
       *
       * The guard is the whole contract. `cancel()` on a hold that has already
       * fired is a no-op by design, so without it a late press would reopen the
       * composer on mail that has already left — an undo that un-does nothing
       * and loses the user's place. If the hold is gone, so is the offer.
       */
      const undoSend = () => {
        if (!heldSend.has(SEND_KEY)) return
        cancel()
        useUi.getState().clearUndo(SEND_UNDO)
        openWith(kept)
      }

      // ⌘Z reaches the same function the toast's button does, so the two can
      // never disagree about what "undo" means here.
      useUi.getState().registerUndo({ id: SEND_UNDO, label: 'Send', run: undoSend })

      window.setTimeout(() => {
        toast(
          'Sending…',
          sendToastOptions(subject, { onClick: undoSend, durationMs: UNDO_WINDOW_MS }),
        )
      }, 80)
    }, beat)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Composer-scoped: these two work while the user is typing.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      send()
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
            className="font-ui text-ink focus-ring min-w-0 flex-1 truncate rounded-xs text-left text-base font-medium"
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
            // `glass-strong`, not `glass`. DIRECTION §1 puts glass behind text
            // that must be *read* on the refuses list, and text being *written*
            // has the same claim: at the 0.72 tint the mail behind the sheet
            // read through the From, To and Subject rows clearly enough to
            // compete with what was being typed (S13). Settings made exactly
            // this call for exactly this reason.
            'glass-strong fixed right-4 bottom-4 z-40 flex w-[560px] flex-col overflow-hidden',
            // A fresh compose used to collapse to the height of its own
            // chrome, which made the writing surface an afterthought.
            'min-h-[440px] max-h-[calc(100vh-var(--wren-toolbar-h)-32px)]',
          )}
        >
      <header className="flex h-10 shrink-0 items-center gap-1 pr-1 pl-4">
        <h2 className={SURFACE_TITLE}>
          {title}
        </h2>
        {/* Toolbar chrome sits at 18 on DIRECTION §8's grid; the 16 px
            overrides here and in the footer were the composer half of S8.

            `rounded-full`, not the recipe's `rounded-md`. DIRECTION §6 wants
            nested radii concentric — inner = outer − inset. The sheet is 24 and
            these two 32 px boxes sit 4 px in from its top-right corner on both
            axes, which asks for 20; 16 is all a 32 px box has, and a box at its
            own maximum radius *is* a circle. So the honest nesting here is a
            circle, which is also the one shape that can never disagree with the
            corner beside it — the same call surfaces.css already makes for the
            toast's dismiss control. Minimize takes it too: it is the pair's
            other half and a rounded-rect next to a circle reads as a mistake. */}
        <IconButton
          name="minimize"
          label="Minimize"
          className="shrink-0 rounded-full"
          onClick={() => setMinimized(true)}
        />
        <CloseControl
          confirming={confirming}
          setConfirming={setConfirming}
          dirty={dirty}
          onClose={close}
        />
      </header>

      {/* Amie's sheet: a column of field wells at a 16 px rhythm inside a
          12 px inset, instead of a stack of hairline-separated rows. The
          inset is what makes every well concentric with the sheet — 24 − 12
          is --wren-radius-md, which is the radius they all carry. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <FromRow accounts={list} account={account} onChange={(id) => edit({ accountId: id })} />

      <ChipInput
        label="To"
        value={draft.to}
        onChange={(to) => edit({ to })}
        autoFocus
        inputRef={toRef}
        trailing={
          showCc ? undefined : (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              // "Cc Bcc" read as one word. The slash says it is two fields,
              // and the label says what pressing it does.
              aria-label="Add Cc and Bcc"
              className="font-ui text-ink-3 hover:text-ink focus-ring h-6 rounded-xs px-1 text-xs"
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

      <div className="bg-sunken rounded-md flex min-h-9 items-center gap-3 px-3">
        <label
          htmlFor="wren-subject"
          className={FIELD_LABEL}
        >
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
      </div>

      {draft.attachments.length > 0 && (
        <div className="border-hairline flex flex-col gap-2 border-t px-4 py-2">
          <ul className="flex flex-wrap gap-2">
            {draft.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="bg-sunken text-ink-2 flex h-8 max-w-full items-center gap-2 rounded-full pr-1 pl-3 text-sm"
              >
                <Icon name="attachment" size={16} className="text-ink-3" />
                <span className="truncate">{attachment.filename}</span>
                <span className={META_TEXT}>
                  {formatBytes(attachment.sizeBytes)}
                </span>
                {/* 20×20 was under WCAG 2.2 SC 2.5.8's 24×24 floor and well
                    under the app's own 32 px `--wren-hit` (S10). The glyph
                    keeps its size; the pseudo-element restores a 32 px hit box
                    without changing the chip's metrics — the same pattern the
                    thread row already used. The `size-3.5` override is gone
                    with it: a 16 px glyph scaled to 14 by CSS is off
                    DIRECTION §8's 16/18/20 grid (S9). */}
                <button
                  type="button"
                  aria-label={`Remove ${attachment.filename}`}
                  onClick={() =>
                    edit({
                      attachments: draft.attachments.filter((a) => a.id !== attachment.id),
                    })
                  }
                  className="focus-ring text-ink-3 hover:text-ink relative inline-flex size-5 shrink-0 items-center justify-center rounded-xs after:absolute after:-inset-1.5 after:content-['']"
                >
                  <Icon name="close" size={16} />
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
        <div className="min-w-0 flex-1" />
        {/* The reason, once the person has asked for it by pressing something.
            Live, so it is heard as well as seen, and truncating rather than
            wrapping because the footer is one 48 px band. */}
        <p aria-live="polite" className="text-ink-2 min-w-0 truncate text-xs">
          {notice}
        </p>
        <Tooltip>
          <TooltipTrigger
            render={
              <PrimaryButton
                onClick={send}
                disabled={sending}
                aria-disabled={blocked !== null || undefined}
                // The send celebration — AMIE-STUDY §7(c).3. The button *is*
                // the celebration: its fill crossfades to the green solid over
                // 120 ms, the arrow becomes a check, and it runs one gentle
                // pop. No particles. Send repeats dozens of times a day, and
                // frequency is what kills delight.
                //
                // `disabled:opacity-40` from the recipe would grey the whole
                // confirmation out the moment `sending` goes true, so the
                // sending state overrides it back to full opacity.
                style={
                  sending
                    ? { animation: 'wren-fill-pop var(--wren-dur-base) var(--wren-ease-spring)' }
                    : undefined
                }
                // `aria-disabled`, not `disabled`: it reads as unavailable and
                // keeps its pointer events, which is what lets the tooltip and
                // the press explain themselves.
                className={cn(SEND_BUTTON, 'aria-disabled:opacity-40', sending && SEND_CONFIRM)}
              />
            }
          >
            {/* The label changed rather than being replaced: keying the span on
                the state remounts it, and `.wren-swap` crossfades it in place
                at 120 ms. Family's shared-letter morph, degraded honestly. */}
            <Icon name={sending ? 'check' : 'sent'} size={16} key={sending ? 'sent' : 'send'} />
            <span key={sending ? 'sent-label' : 'send-label'} className="wren-swap">
              {sending ? 'Sent' : 'Send'}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span>{blocked ?? 'Send'}</span>
            {!blocked && <TooltipHint>{MOD}↵</TooltipHint>}
          </TooltipContent>
        </Tooltip>
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
    <div className="bg-sunken rounded-md flex min-h-9 items-center gap-3 px-3">
      <span className={FIELD_LABEL}>From</span>
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
      description="Maru does not keep drafts yet. Closing loses what you wrote."
      cancelLabel="Keep writing"
      confirmLabel="Discard"
      onConfirm={onClose}
      className="w-64"
      // A Base UI trigger clones the element it is given, so this is a plain
      // button wearing the IconButton recipe rather than the component.
      trigger={
        <button
          type="button"
          // No `title`: it duplicated the accessible name and some screen
          // readers announce both (N7). This element is already owned by the
          // popover trigger, which is why it does not carry a Tooltip either.
          aria-label="Close"
          onClick={(event) => {
            if (dirty) return
            event.preventDefault()
            onClose()
          }}
          // A circle, for the concentricity reason spelled out beside the
          // minimize button above. It is the corner-most control on both the
          // 24 px sheet and the 18 px minimized chip, and a circle nests
          // correctly in either without knowing which one it is in.
          className={iconButtonClass('default', 'shrink-0 rounded-full')}
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
