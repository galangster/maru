// Calm empty states. One line, one explanatory subtitle (Family 2), and a soft
// illustration built from CSS shapes — no images, nothing to load, and it
// re-tints itself with the theme.

import type { MailView } from '@/core/types'
import { cn } from '@/lib/utils'

/** Three overlapping discs and a bar: a cloud, at 10% opacity. */
export function CloudMark({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative h-16 w-28', className)}>
      <span className="bg-ink-3/12 absolute bottom-4 left-0 size-12 rounded-full" />
      <span className="bg-ink-3/12 absolute bottom-6 left-7 size-16 rounded-full" />
      <span className="bg-ink-3/12 absolute right-0 bottom-4 size-11 rounded-full" />
      <span className="bg-ink-3/12 absolute bottom-4 left-2 h-6 w-24 rounded-full" />
    </div>
  )
}

export interface EmptyCopy {
  title: string
  subtitle: string
}

export function emptyCopyFor(view: MailView, labelName?: string): EmptyCopy {
  if (view.kind === 'unified') {
    switch (view.folder) {
      case 'inbox':
        return { title: 'Inbox zero', subtitle: 'Nothing waiting. Wren will say when that changes.' }
      case 'starred':
        return { title: 'Nothing starred', subtitle: 'Star a thread and it will wait for you here.' }
      case 'sent':
        return { title: 'Nothing sent yet', subtitle: 'Mail you send from Wren collects here.' }
      case 'trash':
        return { title: 'Trash is empty', subtitle: 'Deleted threads rest here before Gmail clears them.' }
    }
  }
  return {
    title: 'Nothing here yet',
    subtitle: labelName
      ? `Threads labelled ${labelName} will collect in this view.`
      : 'Threads with this label will collect in this view.',
  }
}

/**
 * `mark` is off in the 400 px list column and on in the reading pane. An empty
 * label beside an empty reading pane used to put two identical clouds on screen
 * at once, which read as a rendering fault; and the mark is cramped at 400 px
 * anyway. One cloud, in the pane that has room for it.
 */
export function EmptyState({
  copy,
  mark = false,
  className,
}: {
  copy: EmptyCopy
  mark?: boolean
  className?: string
}) {
  return (
    <div
      className={cn('flex h-full flex-col items-center justify-center gap-4 px-8 pb-16', className)}
    >
      {mark && <CloudMark />}
      <div className="flex max-w-80 flex-col gap-1 text-center">
        <p
          className={cn(
            'font-ui text-ink font-medium text-balance',
            mark ? 'text-xl' : 'text-base',
          )}
        >
          {copy.title}
        </p>
        <p className="text-ink-3 text-sm text-pretty">{copy.subtitle}</p>
      </div>
    </div>
  )
}
