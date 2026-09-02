import { BottomSheet } from '../components/bottom-sheet'

/**
 * The one offer a phone with mail and no Maru account gets.
 *
 * It says what the account buys rather than what the account is, because the
 * person reading it has just signed in to Gmail and reasonably believes they
 * are finished.
 */
export function PushAccountSheet({ onClose, onAccount }: { onClose: () => void; onAccount: () => void }) {
  return (
    <BottomSheet title="New-mail alerts" onClose={onClose}>
      <p className="mobile-offer-copy">
        Want new-mail alerts on this iPhone? Sign in to your Maru account.
      </p>
      <div className="mobile-offer-actions">
        <button type="button" className="mobile-button-primary mobile-press" onClick={onAccount}>
          Sign in to Maru
        </button>
        <button type="button" className="mobile-button-secondary mobile-offer-secondary mobile-press" onClick={onClose}>
          Not now
        </button>
      </div>
    </BottomSheet>
  )
}
