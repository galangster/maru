import { useState } from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/ui/icon'
import { META_TEXT } from '@/components/wren-controls'
import type { Attachment } from '@/core/types'
import { useMailService } from '@/features/mail/service'
import { attachmentIcon, formatBytes } from '@/lib/format'
import { saveBytes } from '@/lib/save-file'
import { cn } from '@/lib/utils'

export function AttachmentChip({
  threadKey,
  attachment,
}: {
  threadKey: string
  attachment: Attachment
}) {
  const service = useMailService()
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const bytes = await service.getAttachment(threadKey, attachment.messageId, attachment.id)
      if (await saveBytes(attachment.filename, bytes)) {
        toast(`Saved ${attachment.filename}`)
      }
    } catch (cause) {
      toast.error(`Could not save ${attachment.filename}`, {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void download()}
      className={cn(
        'bg-sunken text-ink-2 hover:bg-fill-hover focus-ring inline-flex h-8 max-w-64 items-center gap-2 rounded-full px-3 text-sm transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        busy && 'opacity-60',
      )}
    >
      <Icon
        name={busy ? 'loading' : attachmentIcon(attachment.mimeType)}
        size={16}
        className="text-ink-3"
      />
      <span className="truncate">{attachment.filename}</span>
      <span className={META_TEXT}>
        {formatBytes(attachment.sizeBytes)}
      </span>
    </button>
  )
}
