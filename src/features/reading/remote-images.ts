// Whether a conversation's remote images may be fetched, and what the notice
// says when they were not.
//
// Both shells ask the same question of the same two facts, and both used to
// answer it in their own words. The predicate is one function so the
// fail-closed reading below cannot be softened in one place and not the other,
// and the notice is one table so the sentence cannot drift between a phone and
// a desktop looking at the same message.

import type { Settings } from '@/core/types'

/**
 * The effective decision for one thread: the setting, OR the per-thread
 * override. The direction is the contract — the Set can only OPEN what the
 * setting closed, never close what the setting opened.
 *
 * `?? 'block'` is deliberately fail-closed and is NOT a second copy of the
 * default: it answers "may I fetch, not yet knowing what was chosen?", and the
 * answer to that is a policy independent of whatever defaults.ts says. The
 * settings query is mounted from app start, so the window is narrow — but
 * narrow is not never, and being wrong this way costs one banner frame and one
 * extra sanitize pass, while being wrong the other way fetches remote images
 * for someone who chose to block them, once, unrecoverably.
 */
export function showRemoteImages(
  threadKey: string,
  settings: Settings | undefined,
  imagesAllowed: ReadonlySet<string>,
): boolean {
  return (settings?.imagePolicy ?? 'block') === 'allow' || imagesAllowed.has(threadKey)
}

/**
 * What the notice over a stripped message says.
 *
 * `why` is the whole point of the row and the reason it is not a silent
 * omission: a remote image is a read receipt nobody asked for. The two shells
 * set it differently — a dimmed run after a middle dot on the desktop, a
 * `<small>` on the phone — but they say it in the same words.
 */
export const BLOCKED_IMAGES = {
  notice: 'Remote images blocked',
  why: 'they can tell the sender you opened this',
  action: 'Show',
} as const
