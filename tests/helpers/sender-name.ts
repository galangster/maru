// The `setSenderName` contract, asserted once for both services.
//
// Real and demo mode normalize through the same `senderNameFrom`, so trim,
// clear and no-op are one behaviour rather than two — and two copies of these
// expectations drifted the moment one of them grew a case. Each suite still
// owns what is genuinely its own: the Gmail prefill on one side, the demo's
// seeded names and the From-header fallback on the other.

import { expect } from 'vitest'

import type { MailEvent, MailService } from '../../src/core/types'

/**
 * Run the shared expectations against a live service, then put the account
 * back the way it was found so the caller can keep using it.
 *
 * `events` is the caller's own event log; only `accountsChanged` is counted,
 * and only the deltas across each step, so a service that emits other things
 * meanwhile is unaffected.
 */
export async function expectSenderNameContract(
  svc: MailService,
  events: MailEvent[],
  accountId: string,
): Promise<void> {
  const announced = () => events.filter((e) => e.type === 'accountsChanged').length
  const read = async () => {
    const account = (await svc.listAccounts()).find((a) => a.id === accountId)
    expect(account, `account ${accountId}`).toBeDefined()
    return account!
  }

  const before = await read()

  // Trimmed on the way in, and the change is announced once.
  let count = announced()
  await svc.setSenderName(accountId, '  Nicholas Galang  ')
  const named = await read()
  expect(named.senderName).toBe('Nicholas Galang')
  // The label is a different field and this edit never touches it.
  expect(named.displayName).toBe(before.displayName)
  expect(announced()).toBe(count + 1)

  // The same name again is not a change, so nothing is said.
  count = announced()
  await svc.setSenderName(accountId, 'Nicholas Galang')
  expect(announced()).toBe(count)

  // Empty CLEARS rather than storing a blank: `senderName` is optional, and
  // every downstream fallback tests the field and not its length.
  count = announced()
  await svc.setSenderName(accountId, '   ')
  expect((await read()).senderName).toBeUndefined()
  expect(announced()).toBe(count + 1)

  count = announced()
  await svc.setSenderName(accountId, '')
  expect(announced()).toBe(count)

  await expect(svc.setSenderName('no-such-account', 'Someone')).rejects.toThrow(/No such account/)

  await svc.setSenderName(accountId, before.senderName ?? '')
  expect((await read()).senderName).toBe(before.senderName)
}
