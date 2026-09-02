import { describe, expect, it } from 'vitest'

import type { Account, Label, MailView } from '@/core/types'
import { viewKey } from '@/features/mail/ui-store'
import { labelMailboxes, mailboxSections, mailboxTitle } from '@/mobile/mailboxes'

const ACCOUNTS: Account[] = [
  { id: 'demo-personal', email: 'nick@gmail.com', displayName: 'Personal', color: '#000', addedAt: 0 },
  { id: 'demo-work', email: 'nick.galang@gmail.com', displayName: 'Work', color: '#111', addedAt: 0 },
]

const LABELS: Label[] = [
  { id: 'INBOX', accountId: 'demo-personal', name: 'INBOX', type: 'system' },
  { id: 'Label_travel', accountId: 'demo-personal', name: 'Travel', type: 'user' },
  { id: 'Label_receipts', accountId: 'demo-personal', name: 'Receipts', type: 'user' },
]

describe('mobile mailboxes', () => {
  it('offers every inbox, then every other place mail can be', () => {
    const [inboxes, others] = mailboxSections(ACCOUNTS)
    expect(inboxes.mailboxes.map((box) => box.name)).toEqual(['All inboxes', 'Personal', 'Work'])
    // The FOLDERS order, minus the inbox that leads the section above, and
    // Later last — below the folder table, exactly where the sidebar puts it,
    // because Later is not a Gmail system label.
    expect(others.mailboxes.map((box) => box.name)).toEqual(['Starred', 'Sent', 'Trash', 'Later'])
  })

  it('keys every row on the desktop view key', () => {
    for (const section of mailboxSections(ACCOUNTS)) {
      for (const box of section.mailboxes) {
        expect(box.key).toBe(viewKey(box.view))
      }
    }
    // Which is what makes the checkmark work: the picker compares this key
    // against the view the list is showing.
    const personal: MailView = { kind: 'account', accountId: 'demo-personal', labelId: 'INBOX' }
    const [inboxes] = mailboxSections(ACCOUNTS)
    expect(inboxes.mailboxes[1].key).toBe(viewKey(personal))
  })

  it('lists a user label per row and no system label', () => {
    const boxes = labelMailboxes('demo-personal', LABELS)
    expect(boxes.map((box) => box.name)).toEqual(['Travel', 'Receipts'])
    expect(boxes[0].view).toEqual({
      kind: 'account',
      accountId: 'demo-personal',
      labelId: 'Label_travel',
    })
  })

  it('names the mailbox on screen the way the desktop list header does', () => {
    expect(mailboxTitle({ kind: 'later' }, ACCOUNTS)).toBe('Later')
    expect(mailboxTitle({ kind: 'unified', folder: 'inbox' }, ACCOUNTS)).toBe('All inboxes')
    expect(mailboxTitle({ kind: 'unified', folder: 'sent' }, ACCOUNTS)).toBe('Sent')
    expect(
      mailboxTitle({ kind: 'account', accountId: 'demo-work', labelId: 'INBOX' }, ACCOUNTS),
    ).toBe('Work')
    expect(
      mailboxTitle(
        { kind: 'account', accountId: 'demo-personal', labelId: 'Label_travel' },
        ACCOUNTS,
        'Travel',
      ),
    ).toBe('Travel')
  })

  it('falls back rather than drawing an empty title while a label loads', () => {
    // The labels query is per account and arrives after the first frame.
    expect(
      mailboxTitle({ kind: 'account', accountId: 'demo-personal', labelId: 'Label_travel' }, ACCOUNTS),
    ).toBe('Label')
  })
})
