// Domain-object builders for store, sync and service tests.

import type { Account, Label, Message, Thread } from '../../src/core/types'
import { threadKey } from '../../src/core/types'

export function makeAccount(patch: Partial<Account> = {}): Account {
  return {
    id: 'acct-1',
    email: 'nick@gmail.com',
    displayName: 'Personal',
    color: '#3b82f6',
    addedAt: 1_700_000_000_000,
    ...patch,
  }
}

export function makeThread(patch: Partial<Thread> & { accountId?: string; gmailThreadId?: string } = {}): Thread {
  const accountId = patch.accountId ?? 'acct-1'
  const gmailThreadId = patch.gmailThreadId ?? 't-1'
  return {
    key: threadKey(accountId, gmailThreadId),
    gmailThreadId,
    accountId,
    subject: 'Tuesday walkthrough',
    snippet: 'Thanks for the update',
    lastMessageAt: 1_755_000_000_000,
    participants: [{ name: 'Maya Ellison', email: 'maya@fernwood.dev' }],
    labelIds: ['INBOX'],
    unread: false,
    starred: false,
    messageCount: 1,
    hasAttachments: false,
    ...patch,
  }
}

export function makeMessage(patch: Partial<Message> & { accountId?: string; threadId?: string } = {}): Message {
  const accountId = patch.accountId ?? 'acct-1'
  const threadId = patch.threadId ?? 't-1'
  return {
    id: 'm-1',
    threadId,
    accountId,
    from: { name: 'Maya Ellison', email: 'maya@fernwood.dev' },
    to: [{ name: 'Nick Galang', email: 'nick@gmail.com' }],
    cc: [],
    bcc: [],
    replyTo: [],
    date: 1_755_000_000_000,
    subject: 'Tuesday walkthrough',
    snippet: 'Thanks for the update',
    bodyState: 'metadata',
    labelIds: ['INBOX'],
    attachments: [],
    unread: false,
    starred: false,
    ...patch,
  }
}

export function makeLabel(patch: Partial<Label> = {}): Label {
  return { id: 'INBOX', accountId: 'acct-1', name: 'INBOX', type: 'system', ...patch }
}
