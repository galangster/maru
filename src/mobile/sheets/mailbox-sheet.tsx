import type { Account, MailView } from '@/core/types'
import { useLabels } from '@/features/mail/queries'
import { viewKey } from '@/features/mail/ui-store'
import { BottomSheet } from '../components/bottom-sheet'
import { MobileIcon } from '../components/mobile-icon'
import { labelMailboxes, mailboxSections, type MobileMailbox } from '../mailboxes'

/**
 * Every place mail can be, behind the inbox title.
 *
 * A picker rather than a fourth tab. A tab bar holds peer destinations, and
 * Mailboxes is not Inbox's peer — it CONTAINS the inbox, so a flat bar
 * offering both inverts the hierarchy it is meant to express. It also keeps
 * the native bar at the three items the Swift side is handed, which is the
 * other half of the same argument: the bar is the app's top level, and this
 * is a way of looking at one of its screens.
 */
export function MailboxSheet({
  accounts,
  current,
  onClose,
  onPick,
}: {
  accounts: Account[]
  current: MailView
  onClose: () => void
  onPick: (view: MailView) => void
}) {
  const currentKey = viewKey(current)
  return (
    <BottomSheet title="Mailboxes" onClose={onClose}>
      {mailboxSections(accounts).map((section) => (
        <MailboxGroup
          key={section.title}
          title={section.title}
          mailboxes={section.mailboxes}
          currentKey={currentKey}
          onPick={onPick}
        />
      ))}
      {accounts.map((account) => (
        <AccountLabels key={account.id} account={account} currentKey={currentKey} onPick={onPick} />
      ))}
    </BottomSheet>
  )
}

/**
 * One account's labels. A component rather than a branch, because labels are
 * one query per account and a hook cannot be called in a loop over a list that
 * grows when an account is added.
 */
function AccountLabels({
  account,
  currentKey,
  onPick,
}: {
  account: Account
  currentKey: string
  onPick: (view: MailView) => void
}) {
  const labels = useLabels(account.id)
  const mailboxes = labelMailboxes(account.id, labels.data ?? [])
  if (mailboxes.length === 0) return null
  return (
    <MailboxGroup
      title={`${account.displayName} labels`}
      mailboxes={mailboxes}
      currentKey={currentKey}
      onPick={onPick}
    />
  )
}

function MailboxGroup({
  title,
  mailboxes,
  currentKey,
  onPick,
}: {
  title: string
  mailboxes: MobileMailbox[]
  currentKey: string
  onPick: (view: MailView) => void
}) {
  return (
    <section className="mobile-sheet-group" aria-label={title}>
      <h3>{title}</h3>
      <div className="mobile-action-list">
        {mailboxes.map((item) => {
          const current = item.key === currentKey
          return (
            <button
              key={item.key}
              type="button"
              className={current ? 'is-current' : ''}
              aria-current={current ? 'true' : undefined}
              onClick={() => onPick(item.view)}
            >
              <span className="mobile-sheet-icon"><MobileIcon name={item.icon} scale="action" /></span>
              <span>{item.name}</span>
              {current && <MobileIcon name="check" scale="action" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}
