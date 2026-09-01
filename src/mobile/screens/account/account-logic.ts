import type { AccountSyncState } from '@/core/account'

export function syncLabel(state: AccountSyncState): string {
  switch (state.kind) {
    case 'idle':
      return 'Up to date'
    case 'syncing':
      return state.direction === 'pull' ? 'Syncing from Maru…' : 'Saving to Maru…'
    case 'paused':
    case 'signed_out':
      return state.message
  }
}

export function syncTitle(state: AccountSyncState): string {
  switch (state.kind) {
    case 'paused':
      return 'Sync paused'
    case 'syncing':
      return 'Syncing'
    case 'idle':
    case 'signed_out':
      return 'Sync state'
  }
}
