import { describe, expect, it } from 'vitest'

import type { Account, Label, MailView } from '@/core/types'
import { mailboxTitle } from '@/features/mail/mailbox-title'
import { viewKey } from '@/features/mail/ui-store'
import { labelMailboxes, mailboxIcon, mailboxSections, mobileMailboxTitle } from '@/mobile/mailboxes'

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

  it('lists one row per label, addressed at that account', () => {
    // The system labels are already gone: `useUserLabels` drops them once, for
    // every label surface, and this takes what it is given.
    const boxes = labelMailboxes('demo-personal', LABELS.filter((label) => label.type === 'user'))
    expect(boxes.map((box) => box.name)).toEqual(['Travel', 'Receipts'])
    expect(boxes[0].view).toEqual({
      kind: 'account',
      accountId: 'demo-personal',
      labelId: 'Label_travel',
    })
  })

  it('draws a mailbox with the same glyph wherever it is drawn', () => {
    // The picker row and that mailbox's own empty state ask the same function,
    // so a mailbox cannot look like two different things.
    expect(mailboxIcon({ kind: 'later' })).toBe('calendar')
    expect(mailboxIcon({ kind: 'unified', folder: 'trash' })).toBe('trash')
    expect(mailboxIcon({ kind: 'account', accountId: 'demo-personal', labelId: 'INBOX' })).toBe('inbox')
    expect(mailboxIcon({ kind: 'account', accountId: 'demo-personal', labelId: 'Label_travel' })).toBe('listBullet')
    for (const section of mailboxSections(ACCOUNTS)) {
      for (const box of section.mailboxes) expect(box.icon).toBe(mailboxIcon(box.view))
    }
  })

  it('names the mailbox on screen the way the desktop list header does', () => {
    expect(mobileMailboxTitle({ kind: 'later' }, ACCOUNTS)).toBe('Later')
    expect(mobileMailboxTitle({ kind: 'unified', folder: 'inbox' }, ACCOUNTS)).toBe('All inboxes')
    expect(mobileMailboxTitle({ kind: 'unified', folder: 'sent' }, ACCOUNTS)).toBe('Sent')
    expect(
      mobileMailboxTitle({ kind: 'account', accountId: 'demo-work', labelId: 'INBOX' }, ACCOUNTS),
    ).toBe('Work')
    expect(
      mobileMailboxTitle(
        { kind: 'account', accountId: 'demo-personal', labelId: 'Label_travel' },
        ACCOUNTS,
        'Travel',
      ),
    ).toBe('Travel')
  })

  it('keeps the desktop\'s own word for the unified inbox', () => {
    // The one cell the two shells disagree on. The desktop sits beside a
    // sidebar row that says Inbox; the phone's picker lists it above Personal
    // and Work, where Inbox would read as a fourth account.
    expect(mailboxTitle({ kind: 'unified', folder: 'inbox' }, ACCOUNTS)).toBe('Inbox')
    expect(mobileMailboxTitle({ kind: 'unified', folder: 'inbox' }, ACCOUNTS)).toBe('All inboxes')
    // And one account's inbox is that account, on both. It used to be titled
    // from the label lookup on the desktop, and a Gmail system label's name is
    // its id, so that header read INBOX in capitals.
    expect(
      mailboxTitle({ kind: 'account', accountId: 'demo-work', labelId: 'INBOX' }, ACCOUNTS),
    ).toBe('Work')
  })

  it('falls back rather than drawing an empty title while a label loads', () => {
    // The labels query is per account and arrives after the first frame.
    expect(
      mobileMailboxTitle({ kind: 'account', accountId: 'demo-personal', labelId: 'Label_travel' }, ACCOUNTS),
    ).toBe('Label')
  })
})
