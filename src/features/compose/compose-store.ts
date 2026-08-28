// The one open draft. Wren docks a single composer, Spark-style, so this is a
// singleton rather than a collection — a second Compose replaces the first
// only after the first has been dealt with.

import { create } from 'zustand'

import type { ComposeDraft, EmailAddress } from '@/core/types'

export interface DraftAttachment {
  /** Local id; attachments only exist here until send. */
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  dataBase64: string
}

export interface Draft {
  /** Empty until the composer resolves it against the account list. */
  accountId: string
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
  subject: string
  bodyHtml: string
  attachments: DraftAttachment[]
  reply?: ComposeDraft['reply']
}

export function emptyDraft(): Draft {
  return { accountId: '', to: [], cc: [], bcc: [], subject: '', bodyHtml: '', attachments: [] }
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
    set((s) => ({
      open: true,
      minimized: false,
      dirty: false,
      confirming: false,
      seed: s.seed + 1,
      showCc: (init.cc?.length ?? 0) > 0 || (init.bcc?.length ?? 0) > 0,
      draft: { ...emptyDraft(), accountId: s.lastAccountId, ...init },
    })),
  close: () =>
    set({ open: false, minimized: false, dirty: false, confirming: false, draft: emptyDraft() }),
  setMinimized: (minimized) => set({ minimized }),
  setConfirming: (confirming) => set({ confirming }),
  setShowCc: (showCc) => set({ showCc }),
  edit: (patch) => set((s) => ({ draft: { ...s.draft, ...patch }, dirty: true })),
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
    bodyHtml: draft.bodyHtml,
    attachments: draft.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      dataBase64: a.dataBase64,
    })),
    reply: draft.reply,
  }
}
