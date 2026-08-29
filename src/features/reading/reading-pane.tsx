// The third pane: thread header, message cards, and the actions that act on
// the whole thread. Archive / trash / star / read go through performAction;
// reply / reply all / forward open the composer on the newest message.

import { useMemo } from 'react'
import { motion } from 'motion/react'

import { Icon, type IconName } from '@/components/ui/icon'
import { IconButton } from '@/components/wren-controls'
import type { Account, MailActionType, Message, Thread } from '@/core/types'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import type { ReplyMode } from '@/lib/compose'
import { useAccounts, useLabels, usePerformAction, useThread } from '@/features/mail/queries'
import { useUi } from '@/features/mail/ui-store'
import { EmptyState } from '@/features/list/empty-state'
import { displayName } from '@/lib/format'
import { crossfadePreset, useMotionMode } from '@/lib/motion'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

import { MessageCard } from './message-card'

export function ReadingPane() {
  const selectedKey = useUi((s) => s.selected)
  const imagesAllowed = useUi((s) => s.imagesAllowed)
  const allowImages = useUi((s) => s.allowImages)
  const now = useNow()

  const detail = useThread(selectedKey)
  const accounts = useAccounts()
  const action = usePerformAction()
  const mode = useMotionMode()
  const fade = crossfadePreset(mode)

  const accountsById = useMemo(() => {
    const map = new Map<string, Account>()
    for (const a of accounts.data ?? []) map.set(a.id, a)
    return map
  }, [accounts.data])

  const thread = detail.data?.thread
  const labels = useLabels(thread?.accountId)

  if (!selectedKey || !thread) {
    return (
      <section
        aria-label="Reading"
        tabIndex={-1}
        className="bg-canvas flex h-full flex-col outline-none"
      >
        {/* Empty, but it keeps the toolbar hairline level across all three panes. */}
        <div className="border-hairline h-(--wren-toolbar-h) shrink-0 border-b" />
        <div className="min-h-0 flex-1">
          <EmptyState
            mark
            copy={{
              title: 'Nothing open',
              subtitle: 'Pick a thread on the left. J opens the first one.',
            }}
          />
        </div>
      </section>
    )
  }

  const messages = detail.data?.messages ?? []
  const account = accountsById.get(thread.accountId)
  const inTrash = thread.labelIds.includes('TRASH')
  const chips = (labels.data ?? []).filter(
    (l) => l.type === 'user' && thread.labelIds.includes(l.id),
  )

  const run = (type: MailActionType) => action.mutate({ type, threadKey: thread.key })

  return (
    <section aria-label="Reading" tabIndex={-1} className="bg-canvas flex h-full min-w-0 flex-col outline-none">
      <header className="border-hairline flex h-(--wren-toolbar-h) shrink-0 items-center gap-1 border-b px-4">
        <IconButton
          name="archive"
          label="Archive"
          onClick={() => run('archive')}
          disabled={inTrash}
        />
        <IconButton
          name="trash"
          label={inTrash ? 'Restore from trash' : 'Move to trash'}
          tone="danger"
          onClick={() => run(inTrash ? 'untrash' : 'trash')}
        />
        <IconButton
          name="star"
          label={thread.starred ? 'Unstar' : 'Star'}
          tone={thread.starred ? 'star' : 'default'}
          filled={thread.starred}
          pop
          onClick={() => run(thread.starred ? 'unstar' : 'star')}
        />
        <IconButton
          name={thread.unread ? 'read' : 'unread'}
          label={thread.unread ? 'Mark as read' : 'Mark as unread'}
          onClick={() => run(thread.unread ? 'markRead' : 'markUnread')}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Keyed on the thread, so switching threads is a crossfade rather
            than a hard cut. No AnimatePresence: the outgoing thread would have
            to be absolutely positioned over the incoming one, which fights the
            body iframe's own measurement. */}
        <motion.div
          key={thread.key}
          initial={fade.initial}
          animate={fade.animate}
          transition={fade.transition}
          className="mx-auto w-full max-w-[calc(var(--wren-read-measure)+2*var(--wren-read-px))] px-(--wren-read-px) pt-(--wren-read-pt) pb-12"
        >
          <ThreadHeader thread={thread} messages={messages} chips={chips.map((l) => l.name)} />

          <div className="mt-6 flex flex-col gap-2">
            {messages.map((message, index) => (
              <MessageCard
                key={message.id}
                threadKey={thread.key}
                message={message}
                account={account}
                defaultExpanded={index === messages.length - 1}
                now={now}
                imagesAllowed={imagesAllowed.has(thread.key)}
                onAllowImages={() => allowImages(thread.key)}
              />
            ))}
          </div>

          <ReplyBar />
        </motion.div>
      </div>
    </section>
  )
}

function ThreadHeader({
  thread,
  messages,
  chips,
}: {
  thread: Thread
  messages: Message[]
  chips: string[]
}) {
  const people = (thread.participants.length > 0 ? thread.participants : messages.map((m) => m.from))
    .map(displayName)
    .join(', ')

  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-ui text-ink text-xl font-semibold text-balance">
        {thread.subject || '(no subject)'}
      </h1>
      <p className="text-ink-3 text-sm">
        {people}
        <span className="tabular-nums">
          {' · '}
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </span>
      </p>
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-1">
          {chips.map((name) => (
            <li
              key={name}
              className="bg-sunken text-ink-2 flex h-6 items-center rounded-xs px-2 text-xs"
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Equal-width action tiles, Phantom 3. Each opens the composer prefilled. */
function ReplyBar() {
  const { replyToSelected } = useComposeActions()

  const tiles: { icon: IconName; label: string; mode: ReplyMode; hint: string }[] = [
    { icon: 'reply', label: 'Reply', mode: 'reply', hint: 'R' },
    { icon: 'replyAll', label: 'Reply all', mode: 'replyAll', hint: 'A' },
    { icon: 'forward', label: 'Forward', mode: 'forward', hint: 'F' },
  ]

  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <button
          key={tile.label}
          type="button"
          title={`${tile.label} (${tile.hint})`}
          onClick={() => replyToSelected(tile.mode)}
          className={cn(
            'bg-surface text-ink-2 hover:bg-fill-hover focus-visible:ring-ring/50 flex h-10 items-center justify-center gap-2 rounded-md text-base outline-none shadow-xs',
            'font-ui font-medium transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out) focus-visible:ring-3',
          )}
        >
          <Icon name={tile.icon} size={16} />
          {tile.label}
        </button>
      ))}
    </div>
  )
}
