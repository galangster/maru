import { lazy, useMemo, useReducer, useState, type ReactNode } from 'react'
import { Inbox, Search, Settings as SettingsIcon } from 'lucide-react'

import type { MailActionType } from '@/core/types'
import { useComposer } from '@/features/compose/compose-store'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import {
  registerUndoable,
  useDefer,
  useMailEvents,
  usePerformAction,
  useAccountsById,
  useSyncStatus,
  useWakeSweep,
} from '@/features/mail/queries'
import { useThemeEffect } from '@/features/shell/use-theme'
import { InboxScreen } from './screens/inbox-screen'
import { SearchScreen } from './screens/search-screen'
import { SettingsScreen } from './screens/settings-screen'
import { ThreadScreen } from './screens/thread-screen'
import { ComposeSheet } from './sheets/compose-sheet'
import { LaterSheet } from './sheets/later-sheet'
import { MoveSheet, ThreadActionsSheet } from './sheets/thread-actions-sheet'
import {
  initialMobileRoute,
  mobileRouteReducer,
  type MobileTab,
} from './state'
import './mobile.css'

const AccountScreen = lazy(() =>
  import('./screens/account/account-screen').then((module) => ({ default: module.AccountScreen })),
)

export function MobileApp() {
  useThemeEffect()
  useMailEvents()
  useWakeSweep()

  const [navigation, dispatch] = useReducer(mobileRouteReducer, initialMobileRoute)
  const perform = usePerformAction()
  const defer = useDefer()
  const composerOpen = useComposer((state) => state.open)
  const { accounts } = useAccountsById()
  const syncStatuses = useSyncStatus()
  const [announcement, setAnnouncement] = useState({ text: '', sequence: 0 })
  const { compose, replyTo } = useComposeActions()
  const route = navigation.stack[navigation.stack.length - 1]
  const sheet = navigation.sheet
  const globalModalOpen = composerOpen || (sheet !== null && route.kind !== 'account')
  const syncAnnouncement = useMemo(() => {
    const states = accounts.map((account) => syncStatuses[account.id]?.state).filter(Boolean)
    if (states.includes('error')) return 'Mail sync needs attention'
    if (states.includes('syncing')) return 'Syncing mail'
    if (states.length === accounts.length && states.length > 0 && states.every((state) => state === 'idle')) return 'Mail is up to date'
    return ''
  }, [accounts, syncStatuses])
  const announce = (text: string) => setAnnouncement((current) => ({ text, sequence: current.sequence + 1 }))

  const act = (threadKey: string, type: MailActionType) => {
    const action = { threadKey, type }
    registerUndoable((next) => perform.mutate(next), action)
    perform.mutate(action)
    if (type === 'archive') announce('Archived')
  }
  const closeSheet = () => dispatch({ type: 'closeSheet' })

  return (
    <div className="mobile-app" data-testid="mobile-app">
      <main className="mobile-stage" inert={globalModalOpen} aria-hidden={globalModalOpen || undefined}>
        {route.kind === 'account' ? (
          <AccountScreen
            onBack={() => dispatch({ type: 'back' })}
            sheet={sheet}
            openSheet={(next) => dispatch({ type: 'openSheet', sheet: next })}
            closeSheet={closeSheet}
          />
        ) : route.kind === 'thread' ? (
          <ThreadScreen
            threadKey={route.threadKey}
            onBack={() => dispatch({ type: 'back' })}
            onReply={replyTo}
            onArchive={(key) => { act(key, 'archive'); dispatch({ type: 'back' }) }}
            onLater={(key) => dispatch({ type: 'openSheet', sheet: { kind: 'later', threadKeys: [key] } })}
            onMore={(thread) => dispatch({ type: 'openSheet', sheet: { kind: 'threadActions', thread } })}
          />
        ) : navigation.tab === 'inbox' ? (
          <InboxScreen
            onOpen={(threadKey) => dispatch({ type: 'push', entry: { kind: 'thread', threadKey } })}
            onCompose={compose}
            onSearch={() => dispatch({ type: 'changeTab', tab: 'search' })}
            onArchive={(keys) => keys.forEach((key) => act(key, 'archive'))}
            onLater={(threadKeys) => dispatch({ type: 'openSheet', sheet: { kind: 'later', threadKeys } })}
            onContext={(thread) => dispatch({ type: 'openSheet', sheet: { kind: 'threadActions', thread } })}
            onStar={(thread) => act(thread.key, thread.starred ? 'unstar' : 'star')}
          />
        ) : navigation.tab === 'search' ? (
          <SearchScreen onOpen={(threadKey) => dispatch({ type: 'push', entry: { kind: 'thread', threadKey } })} />
        ) : <SettingsScreen onAccount={() => dispatch({ type: 'push', entry: { kind: 'account' } })} />}
      </main>

      {route.kind === 'inbox' && <TabBar active={navigation.tab} inert={globalModalOpen} onChange={(tab) => dispatch({ type: 'changeTab', tab })} />}
      {composerOpen && <ComposeSheet onSent={() => announce('Sent')} />}
      {sheet?.kind === 'later' && (
        <LaterSheet
          count={sheet.threadKeys.length}
          onClose={closeSheet}
          onPick={(wakeAt) => {
            sheet.threadKeys.forEach((threadKey) => defer.mutate({ threadKey, wakeAt }))
            closeSheet()
          }}
        />
      )}
      {sheet?.kind === 'threadActions' && (
        <ThreadActionsSheet
          thread={sheet.thread}
          onClose={closeSheet}
          onAction={(type) => { act(sheet.thread.key, type); closeSheet() }}
          onLater={() => dispatch({ type: 'openSheet', sheet: { kind: 'later', threadKeys: [sheet.thread.key] } })}
          onMove={() => dispatch({ type: 'openSheet', sheet: { kind: 'move', thread: sheet.thread } })}
        />
      )}
      {sheet?.kind === 'move' && <MoveSheet onClose={closeSheet} onMove={(type) => { act(sheet.thread.key, type); closeSheet() }} />}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" key={announcement.sequence}>{announcement.text}</div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{syncAnnouncement}</div>
    </div>
  )
}

function TabBar({ active, inert, onChange }: { active: MobileTab; inert: boolean; onChange: (tab: MobileTab) => void }) {
  const items: { id: MobileTab; label: string; icon: ReactNode }[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={22} /> },
    { id: 'search', label: 'Search', icon: <Search size={22} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={22} /> },
  ]
  return (
    <nav className="mobile-tab-bar" aria-label="Primary navigation" inert={inert} aria-hidden={inert || undefined}>
      {items.map((item) => <button key={item.id} type="button" className={active === item.id ? 'is-active' : ''} onClick={() => onChange(item.id)} aria-current={active === item.id ? 'page' : undefined}>{item.icon}<span>{item.label}</span></button>)}
    </nav>
  )
}
