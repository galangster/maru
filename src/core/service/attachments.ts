// Turning a draft's attachment references into bytes, once, for both services.
//
// A forward carries the attachments of the message it forwards (P1, issue 1).
// The composer holds a reference rather than the file — see `AttachmentSource`
// in core/types.ts — so exactly one step stands between a draft and a message
// on the wire, and it is this one. Both `send()` implementations call it, and
// `buildRawMessage` will not accept a draft that has not been through it.

import { base64EncodeBytes } from '../mime'
import type { ComposeDraft, SendableAttachment, SendableDraft } from '../types'

/** Fetches one carried attachment's bytes — `MailService.getAttachment`. */
export type FetchAttachment = (
  threadKey: string,
  messageId: string,
  attachmentId: string,
) => Promise<Uint8Array>

/**
 * The draft with every attachment's bytes in hand.
 *
 * Fetches run in parallel and the order of the list is preserved, because it
 * is the order the chips were shown in and the order the recipient will see.
 *
 * A fetch that fails is not swallowed. Sending a forward whose invoice quietly
 * did not come along is the exact defect this file exists to close, so the
 * error reaches the send path, which puts the draft back with the reason.
 */
export async function resolveAttachments(
  draft: ComposeDraft,
  fetch: FetchAttachment,
): Promise<SendableDraft> {
  if (draft.attachments.every((a) => a.dataBase64 !== undefined)) {
    return draft as SendableDraft
  }

  const attachments = await Promise.all(
    draft.attachments.map(async (attachment): Promise<SendableAttachment> => {
      if (attachment.dataBase64 !== undefined) {
        return { ...attachment, dataBase64: attachment.dataBase64 }
      }
      if (!attachment.source) {
        throw new Error(`Attachment ${attachment.filename} has neither bytes nor a source`)
      }
      const { threadKey, messageId, attachmentId } = attachment.source
      const bytes = await fetch(threadKey, messageId, attachmentId)
      return { ...attachment, dataBase64: base64EncodeBytes(bytes), sizeBytes: bytes.length }
    }),
  )

  return { ...draft, attachments }
}
