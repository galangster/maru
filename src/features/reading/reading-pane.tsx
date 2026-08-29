// The third pane: thread header, message cards, and the actions that act on
// the whole thread. Archive / trash / star / read go through performAction;
// reply / reply all / forward open the composer on the newest message.

import { useLayoutEffect, useRef } from 'react'

import { motion } from 'motion/react'

import { Icon, type IconName } from '@/components/ui/icon'
import { IconButton, Keycap, PRESS } from '@/components/wren-controls'
import type { Message, Thread } from '@/core/types'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import type { ReplyMode } from '@/lib/compose'
import {
  registerActionUndo,
  useLabels,
  usePerformAction,
  useSaveSettings,
  useSettings,
  useThread,
} from '@/features/mail/queries'
import { threadActions, type ThreadActionId } from '@/features/mail/thread-actions'
import { useUi } from '@/features/mail/ui-store'

import { displayMessages, expandedIds, normalizeExpansion, toggleExpanded } from './conversation'
import { EmptyState } from '@/components/empty-state'
import { displayName } from '@/lib/format'
import { hueFor, hueVars } from '@/lib/hue'
import { crossfadePreset, staggerPreset, stillPreset, useMotionMode } from '@/lib/motion'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

import { MessageCard } from './message-card'

export function ReadingPane() {
  const selectedKey = useUi((s) => s.selected)
  const selectionSource = useUi((s) => s.selectionSource)
  const imagesAllowed = useUi((s) => s.imagesAllowed)
  const allowImages = useUi((s) => s.allowImages)
  const now = useNow()

  const detail = useThread(selectedKey)
  const action = usePerformAction()
  const settings = useSettings()
  const saveSettings = useSaveSettings()
  const order = settings.data?.conversationOrder ?? 'chronological'
  const expansion = useUi((s) => s.readingExpansion)
  const setExpansion = useUi((s) => s.setReadingExpansion)
  const mode = useMotionMode()
  // j/k traversal is the highest-frequency action in the app and gets nothing.
  // A click or a palette jump is rare enough to arrive: the sender line resolves
  // one 40 ms stagger step before the body, so the eye lands on *who* before
  // *what* (MAGIC §3.8).
  const traversing = selectionSource === 'keyboard'
  const fade = traversing ? stillPreset() : crossfadePreset(mode)
  const { step } = staggerPreset(mode)

  const thread = detail.data?.thread
  const labels = useLabels(thread?.accountId)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Land on the newest message, not the oldest. Messages stay chronological —
  // a conversation reads downward — but a long thread used to open at its
  // top, so the first screen was years-old collapsed cards and the message
  // that caused the notification sat below the fold. Everything above the
  // newest card is collapsed to a fixed height, so its offset is stable even
  // while its own body iframe is still measuring; a short thread has no
  // scroll range and the assignment clamps to 0. Instant, before paint: this
  // is where the thread opens, not a motion.
  const messageCount = detail.data?.messages.length ?? 0
  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    // Newest-on-top needs no hunt: the anchor is the first thing in the pane,
    // and the only job is undoing whatever scroll the previous thread left.
    if (order === 'newestFirst' || messageCount < 2) {
      container.scrollTop = 0
      return
    }
    const cards = container.querySelectorAll<HTMLElement>('[data-message-card]')
    const newest = cards[cards.length - 1]
    if (!newest) return
    const top =
      newest.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop
    container.scrollTop = Math.max(0, top - 12)
  }, [thread?.key, messageCount, order])

  if (!selectedKey || !thread) {
    return (
      <section
        aria-label="Reading"
        tabIndex={-1}
        // `border-t` matches the list's, so the hairline under the titlebar
        // runs unbroken across both panes whether or not a thread is open.
        className="bg-canvas border-hairline flex h-full flex-col border-t outline-none"
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
  const shown = displayMessages(messages, order)
  const open = expandedIds(messages, expansion)
  // One spelling of "everything is open", shared with the keymap's `o`:
  // manual sets that reach all-open normalize to 'all' on the way in.
  const allOpen = expansion === 'all'
  const chips = (labels.data ?? []).filter(
    (l) => l.type === 'user' && thread.labelIds.includes(l.id),
  )

  // The same descriptor the row's hover cluster and the palette read; only the
  // order differs here, because the toolbar reads left to right as triage then
  // state rather than as the row's four-in-a-cluster.
  const actions = threadActions(thread)
  const toolbar: ThreadActionId[] = ['archive', 'trash', 'star', 'read']

  return (
    <section
      aria-label="Reading"
      tabIndex={-1}
      className="bg-canvas border-hairline flex h-full min-w-0 flex-col border-t outline-none"
    >
      <header className="border-hairline flex h-(--wren-toolbar-h) shrink-0 items-center gap-1 border-b px-4">
        {toolbar.map((id) => {
          const spec = actions[id]
          return (
            <IconButton
              key={spec.id}
              name={spec.icon}
              label={spec.label}
              hint={spec.hint}
              tone={spec.tone}
              filled={spec.filled}
              pop={spec.pop}
              disabled={spec.disabled}
              onClick={() => {
                const next = { type: spec.type, threadKey: thread.key }
                action.mutate(next)
                // A deliberate press, so it is worth a ⌘Z. The mark-read that
                // fires on merely opening a thread is not, and does not
                // register — see registerActionUndo.
                registerActionUndo(action.mutate, next)
              }}
            />
          )
        })}
        <span className="flex-1" />
        {messages.length > 1 && (
          <IconButton
            name={allOpen ? 'minimize' : 'expand'}
            label={allOpen ? 'Collapse all messages' : 'Expand all messages'}
            hint="O"
            onClick={() => setExpansion(allOpen ? 'none' : 'all')}
          />
        )}
        <IconButton
          name={order === 'newestFirst' ? 'chevronUp' : 'chevronDown'}
          label={order === 'newestFirst' ? 'Newest at top' : 'Oldest at top'}
          active={order === 'newestFirst'}
          onClick={() =>
            saveSettings.mutate({
              conversationOrder: order === 'newestFirst' ? 'chronological' : 'newestFirst',
            })
          }
        />
      </header>

      {/* `scroll-fade`: the body runs to the window frame, so a line of mail
          straddling the bottom edge dissolves rather than being sliced. */}
      <div ref={scrollRef} data-reading-scroll className="scroll-fade min-h-0 flex-1 overflow-y-auto">
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

          <motion.div
            initial={fade.initial}
            animate={fade.animate}
            transition={{ ...fade.transition, delay: traversing ? 0 : step }}
            className="mt-6 flex flex-col gap-2"
          >
            {shown.map((message) => (
              <MessageCard
                key={message.id}
                threadKey={thread.key}
                message={message}
                expanded={open.has(message.id)}
                onToggle={() =>
                  setExpansion(normalizeExpansion(toggleExpanded(open, message.id), messages))
                }
                now={now}
                imagesAllowed={imagesAllowed.has(thread.key)}
                onAllowImages={() => allowImages(thread.key)}
              />
            ))}
          </motion.div>

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
            // A hue chip: the label's own wash carrying its own ink, as a pill
            // (AMIE-STUDY §7b). This is one of exactly two places a category
            // hue is allowed to appear — a real Gmail label, and the sender
            // avatar's hash. The wash is 12% light / 22% dark and the ink is
            // contrast-verified against both, so the chip reads at 20 px
            // without a border.
            <li
              key={name}
              style={hueVars(hueFor(name))}
              className="font-ui bg-(--hue-wash) text-(--hue-ink) flex h-5 items-center rounded-full px-2 text-xs font-medium"
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
        // The shortcut is printed, not hidden in a `title`. These three hints
        // were discoverable by hover alone and never on keyboard focus (S12);
        // the tiles are 40 px tall and have the room for a keycap.
        <button
          key={tile.label}
          type="button"
          onClick={() => replyToSelected(tile.mode)}
          className={cn(
            'focus-ring bg-surface text-ink-2 hover:bg-fill-hover flex h-10 items-center justify-center gap-2 rounded-md text-base shadow-xs',
            'font-ui font-medium transition-[color,background-color,scale] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
            PRESS,
          )}
        >
          <Icon name={tile.icon} size={16} />
          {tile.label}
          <Keycap>{tile.hint}</Keycap>
        </button>
      ))}
    </div>
  )
}
