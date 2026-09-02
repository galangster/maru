// The one open draft. Maru docks a single composer, Spark-style, so this is a
// singleton rather than a collection — a second Compose replaces the first
// only after the first has been dealt with.

import { create } from 'zustand'

import type { AttachmentSource, ComposeDraft, EmailAddress } from '@/core/types'

export interface DraftAttachment {
  /** Local id; the chip's key and what its remove control names. */
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  /** The bytes, for a file picked in this composer. */
  dataBase64?: string
  /**
   * Where the bytes live, for an attachment carried from a forwarded message.
   * The composer never reads the file; `MailService.send` fetches it.
   */
  source?: AttachmentSource
}

export interface Draft {
  /** Empty until the composer resolves it against the account list. */
  accountId: string
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
  subject: string
  /** Plain text typed by the compact composer before its quoted HTML. */
  bodyText: string
  bodyHtml: string
  attachments: DraftAttachment[]
  reply?: ComposeDraft['reply']
}

export function emptyDraft(): Draft {
  return { accountId: '', to: [], cc: [], bcc: [], subject: '', bodyText: '', bodyHtml: '', attachments: [] }
}

interface ComposeState {
  open: boolean
  minimized: boolean
  /** Cc/Bcc rows stay hidden until the user asks for them, or a draft uses them. */
  showCc: boolean
  /** Has the user typed anything? Drives the discard confirm. */
  dirty: boolean
  /** The discard confirm popover, anchored on the close button. */
  confirming: boolean
  /** Bumped on every open, so the editor remounts on a new draft. */
  seed: number
  draft: Draft
  /** The account the last message was sent from. The default for a new draft. */
  lastAccountId: string

  openWith: (init: Partial<Draft>) => void
  close: () => void
  setMinimized: (minimized: boolean) => void
  setConfirming: (confirming: boolean) => void
  setShowCc: (showCc: boolean) => void
  /** Any user edit. Marks the draft dirty. */
  edit: (patch: Partial<Draft>) => void
  /** A non-user change (resolving the default account). Leaves it clean. */
  set: (patch: Partial<Draft>) => void
  remember: (accountId: string) => void
}

// Crash insurance (P10): the dirty draft mirrors into localStorage on every
// edit and is cleared by close (which the dirty-confirm already guards) and
// by send. A draft found here at startup means the app died mid-thought —
// the next blank Compose restores it instead of an empty window.
const DRAFT_STORE_KEY = 'wren-draft-v1'

function persistDraft(draft: Draft | null): void {
  try {
    // Bytes only, dropped: they would blow the storage quota mid-typing and
    // leave a *stale* mirror behind — a crash would then resurrect an outdated
    // draft. Losing a picked file in a crash is the honest trade.
    //
    // A carried attachment survives, because it is a reference of a hundred or
    // so bytes and dropping it would restore a forward whose body still
    // promises the invoice it no longer has.
    if (draft) {
      const attachments = draft.attachments.filter((a) => a.source !== undefined)
      localStorage.setItem(DRAFT_STORE_KEY, JSON.stringify({ ...draft, attachments }))
    } else localStorage.removeItem(DRAFT_STORE_KEY)
  } catch {
    // Storage can be unavailable (capture path, private mode); losing the
    // mirror must never break typing.
  }
}

let recovered: Draft | null = (() => {
  try {
    const raw = localStorage.getItem(DRAFT_STORE_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
})()

/** A blank compose passes {} (use-compose-actions); anything with fields is
 * a reply, forward or palette-prefilled draft and must win over recovery. */
function blankInit(init: Partial<Draft>): boolean {
  return Object.keys(init).length === 0
}

export const useComposer = create<ComposeState>((set) => ({
  open: false,
  minimized: false,
  showCc: false,
  dirty: false,
  confirming: false,
  seed: 0,
  draft: emptyDraft(),
  lastAccountId: '',

  openWith: (init) =>
    set((s) => {
      // A blank compose after a crash gets the unsent draft back.
      const restore = blankInit(init) ? recovered : null
      recovered = null
      return {
        open: true,
        minimized: false,
        dirty: restore !== null,
        confirming: false,
        seed: s.seed + 1,
        showCc:
          (restore ?? init).cc !== undefined && ((restore ?? init).cc?.length ?? 0) > 0,
        draft: restore ?? { ...emptyDraft(), accountId: s.lastAccountId, ...init },
      }
    }),
  close: () => {
    // Close is a decision (the dirty confirm stands in front of it), so the
    // crash mirror goes too.
    persistDraft(null)
    set({ open: false, minimized: false, dirty: false, confirming: false, draft: emptyDraft() })
  },
  setMinimized: (minimized) => set({ minimized }),
  setConfirming: (confirming) => set({ confirming }),
  setShowCc: (showCc) => set({ showCc }),
  edit: (patch) =>
    set((s) => {
      const draft = { ...s.draft, ...patch }
      persistDraft(draft)
      return { draft, dirty: true }
    }),
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  remember: (lastAccountId) => set({ lastAccountId }),
}))

/**
 * Esc, from anywhere. Returns true when the composer took the key, so the
 * global handler knows the surface stack is dealt with.
 */
export function requestComposerClose(): boolean {
  const s = useComposer.getState()
  if (!s.open) return false
  if (!s.dirty) {
    s.close()
    return true
  }
  // A confirm that asks about a draft the user cannot see is not a confirm.
  s.setMinimized(false)
  s.setConfirming(true)
  return true
}

/** The wire shape. Attachments lose their local id on the way out. */
export function toComposeDraft(draft: Draft): ComposeDraft {
  return {
    accountId: draft.accountId,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    bodyHtml: `${draft.bodyText ? `<p>${draft.bodyText.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/\n/g, '<br>')}</p>` : ''}${draft.bodyHtml}`,
    attachments: draft.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      dataBase64: a.dataBase64,
      source: a.source,
      sizeBytes: a.sizeBytes,
    })),
    reply: draft.reply,
  }
}
