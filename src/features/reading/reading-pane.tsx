// The third pane: thread header, message cards, and the actions that act on
// the whole thread. Archive / trash / star / read go through performAction;
// reply / reply all / forward open the composer on the newest message.

import { useLayoutEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { motion } from 'motion/react'

import { Icon, type IconName } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { IconButton, Keycap, OptionRow, PRESS } from '@/components/wren-controls'
import type { Label, Message, Thread } from '@/core/types'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import type { ReplyMode } from '@/lib/compose'
import {
  registerActionUndo,
  registerUndoable,
  useLabels,
  usePerformAction,
  useSaveSettings,
  useSettings,
  useThread,
  useModifyLabels,
} from '@/features/mail/queries'
import { threadActions, type ThreadActionId } from '@/features/mail/thread-actions'
import { useSurfaces } from '@/features/shell/surface-store'
import { useUi } from '@/features/mail/ui-store'
import { nextAfterRemoval, visibleThreadsSnapshot } from '@/features/list/list-prefs'

import { displayMessages, expandedIds, normalizeExpansion, toggleExpanded } from './conversation'
import { EmptyState } from '@/components/empty-state'
import { displayName } from '@/lib/format'
import { hueFor, hueVars } from '@/lib/hue'
import { crossfadePreset, staggerPreset, stillPreset, useMotionMode } from '@/lib/motion'
import { useNow } from '@/lib/use-now'
import { announcesItself, LEAVES_THE_LIST } from '@/lib/undo'
import { cn } from '@/lib/utils'

import { MessageCard } from './message-card'

export function ReadingPane() {
  const selectedKey = useUi((s) => s.selected)
  const selectionSource = useUi((s) => s.selectionSource)
  const imagesAllowed = useUi((s) => s.imagesAllowed)
  const allowImages = useUi((s) => s.allowImages)
  const now = useNow()

  const detail = useThread(selectedKey)
  const queryClient = useQueryClient()
  const action = usePerformAction()
  const settings = useSettings()
  const saveSettings = useSaveSettings()
  const order = settings.data?.conversationOrder ?? 'chronological'
  /**
   * The effective decision for one thread: the setting, OR the per-thread
   * override. The direction is the contract — the Set can only OPEN what the
   * setting closed, never close what the setting opened.
   *
   * `?? 'block'` is deliberately fail-closed and is NOT a second copy of the
   * default: it answers "may I fetch, not yet knowing what was chosen?", and
   * the answer to that is a policy independent of whatever defaults.ts says.
   * The settings query is mounted from app start, so the window is narrow —
   * but narrow is not never, and being wrong this way costs one banner frame
   * and one extra sanitize pass, while being wrong the other way fetches
   * remote images for someone who chose to block them, once, unrecoverably.
   */
  const imagePolicy = settings.data?.imagePolicy ?? 'block'
  const showRemoteImages = (threadKey: string) =>
    imagePolicy === 'allow' || imagesAllowed.has(threadKey)
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
        // TRANSPARENT, so the shell's field runs behind this pane unbroken.
        // At rest the ground itself is the character's field, and a pane
        // painting its own bg-canvas here would cut a grey band out of it.
        className="flex h-full flex-col outline-none"
      >
        {/* Still the drag field, so the window moves by its own top edge with
            nothing open — but no rule and no fill. There is no toolbar here to
            head, and a hairline across an empty pane only chops the field in
            two (owner, 2026-08-31). A childless div with a bare attribute is
            always a direct hit, so it drags and double-click-zooms. */}
        <div data-tauri-drag-region className="h-(--wren-toolbar-h) shrink-0" />
        <div className="min-h-0 flex-1">
          {/* The bird is always here. A "one Maru on screen" rule briefly
              stood the perched bird down while the list flew one; the owner
              overruled it, and the distinction he drew is better than the rule
              was — the two birds are not duplicates, they are the same
              character in its two states, and the backgrounds now say which is
              which. A field is where Maru waits; the disc is where Maru flies. */}
          <EmptyState
            mark
            copy={{
              title: 'Nothing open',
              subtitle: 'Pick a thread on the left, or press J to open the first one.',
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

  // The same descriptor the row's hover cluster and the palette read; only the
  // order differs here, because the toolbar reads left to right as triage then
  // state rather than as the row's four-in-a-cluster.
  const actions = threadActions(thread)
  // Later sits beside Archive, as it does in the row's cluster: the two answer
  // the same question, "not now" and "not ever".
  const toolbar: ThreadActionId[] = ['archive', 'later', 'trash', 'star', 'read']

  return (
    <section
      aria-label="Reading"
      tabIndex={-1}
      // No `border-t`: see the empty state above. The header's `border-b` is
      // the window's first horizontal rule, level with the list's.
      className="bg-canvas flex h-full min-w-0 flex-col outline-none"
    >
      {/* Drag field, like the list's header. `="deep"` so the blank middle and
          the header's own padding move the window; drag.js already blocks the
          buttons, and the two wrappers below make that explicit. */}
      <header
        data-tauri-drag-region="deep"
        // Both cards are flush to the window top, so every header band is the
        // same height and the control rows line up with no padding trick.
        className="border-hairline flex h-(--wren-toolbar-h) shrink-0 items-center gap-1 border-b px-4 pt-[calc(var(--wren-toolbar-h)-var(--wren-card-band))]"
      >
        <div data-tauri-drag-region="false" className="flex items-center gap-1">
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
                  // Later is not a label action, so it cannot go through
                  // `performAction` — it opens the picker, and the list owns
                  // the commit, the advance and the undo from there.
                  if (spec.kind === 'later') {
                    useSurfaces.getState().openLater([thread.key])
                    return
                  }
                  // Same advance rule as the keys, off the same set: removing
                  // the open thread shows the next one, so triage stays one
                  // press per message.
                  if (LEAVES_THE_LIST.has(spec.type)) {
                    useUi
                      .getState()
                      .setSelected(
                        nextAfterRemoval(visibleThreadsSnapshot(queryClient), thread.key),
                        'keyboard',
                      )
                  }
                  const next = { type: spec.type, threadKey: thread.key }
                  action.mutate(next)
                  // A deliberate press, so it is worth a ⌘Z. The mark-read that
                  // fires on merely opening a thread is not, and does not
                  // register — see registerActionUndo.
                  //
                  // The four that empty the pane also say so, restore from
                  // trash included (issue 5): the thread the toolbar was
                  // describing is gone, and a button that seems to do nothing
                  // is worse than the action it performed.
                  if (announcesItself(spec.type)) registerUndoable(action.mutate, next)
                  else registerActionUndo(action.mutate, next)
                }}
              />
            )
          })}
        </div>
        {/* Plain on purpose: the middle of the toolbar is the drag handle. */}
        <span className="flex-1" />
        <div data-tauri-drag-region="false" className="flex items-center gap-1">
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
        </div>
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
          <ThreadHeader
            thread={thread}
            messages={messages}
            userLabels={(labels.data ?? []).filter((l) => l.type === 'user')}
          />

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
                imagesAllowed={showRemoteImages(thread.key)}
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
  userLabels,
}: {
  thread: Thread
  messages: Message[]
  userLabels: Label[]
}) {
  const modify = useModifyLabels()
  const people = (thread.participants.length > 0 ? thread.participants : messages.map((m) => m.from))
    .map(displayName)
    .join(', ')
  const applied = userLabels.filter((l) => thread.labelIds.includes(l.id))

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
      {userLabels.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2 pt-1">
          {applied.map((label) => (
            // A hue chip: the label's own wash carrying its own ink, as a pill
            // (AMIE-STUDY §7b). This is one of exactly two places a category
            // hue is allowed to appear — a real Gmail label, and the sender
            // avatar's hash. The wash is 12% light / 22% dark and the ink is
            // contrast-verified against both, so the chip reads at 20 px
            // without a border.
            <li
              key={label.id}
              style={hueVars(hueFor(label.name))}
              className="font-ui bg-(--hue-wash) text-(--hue-ink) flex h-5 items-center rounded-full px-2 text-xs font-medium"
            >
              {label.name}
            </li>
          ))}
          <li>
            {/* The M9 seam's human half (P10): the same modifyLabels agents
                use, from a quiet popover. Cache refresh rides the service's
                own threadsChanged event, like every other mail action. */}
            <Popover>
              <PopoverTrigger
                aria-label="Labels"
                className="font-ui text-ink-3 hover:bg-fill-hover hover:text-ink focus-ring flex h-5 items-center rounded-full px-2 text-xs font-medium transition-colors duration-(--wren-dur-fast)"
              >
                + Label
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={6} className="w-56">
                <div role="group" aria-label="Labels" className="flex flex-col gap-0.5">
                  {userLabels.map((label) => {
                    const on = thread.labelIds.includes(label.id)
                    return (
                      <OptionRow
                        key={label.id}
                        selected={on}
                        disabled={modify.isPending}
                        onClick={() =>
                          modify.mutate({
                            threadKey: thread.key,
                            changes: on
                              ? { addLabelIds: [], removeLabelIds: [label.id] }
                              : { addLabelIds: [label.id], removeLabelIds: [] },
                          })
                        }
                      >
                        {label.name}
                      </OptionRow>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </li>
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
    // `@container`: the tiles ask how wide the READING PANE is, not the
    // window — the pane is user-draggable. As it narrows the keycap hints
    // yield first (they are reinforcement, not the only path — R/A/F work
    // regardless); labels never wrap to two lines.
    <div className="@container mt-4 grid grid-cols-3 gap-2">
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
          <span className="whitespace-nowrap">{tile.label}</span>
          <Keycap className="hidden @[30rem]:inline-flex">{tile.hint}</Keycap>
        </button>
      ))}
    </div>
  )
}
