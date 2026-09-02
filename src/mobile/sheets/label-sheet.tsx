import type { Thread } from '@/core/types'
import { useLabels, useModifyLabels, useThread } from '@/features/mail/queries'
import { BottomSheet } from '../components/bottom-sheet'
import { MobileIcon } from '../components/mobile-icon'

/**
 * The label picker behind `+ Label`, on the M9 seam the desktop's popover
 * uses — the same `modifyLabels` agents call, refreshed by the service's own
 * `threadsChanged` event rather than by a hand-written cache patch.
 *
 * The thread is re-read from the cache rather than trusted as handed in: this
 * sheet stays open across several toggles, and the captured thread would keep
 * drawing the checkmarks that were there when it opened.
 */
export function LabelSheet({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const detail = useThread(thread.key)
  const live = detail.data?.thread ?? thread
  const labels = useLabels(live.accountId)
  const modify = useModifyLabels()
  const userLabels = (labels.data ?? []).filter((label) => label.type === 'user')

  return (
    <BottomSheet title="Labels" onClose={onClose}>
      {userLabels.length === 0 ? (
        <p className="mobile-later-note">This account has no labels yet. Labels made in Gmail show up here.</p>
      ) : (
        <div className="mobile-action-list" role="group" aria-label="Labels">
          {userLabels.map((label) => {
            const on = live.labelIds.includes(label.id)
            return (
              <button
                key={label.id}
                type="button"
                className={on ? 'is-current' : ''}
                aria-pressed={on}
                disabled={modify.isPending}
                onClick={() =>
                  modify.mutate({
                    threadKey: live.key,
                    changes: on
                      ? { addLabelIds: [], removeLabelIds: [label.id] }
                      : { addLabelIds: [label.id], removeLabelIds: [] },
                  })
                }
              >
                <span className="mobile-sheet-icon"><MobileIcon name="listBullet" scale="action" /></span>
                <span>{label.name}</span>
                {on && <MobileIcon name="check" scale="action" />}
              </button>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
