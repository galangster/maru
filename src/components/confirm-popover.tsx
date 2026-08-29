// "Are you sure?", anchored on the control that asked.
//
// Wren raises this twice — discarding a draft and removing an account — and
// both are the same shape: a title, a sentence saying what is actually lost, a
// quiet way out on the left and the destructive one on the right. Written
// twice it drifted in padding and in which button got the focus ring.
//
// A popover rather than a modal on purpose: the thing being confirmed stays on
// screen behind it, which is what makes the sentence checkable.

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ConfirmPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  /** The way out. Never "Cancel" — say what keeping it means. */
  cancelLabel: string
  confirmLabel: string
  onConfirm: () => void
  /**
   * The control the popover hangs off. Base UI clones this element, so it has
   * to be a plain element the trigger can own rather than a component.
   */
  trigger: React.ReactElement
  /** Rendered inside the trigger — the glyph or the word on the button. */
  triggerContent?: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  className?: string
}

export function ConfirmPopover({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  trigger,
  triggerContent,
  side = 'bottom',
  align = 'end',
  className,
}: ConfirmPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger}>{triggerContent}</PopoverTrigger>
      <PopoverContent side={side} align={align} className={cn('w-72', className)}>
        <PopoverTitle className="font-ui text-ink text-base">{title}</PopoverTitle>
        <PopoverDescription className="text-ink-3 text-sm">{description}</PopoverDescription>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="font-ui text-ink-2 hover:bg-fill-hover focus-visible:ring-ring/50 h-8 rounded-md px-3 text-base font-medium outline-none focus-visible:ring-3"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="font-ui bg-destructive h-8 rounded-md px-3 text-base font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-destructive/50"
          >
            {confirmLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
