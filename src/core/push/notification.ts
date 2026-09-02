// What a person reads on the lock screen.
//
// The relay's push carries nothing at all (MARU-ACCOUNT.md §1: "Push is
// content-free"). Every word below is composed on the phone from mail this
// device fetched itself with its own Gmail token.

import type { PushNotification } from './types'

export interface ArrivalInput {
  /** Display name where Gmail gave one, otherwise the address. */
  from: string
  subject: string
  /** How many threads arrived in the pass this event closed. */
  threads: number
  threadKey?: string
}

/**
 * One notification for the whole arrival pass, so five messages landing
 * together are one line and not five. The sync engine already counts the pass;
 * this only words it.
 */
export function composeArrival(input: ArrivalInput): PushNotification {
  const lead = input.subject.trim() || '(no subject)'
  return {
    title: input.from.trim() || 'New message',
    body: input.threads > 1 ? `${lead} — and ${input.threads - 1} more` : lead,
    threadKey: input.threadKey,
  }
}
