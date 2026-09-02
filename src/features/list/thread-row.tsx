// One row of the thread list — 68 px, two lines, identical anatomy on every
// row (DIRECTION §2, Phantom 2 and Superhuman 1):
//
//   [dot gutter] [avatar] | sender (fixed 152 px) · count ......... time
//                         | subject · snippet ................ star / clip
//
// The fixed sender column is what makes every subject and every snippet start
// at the same x. Unread is a gutter dot and a weight change — never a tint,
// never a left bar.
//
// Which account a row came from used to be a separate 6 px dot at the far
// right of line two, after the snippet. It read as a stray bullet on a ragged
// edge and it ate the snippet's last characters. Wherever it was moved it was
// still a loose element looking for a column, so it is not a separate element
// any more: the avatar already carries the account colour, and in a unified
// view it now carries a full-chroma hairline of it too. One saturated chip
// leads the row and answers "whose is this" — DIRECTION §2, Family 3.

import { memo, useCallback, useState } from 'react'

import { Icon } from '@/components/ui/icon'
import { AVATAR_CHIP, AccountAvatar, DATE_COLUMN, META_TEXT, iconButtonClass } from '@/components/wren-controls'
import type { Account, MailActionType, Thread } from '@/core/types'
import { THREAD_ACTION_ORDER, threadActions } from '@/features/mail/thread-actions'
import { correspondents, participantLine, relativeTime, wakeStamp, wakeTime } from '@/lib/format'
import { hueFor, hueSolid } from '@/lib/hue'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'

export interface ThreadRowProps {
  thread: Thread
  account: Account | undefined
  selected: boolean
  /** Marked for a batch action — `x`, shift-click, or the avatar. */
  checked: boolean
  showAccount: boolean
  selfEmails: string[]
  /**
   * This row is showing its archive tick and is on its way out — AMIE-STUDY
   * §7(c).1. The list holds the action for exactly as long as the animation
   * runs, so the row is still in the data while it plays.
   */
  ticking?: boolean
  /**
   * Both take the thread rather than closing over it, so the list can hand
   * every row the same two function identities and `memo` actually holds. A
   * per-row arrow made the memo a no-op and re-rendered the whole viewport on
   * every keystroke in the search field.
   */
  onSelect: (thread: Thread, shiftKey: boolean) => void
  onAction: (thread: Thread, type: MailActionType) => void
  /**
   * Later, which is NOT a MailActionType and therefore cannot ride `onAction`.
   * It opens the picker rather than committing: a mouse has no digits, so the
   * division the keyboard makes (`h`, then a number) is not available here.
   */
  onLater: (thread: Thread) => void
  onCheck: (thread: Thread) => void
  /**
   * The Later list, where the row's date is the day the mail comes BACK.
   *
   * The list groups by that day, and the row printed the day the mail arrived
   * instead — "Today" as a header over "Yesterday" on the row (issue #38).
   * A flag rather than a formatted string, so the row keeps owning its own
   * clock and the minute tick still re-renders only the timestamps.
   */
  showWake?: boolean
}

/** The DOM id of a row, so the listbox can point `aria-activedescendant` at it.
 *  Thread keys are `accountId/gmailThreadId`, which is a legal id and is never
 *  used as a CSS selector. */
export function threadRowId(threadKey: string): string {
  return `wren-row-${threadKey}`
}

export const ThreadRow = memo(function ThreadRow({
  thread,
  account,
  selected,
  checked,
  showAccount,
  selfEmails,
  ticking = false,
  onSelect,
  onAction,
  onLater,
  onCheck,
  showWake = false,
}: ThreadRowProps) {
  // The row owns its own clock. Held by the list, the minute tick re-rendered
  // every row in the viewport; here it re-renders only the timestamps.
  const now = useNow()
  const people = correspondents(thread.participants, selfEmails)
  const sender = participantLine(people)
  const lead = people[0] ?? { email: sender }
  const wake = showWake ? (thread.deferredUntil ?? null) : null
  const act = useCallback((type: MailActionType) => onAction(thread, type), [onAction, thread])
  const later = useCallback(() => onLater(thread), [onLater, thread])

  return (
    <div
      role="option"
      id={threadRowId(thread.key)}
      aria-selected={selected}
      data-thread-key={thread.key}
      data-unread={thread.unread || undefined}
      onClick={(event) => onSelect(thread, event.shiftKey)}
      // The exit is transform and opacity only, and it starts 120 ms after the
      // tick so the check is legible before the row leaves. Rows below settle
      // through the virtualizer's own translateY — never an animated height.
      style={
        ticking
          ? {
              animation:
                'wren-row-out var(--wren-dur-base) var(--wren-ease-in) var(--wren-dur-fast) both',
            }
          : undefined
      }
      className={cn(
        // The inset rounded row — AMIE-STUDY §5. Every row is its own rect
        // with a 4 px gap, and hover and selection fill THAT rect, so
        // selection finally has a shape instead of a full-bleed band. The
        // pitch is still --wren-row-h; only the visible rect is inset, so the
        // virtualizer's measurements are untouched. `px-2` inside an 8 px
        // inset puts the content back on the same x it always started at.
        'group relative flex h-[calc(var(--wren-row-h)-var(--wren-row-gap))] w-[calc(100%-2*var(--wren-row-inset-x))]',
        'mx-(--wren-row-inset-x) cursor-default items-center gap-3 rounded-row px-2',
        'transition-colors duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        // `bg-fill-selected` carries its own certified tier (index.css): the
        // row paints the accent wash, and the tiers standing on it were
        // certified against `surface`, not against the wash. In dark the date
        // and the preview measured 4.28 on it — the row the reader is
        // currently on was the least readable row in the list (issue #26).
        selected
          ? 'bg-fill-selected group-focus-visible/listbox:ring-3 group-focus-visible/listbox:ring-ring group-focus-visible/listbox:ring-inset'
          : checked
            ? 'bg-fill-selected'
            : 'hover:bg-fill-hover',
        ticking && 'pointer-events-none',
      )}
    >
      <span className="flex w-3 shrink-0 justify-center">
        {thread.unread && !ticking && (
          <>
            <span className="bg-brand size-1.5 rounded-full" aria-hidden />
            <span className="sr-only">Unread</span>
          </>
        )}
      </span>

      {/* The avatar is also the mouse's checkbox, the way Gmail's is: a
          click on it checks the thread instead of opening it. Not a button —
          ARIA forbids focusable content inside an option — the keyboard's way
          in is `x`, printed in the sheet. */}
      {ticking ? (
        <ArchiveTick />
      ) : (
        <span
          className="inline-flex shrink-0"
          onClick={(event) => {
            event.stopPropagation()
            onCheck(thread)
          }}
        >
          {checked ? (
            <CheckedChip />
          ) : (
            <AccountAvatar
              address={lead}
              hue={hueFor(lead.email)}
              ringHue={showAccount && account ? hueFor(account.email) : undefined}
            />
          )}
        </span>
      )}
      {checked && <span className="sr-only">Selected for a batch</span>}
      {showAccount && account && <span className="sr-only">{account.email}</span>}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          {/* The fixed 152 px column. The count rides inside it, next to the
              name, so it never floats in the gap before the timestamp. */}
          <span className="flex w-(--wren-list-sender-w) shrink-0 items-baseline gap-2">
            <span
              // Weight, not colour — DIRECTION §1: "Unread is a dot and a
              // weight change." The read state used to drop the sender to the
              // meta tier as well, which put the name at 6.84 above a subject
              // at 17.87 on the same row: the name read as failed to load while
              // the subject beneath it was at full strength, and the row's own
              // hierarchy was inverted on read mail, which is most of a mailbox
              // (issue #34). The subject already changed weight alone; the
              // sender now does the same, so the two lines recede together.
              className={cn(
                'font-ui text-ink min-w-0 truncate text-base',
                thread.unread ? 'font-semibold' : 'font-medium',
              )}
            >
              {sender}
            </span>
            {thread.messageCount > 1 && (
              <span className={META_TEXT}>
                {thread.messageCount}
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1" />
          {/* Fixed width, right-aligned. "02:30", "Sat" and "Yesterday" are
              three different widths; a shrink-to-fit column would leave the
              left edge of the timestamps ragged down the list, which is the
              one thing DIRECTION §1 says a column may never do. 64 px holds
              the longest value. */}
          {/* In the Later list this is when the thread comes back, not when it
              arrived — and it says so to a screen reader, which reads the row
              as one run of text and would otherwise hear two dates with nothing
              between them. `wakeStamp` answers with what the group header does
              not already say. */}
          <time className={DATE_COLUMN} title={wake === null ? undefined : wakeTime(wake, now)}>
            {wake === null ? (
              relativeTime(thread.lastMessageAt, now)
            ) : (
              <>
                <span className="sr-only">Back </span>
                {wakeStamp(wake, now)}
              </>
            )}
          </time>
        </div>

        {/* The hover cluster's lane — issue #32. The cluster is opaque and
            absolutely positioned over this line's right end, so hovering "Bike
            service — ready Thursday" hid "Thursday" and the whole preview
            behind it: the row's own text, covered by a control that was
            summoned by pointing at it.

            The line now reserves the lane while the cluster is there, off the
            same `--wren-row-cluster-w` the cluster is sized by, so the lane
            cannot be narrower than the thing it is holding room for. Reserved
            only on hover, because reserving it at rest would spend 160 px of
            every row in the list on a state that is true for one row at a time.

            The padding SNAPS. It is layout, and animating it re-flows and
            re-truncates the subject and the snippet on every frame of the
            cluster's fade — the text visibly crawling left under a control
            that is only crossfading in. The cluster keeps its own transition;
            the lane is simply there before it is. */}
        <div className="flex items-baseline gap-2 leading-5 group-hover:pr-(--wren-row-cluster-w)">
          <span
            className={cn(
              'truncate text-sm leading-5',
              thread.unread ? 'text-ink font-medium' : 'text-ink font-normal',
            )}
          >
            {thread.subject || '(no subject)'}
          </span>
          {/* Below `--container-row` (380 px of list) the snippet degrades to
              one or two characters and an ellipsis, which is noise, not
              preview. It is dropped outright at that width and the row falls
              back to sender plus subject. */}
          <span className="text-ink-3 hidden min-w-0 flex-1 truncate text-sm leading-5 @min-row:block">
            {thread.snippet}
          </span>
          <span className="min-w-0 flex-1 @min-row:hidden" />
          {/* Both are state, not controls. ARIA forbids focusable content
              inside a `role="option"`, and a screen reader flattens an option
              to its text label anyway, so the star used to be announced
              inconsistently or not at all (UI-REVIEW-2026-08-28 B3). It is now
              a glyph plus an sr-only word; `S`, the hover cluster and the
              reading toolbar all still toggle it. */}
          <span className="flex shrink-0 items-center gap-2">
            {thread.starred && (
              <span className="text-star inline-flex">
                <Icon name="star" size={16} filled />
                <span className="sr-only">Starred</span>
              </span>
            )}
            {thread.hasAttachments && (
              <span className="inline-flex">
                <Icon name="attachment" size={16} className="text-ink-3" />
                <span className="sr-only">Has attachments</span>
              </span>
            )}
          </span>
        </div>
      </div>

      {!ticking && <QuickActions thread={thread} onAction={act} onLater={later} />}
    </div>
  )
})

/** The checked state, in the avatar's slot and geometry: one shape changing,
 *  exactly like the archive tick, but in the brand colour and with no pop —
 *  checking is an intent, not a completion. */
function CheckedChip() {
  return (
    <span aria-hidden className={cn(AVATAR_CHIP, 'bg-brand text-primary-foreground')}>
      <Icon name="check" size={16} />
    </span>
  )
}

/**
 * The archive celebration, and the whole of it — AMIE-STUDY §7(c).1.
 *
 * The avatar becomes a green disc carrying a check and runs one pop. **No
 * particles.** Archive fires forty times a day; a burst would be wallpaper
 * within an hour, and Amie's own most-repeated action is a single pop. The
 * budget is spent on inbox zero instead, which happens once.
 *
 * 320 ms rather than the study's 260: it keeps the pop on DIRECTION §9's three
 * durations, and it makes the pop and the row's exit land on the same frame.
 * The check is `--wren-hue-fg`, not white — white measures 2.90:1 on the green
 * solid, under the 3.0 a non-text glyph needs (tokens.css §4).
 */
function ArchiveTick() {
  return (
    <span
      aria-hidden
      style={{
        // The one fixed hue in the app, read through the hue authority rather
        // than typed as a var() by hand.
        backgroundColor: hueSolid('green'),
        animation: 'wren-confirm-pop var(--wren-dur-slow) var(--wren-ease-spring) both',
      }}
      // The avatar's own geometry: the tick replaces it mid-row, so the two
      // are one shape changing rather than two shapes swapping.
      className={cn(AVATAR_CHIP, 'text-hue-fg')}
    >
      <Icon name="check" size={16} />
    </span>
  )
}

/**
 * The row's mouse convenience: four actions revealed on hover, opaque so they
 * never sit as glass over text.
 *
 * It owns **no tab stops**. Every rendered row used to mount four `opacity-0`
 * buttons that were fully in the tab order, which put 79 invisible stops
 * between the list header and the reading pane and made the standard non-mouse
 * path through the app's primary surface unusable (UI-REVIEW-2026-08-28 B1).
 * The four actions all have keyboard equivalents — `e`, `#`, `s`, `u` — printed
 * in the "?" sheet, so the cluster is `tabIndex={-1}` throughout and
 * `aria-hidden` outright: the listbox is the single stop, and an option
 * announces as its text rather than as its text plus four button labels (B3).
 *
 * There is no `@media (hover: hover)` gate here, and that is a decision rather
 * than an omission (N11): Maru is a desktop-only Tauri target with no touch
 * input, so a hover-revealed affordance has no sticky-hover case to answer for.
 * Recorded so it is not rediscovered as a defect.
 *
 * **It is not shown at all below a list width of 380 px** (issue 39), and that
 * is a hit-target rule rather than a cosmetic one. The cluster is five 32 px
 * buttons anchored 12 px off the row's trailing edge, so it starts 172 px in
 * from that edge; once the row is narrower than 344 px the strip has reached
 * the row's own midpoint, and a click aimed at the subject fires Archive
 * instead of opening the thread. Measured: at an 800 px window the row is
 * 334 px and `elementFromPoint` at its centre is a button; at 820 px it is
 * 354 px and the centre is the row.
 *
 * The threshold is the container query the snippet already uses —
 * `--container-row` in src/index.css, 380 px of
 * *list*, which is a 364 px row and leaves 10 px between the strip and the
 * centre. One breakpoint rather than two: below it the row drops the snippet
 * and the mouse's shortcut together, and falls back to sender plus subject
 * with nothing over it. The keyboard equivalents (`e`, `h`, `#`, `u`, `s`) are
 * unaffected at every width, which is what makes hiding the strip acceptable
 * rather than a loss of function.
 *
 * It sits on the row's *second* line. Centred, it covered the timestamp
 * column exactly (S2) — the row's right-hand anchor, hidden precisely when the
 * cursor is on the row being read. There is no room in a 400 px pane to reserve
 * 130 px of gutter, so the cluster moved down instead of the content moving
 * over: nothing reflows, nothing animates but opacity and a 4 px slide, and the
 * time stays visible.
 *
 * The five buttons are bare, styled by `iconButtonClass` rather than rendered
 * as <IconButton>. IconButton brings a tooltip, and a tooltip inside an
 * `aria-hidden` cluster can never be read out or focused — so twenty-eight
 * visible rows were mounting ~140 tooltip roots, each with its own positioning
 * subscription, to describe buttons no assistive technology can reach.
 *
 * They do each carry a name now (issue 6), and exactly one way of carrying it:
 * `title`, from the same descriptor string the reading toolbar and the palette
 * use, so a mouse hovering an unfamiliar glyph is told what it does without
 * mounting a single tooltip root. There is no `aria-label` beside it — inside
 * an `aria-hidden` cluster it names nothing that can be reached, and a second
 * copy of the string that no one ever reads is a place for the two to drift
 * apart. The mouse gets the name; the keyboard gets the shortcut.
 *
 * The cluster stays `aria-hidden`, and that is the decision the names sit
 * inside rather than one they overturn. `role="option"` is children-presentational
 * in ARIA: a descendant of an option is never exposed as a control, and the
 * only thing dropping `aria-hidden` would change is that all five labels would
 * be appended to every row's spoken name — "…draft agenda, Archive, Save for
 * later, Move to trash, Mark as read, Star", twenty-eight times down a
 * viewport. That is UI-REVIEW-2026-08-28 B3, and it is a worse row than an
 * unnamed button in a cluster no screen reader can reach. The keyboard
 * equivalents — `e`, `h`, `#`, `u`, `s` — are the accessible path, and they are
 * printed in the "?" sheet.
 */
function QuickActions({
  thread,
  onAction,
  onLater,
}: {
  thread: Thread
  onAction: (type: MailActionType) => void
  onLater: () => void
}) {
  const actions = threadActions(thread)
  // The star's press pop — MAGIC §3.4. Counting presses rather than holding a
  // boolean: the key remounts the span, which is what makes the CSS animation
  // run a second time. Zero means "not pressed yet", so a starred row that
  // scrolls into view does not pop.
  const [presses, setPresses] = useState(0)
  return (
    <div
      aria-hidden
      className={cn(
        // The width is the token, not the sum of what happens to be inside:
        // the lane the row's second line gives up is the same number, and a
        // sixth action would otherwise widen the cluster without widening the
        // lane and put us back under issue #32.
        'bg-raised absolute right-3 bottom-1 w-(--wren-row-cluster-w) items-center justify-center overflow-hidden rounded-md shadow-md',
        // Below `--container-row` the cluster is not shown at all — see the
        // note above. `hidden` rather than `pointer-events-none`, because a
        // strip a click passes through is still a strip sitting on the words
        // (issue 39).
        'hidden @min-row:flex',
        'transition-[opacity,transform] duration-(--wren-dur-fast) ease-(--wren-ease-out)',
        // The 4 px slide is what makes the cluster read as arriving rather
        // than switching on. Reduced motion drops the offset, so there is no
        // transform left to animate and only the opacity crossfades.
        'opacity-0 motion-safe:translate-x-1',
        'pointer-events-none group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {THREAD_ACTION_ORDER.map((id) => {
        const spec = actions[id]
        return (
          <button
            key={spec.id}
            type="button"
            tabIndex={-1}
            title={spec.label}
            disabled={spec.disabled}
            onClick={() => {
              if (spec.pop) setPresses((n) => n + 1)
              // The `kind` tag, doing its job: the compiler will not let this
              // surface send Later through the label-action path.
              if (spec.kind === 'later') onLater()
              else onAction(spec.type)
            }}
            className={iconButtonClass(spec.tone)}
          >
            <span
              key={spec.pop ? presses : 0}
              className="inline-flex"
              data-wren-pop={spec.pop && presses > 0 ? '' : undefined}
            >
              <Icon name={spec.icon} size={16} filled={spec.filled} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
