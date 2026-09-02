import { lazy, useCallback, useEffect, useMemo, useReducer, useState } from 'react'

import type { IconName } from '@/components/ui/icon'
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
  useUnreadCount,
  useWakeSweep,
} from '@/features/mail/queries'
import { useThemeEffect } from '@/features/shell/use-theme'
import { nativeShell } from '@/platform/shell'
import { MobileIcon } from './components/mobile-icon'
import { InboxScreen } from './screens/inbox-screen'
import { SearchScreen } from './screens/search-screen'
import { SettingsScreen } from './screens/settings-screen'
import { ThreadScreen } from './screens/thread-screen'
import { ComposeSheet } from './sheets/compose-sheet'
import { LaterSheet } from './sheets/later-sheet'
import { MoveSheet, ThreadActionsSheet } from './sheets/thread-actions-sheet'
import {
  inboxBadgeValue,
  indexOfTab,
  initialMobileRoute,
  mobileRouteReducer,
  tabAtIndex,
  type MobileTab,
} from './state'
import { useNativeShell } from './use-native-shell'
import './mobile.css'

const AccountScreen = lazy(() =>
  import('./screens/account/account-screen').then((module) => ({ default: module.AccountScreen })),
)

/** The web fallback bar. The native bar's items are declared in Swift, in the
 *  same order — see MOBILE_TABS in state.ts. */
const TAB_ITEMS: { id: MobileTab; label: string; icon: IconName }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

export function MobileApp() {
  useThemeEffect()
  useMailEvents()
  useWakeSweep()

  const [navigation, dispatch] = useReducer(mobileRouteReducer, initialMobileRoute)
  const onNativeTab = useCallback((index: number) => {
    const tab = tabAtIndex(index)
    if (tab) dispatch({ type: 'changeTab', tab })
  }, [])
  // `null` until the probe answers, so the web bar never flashes under the glass.
  const nativeTabBar = useNativeShell(onNativeTab)
  const changeTab = useCallback((tab: MobileTab) => {
    dispatch({ type: 'changeTab', tab })
    // Keeps the native bar's selection in step when the move started in JS.
    // UIKit does not call its delegate back for a programmatic selection, so
    // this cannot loop.
    void nativeShell.selectTab(indexOfTab(tab))
  }, [])
  const perform = usePerformAction()
  const defer = useDefer()
  const composerOpen = useComposer((state) => state.open)
  const { accounts } = useAccountsById()
  const syncStatuses = useSyncStatus()
  const unread = useUnreadCount({ kind: 'unified', folder: 'inbox' })
  const [announcement, setAnnouncement] = useState({ text: '', alternate: false })
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
  const announce = useCallback((text: string) => {
    setAnnouncement((current) => ({ text, alternate: !current.alternate }))
  }, [])
  useEffect(() => {
    if (syncAnnouncement) announce(syncAnnouncement)
  }, [announce, syncAnnouncement])

  const act = (threadKey: string, type: MailActionType) => {
    const action = { threadKey, type }
    registerUndoable((next) => perform.mutate(next), action)
    perform.mutate(action)
    if (type === 'archive') {
      announce('Archived')
      void nativeShell.impact('medium')
    }
  }
  const closeSheet = () => dispatch({ type: 'closeSheet' })

  // The native bar draws over the webview, so anything the web layer puts on
  // top of the screen — a thread, the account route, a sheet, the composer —
  // has to take the bar away first or it floats above them.
  const nativeBarHidden = route.kind !== 'inbox' || globalModalOpen
  useEffect(() => {
    if (!nativeTabBar) return
    void nativeShell.setTabBarHidden(nativeBarHidden)
  }, [nativeTabBar, nativeBarHidden])
  useEffect(() => {
    if (!nativeTabBar) return
    void nativeShell.setBadge(0, inboxBadgeValue(unread.data ?? 0))
  }, [nativeTabBar, unread.data])

  return (
    <div className="mobile-app" data-testid="mobile-app" data-native-shell={nativeTabBar ? 'true' : undefined}>
      <main className="mobile-stage" inert={globalModalOpen}>
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
            onSearch={() => changeTab('search')}
            onArchive={(keys) => keys.forEach((key) => act(key, 'archive'))}
            onLater={(threadKeys) => dispatch({ type: 'openSheet', sheet: { kind: 'later', threadKeys } })}
            onContext={(thread) => dispatch({ type: 'openSheet', sheet: { kind: 'threadActions', thread } })}
            onStar={(thread) => act(thread.key, thread.starred ? 'unstar' : 'star')}
          />
        ) : navigation.tab === 'search' ? (
          <SearchScreen onOpen={(threadKey) => dispatch({ type: 'push', entry: { kind: 'thread', threadKey } })} />
        ) : <SettingsScreen onAccount={() => dispatch({ type: 'push', entry: { kind: 'account' } })} />}
      </main>

      {route.kind === 'inbox' && nativeTabBar === false && <TabBar active={navigation.tab} inert={globalModalOpen} onChange={changeTab} />}
      {composerOpen && <ComposeSheet onSent={() => { announce('Sent'); void nativeShell.notify('success') }} />}
      {sheet?.kind === 'later' && (
        <LaterSheet
          count={sheet.threadKeys.length}
          onClose={closeSheet}
          onPick={(wakeAt) => {
            sheet.threadKeys.forEach((threadKey) => defer.mutate({ threadKey, wakeAt }))
            void nativeShell.impact('medium')
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
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement.text}{announcement.alternate ? '\u200B' : ''}
      </div>
    </div>
  )
}

/**
 * The web tab bar. On iOS it is never rendered — the system UITabBarController
 * owns that chrome, and a second bar in the document would also give VoiceOver
 * a second set of tabs to read. It stays because the `?mobile=1` browser
 * preview is the only way to reach Search and Settings outside the simulator,
 * and captures and design review run there.
 */
function TabBar({ active, inert, onChange }: { active: MobileTab; inert: boolean; onChange: (tab: MobileTab) => void }) {
  return (
    <nav className="mobile-tab-bar" aria-label="Primary navigation" inert={inert}>
      {TAB_ITEMS.map((item) => <button key={item.id} type="button" className={active === item.id ? 'is-active' : ''} onClick={() => onChange(item.id)} aria-current={active === item.id ? 'page' : undefined}><MobileIcon name={item.icon} scale="large" /><span>{item.label}</span></button>)}
    </nav>
  )
}
