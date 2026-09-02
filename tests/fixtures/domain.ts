// Domain-object builders for store, sync and service tests.

import type {
  LocalCredential,
  VaultDeferral,
  VaultDocument,
  VaultLocal,
} from '../../src/core/account/vault'
import type { Account, Label, Message, Settings, Thread } from '../../src/core/types'
import { threadKey } from '../../src/core/types'

export function makeAccount(patch: Partial<Account> = {}): Account {
  return {
    id: 'acct-1',
    email: 'nick@gmail.com',
    // The label and the sender's name, which are two different things — issue
    // #61. The fixture carries both so a test that reaches for one cannot
    // silently get the other.
    displayName: 'Personal',
    senderName: 'Nick Galang',
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

// -- the Maru vault -----------------------------------------------------------

/**
 * The settings every vault suite starts from. Deliberately without the
 * bring-your-own Google client fields: a suite that needs them adds them, and
 * the ones that do not get to assert "nothing was written" without listing
 * five values a third time.
 */
export const settings: Settings = {
  theme: 'dark',
  imagePolicy: 'allow',
  pollIntervalSec: 60,
  sounds: false,
  conversationOrder: 'chronological',
}

/** A valid v1 vault document, for the field the test is actually about. */
export function vaultDocument(patch: Partial<VaultDocument> = {}): VaultDocument {
  return {
    v: 1,
    updatedAt: 1_800_000_000_000,
    settings,
    accounts: [{ email: 'nick@gmail.com', label: 'Personal' }],
    credentials: { desktop: {}, ios: {} },
    ...patch,
  }
}

/**
 * A whole `VaultLocal` in memory, with the counters the apply tests assert on.
 *
 * A base class rather than three near-identical fakes: every one of them grew
 * the same eight pass-through methods, and a fake that drifts from the port it
 * stands in for tests nothing. A suite subclasses it and overrides only the
 * state it cares about — deferrals, a seeded account, a different clock.
 */
export class FakeVaultLocal implements VaultLocal {
  settings: Settings = { ...settings }
  accounts: Account[] = []
  credentials = new Map<string, LocalCredential>()
  consent: string[] = []
  settingsWrites = 0
  credentialWrites = 0
  refreshes = 0
  getSettings = async () => ({ ...this.settings })
  setSettings = async (patch: Partial<Settings>) => {
    this.settingsWrites += 1
    this.settings = { ...this.settings, ...patch }
  }
  listAccounts = async () => [...this.accounts]
  // Replace-or-append, like the store's own upsert. Appending blindly made an
  // in-place update — a sender name filled in by a pull — look like a second
  // account with the same address.
  upsertAccount = async (account: Account) => {
    const at = this.accounts.findIndex((item) => item.id === account.id)
    if (at === -1) this.accounts.push(account)
    else this.accounts[at] = account
  }
  removeAccount = async (id: string) => { this.accounts = this.accounts.filter((a) => a.id !== id) }
  loadCredential = async (id: string) => this.credentials.get(id) ?? null
  saveCredential = async (id: string, credential: LocalCredential) => {
    this.credentialWrites += 1
    this.credentials.set(id, credential)
  }
  clearCredential = async (id: string) => { this.credentials.delete(id) }
  setDirectedConsent = (emails: string[]) => { this.consent = emails }
  newAccountId = () => `new-${this.accounts.length}`
  now = () => 100
  refreshAfterApply = async () => { this.refreshes += 1 }
}

/** The deferral half, for the suites that exercise Later across devices. */
export class FakeDeferralLocal extends FakeVaultLocal {
  deferrals: VaultDeferral[] = []
  applied: VaultDeferral[][] = []
  listDeferrals = async () => [...this.deferrals]
  applyDeferrals = async (entries: VaultDeferral[]) => {
    this.applied.push(entries)
    return entries.length
  }
}
