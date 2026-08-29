import { toast } from 'sonner'

import { Icon } from '@/components/ui/icon'
import type { Attachment } from '@/core/types'
import { attachmentIcon, formatBytes } from '@/lib/format'

export function AttachmentChip({ attachment }: { attachment: Attachment }) {
  return (
    <button
      type="button"
      onClick={() =>
        toast(`${attachment.filename} stays put for now`, {
          // It said "arrive with T4" — a ticket number, to a user, after T4
          // shipped without them. Say what is true instead.
          description: 'Saving and previewing attachments are coming soon.',
        })
      }
      className="bg-sunken text-ink-2 hover:bg-fill-hover focus-ring inline-flex h-8 max-w-64 items-center gap-2 rounded-full px-3 text-sm transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)"
    >
      <Icon name={attachmentIcon(attachment.mimeType)} size={16} className="text-ink-3" />
      <span className="truncate">{attachment.filename}</span>
      <span className="text-ink-3 shrink-0 text-xs tabular-nums">
        {formatBytes(attachment.sizeBytes)}
      </span>
    </button>
  )
}
