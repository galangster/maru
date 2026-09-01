// What you can do to a thread, described once.
//
// Four surfaces offer the same set of actions — the row's hover cluster, the
// reading pane's toolbar, the command palette and the keymap — and each used
// to decide for itself whether `#` means trash or untrash, whether the star
// glyph is filled, and what the button should be called. They disagreed: the
// palette's trash row carried no shortcut hint, and the row's archive button
// was the only one that knew archiving a trashed thread does nothing.
//
// The descriptor answers all of that from the thread. Surfaces still choose
// their own order, because the reading toolbar's is not the row's.
//
// Four of the five are label actions; Later is not, and `kind` is what says so
// out loud rather than leaving each surface to remember it.

import type { Tone } from '@/components/wren-controls'
import type { IconName } from '@/components/ui/icon'
import { isDeferred } from '@/core/defaults'
import type { MailActionType, Thread } from '@/core/types'

export type ThreadActionId = 'archive' | 'later' | 'trash' | 'read' | 'star'

/** What every action carries, whatever kind it is. */
interface ThreadActionBase {
  id: ThreadActionId
  label: string
  icon: IconName
  tone: Exclude<Tone, 'brand'>
  /** Draw the glyph filled — the star, when it is on. */
  filled: boolean
  /** Give the glyph its 200 ms press pop. Reserved for the star. */
  pop: boolean
  /** The key that does the same thing, for a hint. */
  hint: string
  disabled: boolean
}

/**
 * The four label actions. `type` is what goes to `performAction`, already
 * resolved against the thread.
 */
export interface MailThreadAction extends ThreadActionBase {
  kind: 'mail'
  type: MailActionType
}

/**
 * Later — and the discriminator exists because it is NOT a label action.
 *
 * A `type` here would have to be a `MailActionType`, and there is no honest one:
 * `labelDelta('later')` returning an empty delta asserts "this action changes no
 * labels", when the truth is "this is not a label action". The `kind` tag is
 * what lets one table and one order serve all four surfaces while the compiler
 * forces each of them to say what it does with a Later.
 */
export interface LaterThreadAction extends ThreadActionBase {
  kind: 'later'
}

export type ThreadActionSpec = MailThreadAction | LaterThreadAction

/**
 * Every action, indexed so that a surface asking for `.trash` gets a spec it can
 * read `.type` off without a narrow, and a surface iterating the ORDER has to
 * handle both kinds.
 */
export interface ThreadActionSpecs {
  archive: MailThreadAction
  later: LaterThreadAction
  trash: MailThreadAction
  read: MailThreadAction
  star: MailThreadAction
}

/** The order the thread row and the palette use. The two get-it-out-of-my-inbox
 *  verbs are adjacent, because they answer the same question — "not now" and
 *  "not ever" — and the hand should not have to travel between them. */
export const THREAD_ACTION_ORDER: ThreadActionId[] = ['archive', 'later', 'trash', 'read', 'star']

/** The subset of a Thread the descriptor reads. */
export type ThreadActionSource = Pick<Thread, 'labelIds' | 'unread' | 'starred' | 'deferredUntil'>

export function threadActions(thread: ThreadActionSource, now: number = Date.now()): ThreadActionSpecs {
  const inTrash = thread.labelIds.includes('TRASH')
  const deferred = isDeferred(thread, now)
  return {
    archive: {
      id: 'archive',
      kind: 'mail',
      type: 'archive',
      label: 'Archive',
      icon: 'archive',
      tone: 'success',
      filled: false,
      pop: false,
      hint: 'E',
      // Archiving something already out of the inbox is a no-op with a toast.
      disabled: inTrash,
    },
    later: {
      id: 'later',
      kind: 'later',
      // Deferring an already-deferred thread is a re-schedule, and the label
      // says so rather than pretending the first choice never happened.
      label: deferred ? 'Change when it comes back' : 'Save for later',
      // `calendar`, because the icon set has no clock and adding one needs an
      // Anron path pulled from Figma. A one-line swap, not a blocker.
      icon: 'calendar',
      tone: 'info',
      filled: false,
      pop: false,
      hint: 'H',
      // A thread that is out of the inbox has nothing to come back TO. Later
      // hides a thread from the inbox; on a trashed thread it would be a
      // control that silently does nothing.
      disabled: inTrash || !thread.labelIds.includes('INBOX'),
    },
    trash: {
      id: 'trash',
      kind: 'mail',
      type: inTrash ? 'untrash' : 'trash',
      label: inTrash ? 'Restore from trash' : 'Move to trash',
      icon: 'trash',
      tone: 'danger',
      filled: false,
      pop: false,
      hint: '#',
      disabled: false,
    },
    read: {
      id: 'read',
      kind: 'mail',
      type: thread.unread ? 'markRead' : 'markUnread',
      label: thread.unread ? 'Mark as read' : 'Mark as unread',
      icon: thread.unread ? 'read' : 'unread',
      tone: 'info',
      filled: false,
      pop: false,
      hint: 'U',
      disabled: false,
    },
    star: {
      id: 'star',
      kind: 'mail',
      type: thread.starred ? 'unstar' : 'star',
      label: thread.starred ? 'Unstar' : 'Star',
      icon: 'star',
      tone: thread.starred ? 'star' : 'starHover',
      filled: thread.starred,
      pop: true,
      hint: 'S',
      disabled: false,
    },
  }
}
