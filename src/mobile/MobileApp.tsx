import { lazy, useCallback, useEffect, useMemo, useReducer, useState } from 'react'

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
import { usePush } from '@/features/notifications/use-push'
import { useThemeEffect } from '@/features/shell/use-theme'
import { nativeShellPossible } from '@/platform/shell'
import { MobileIcon } from './components/mobile-icon'
import { InboxScreen } from './screens/inbox-screen'
import { SearchScreen } from './screens/search-screen'
import { SettingsScreen } from './screens/settings-screen'
import { ThreadScreen } from './screens/thread-screen'
import { ComposeSheet } from './sheets/compose-sheet'
import { LaterSheet } from './sheets/later-sheet'
import { PushAccountSheet } from './sheets/push-account-sheet'
import { MoveSheet, ThreadActionsSheet } from './sheets/thread-actions-sheet'
import {
  MOBILE_TABS,
  MOBILE_TAB_CHROME,
  atRoot,
  initialMobileRoute,
  mobileRouteReducer,
  tabAtIndex,
  visibleScreen,
  type MobileTab,
} from './state'
import { useInputModality } from './use-input-modality'
import { useNativeShell, useNativeShellSync } from './use-native-shell'
import { usePushAccountNudge } from './use-push-account-nudge'
import { useRouteScroll } from './use-route-scroll'
import './mobile.css'

const AccountScreen = lazy(() =>
  import('./screens/account/account-screen').then((module) => ({ default: module.AccountScreen })),
)

export function MobileApp() {
  useThemeEffect()
  useMailEvents()
  useWakeSweep()
  useInputModality()

  const [navigation, dispatch] = useReducer(mobileRouteReducer, initialMobileRoute)
  const onNativeTab = useCallback((index: number) => {
    const tab = tabAtIndex(index)
    if (tab) dispatch({ type: 'changeTab', tab })
  }, [])
  // `null` until the probe answers, so the web bar never flashes under the glass.
  const nativeTabBar = useNativeShell(onNativeTab)
  // Nothing native here: the bar's selection is mirrored from the reducer by
  // `useNativeShellSync`, so a move that starts in JS needs no second call.
  const changeTab = useCallback((tab: MobileTab) => {
    dispatch({ type: 'changeTab', tab })
  }, [])
  // A tapped notification opens its conversation through the same reducer as
  // a tapped row, so it lands with an inbox underneath it and a working back.
  usePush(
    useCallback(
      (threadKey: string) => dispatch({ type: 'push', entry: { kind: 'thread', threadKey } }),
      [],
    ),
  )
  const perform = usePerformAction()
  const defer = useDefer()
  const composerOpen = useComposer((state) => state.open)
  const { accounts } = useAccountsById()
  const syncStatuses = useSyncStatus()
  const [announcement, setAnnouncement] = useState({ text: '', alternate: false })
  const { compose, replyTo } = useComposeActions()
  const route = navigation.stack[navigation.stack.length - 1]
  const screen = visibleScreen(navigation)
  const sheet = navigation.sheet
  // One key per screen the shell can show. The page is the scroller, so each
  // one needs its own remembered offset. Threads are keyed individually: two
  // of them are never the same page.
  const readScrollTop = useRouteScroll(
    route.kind === 'thread' ? `thread:${route.threadKey}` : `screen:${screen}`,
  )
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
    // The archive haptic rides usePerformAction with the completion sound, so
    // every surface gets it and a bulk archive stays one tap.
    if (type === 'archive') announce('Archived')
  }
  const closeSheet = () => dispatch({ type: 'closeSheet' })
  const openAccount = useCallback(() => dispatch({ type: 'push', entry: { kind: 'account' } }), [])
  // Only from the inbox at rest. The offer is worth making once and worth
  // making well, so it waits for a screen with nothing else on it.
  usePushAccountNudge(
    screen === 'inbox' && sheet === null && !composerOpen,
    useCallback(() => dispatch({ type: 'openSheet', sheet: { kind: 'pushAccount' } }), []),
  )

  useNativeShellSync(nativeTabBar, {
    tab: navigation.tab,
    hidden: !atRoot(navigation) || globalModalOpen,
  })

  // `data-native-shell` answers synchronously, so no strip of dead space is
  // reserved under the glass on the first frame of a cold start while the probe
  // is still in flight. The probe only ever corrects it downwards, and only on
  // a phone where the plugin failed to install.
  const nativeChrome = nativeTabBar ?? nativeShellPossible

  return (
    <div className="mobile-app" data-testid="mobile-app" data-native-shell={nativeChrome ? 'true' : undefined}>
      <main className="mobile-stage" inert={globalModalOpen}>
        {/* The one screen the stage never unmounts. It is paused instead,
            and it decides what that means for it — docs/IOS.md, "The inbox
            stays mounted". */}
        <InboxScreen
          paused={screen !== 'inbox'}
          readScrollTop={readScrollTop}
          onOpen={(threadKey) => dispatch({ type: 'push', entry: { kind: 'thread', threadKey } })}
          onCompose={compose}
          onSearch={() => changeTab('search')}
          onArchive={(keys) => keys.forEach((key) => act(key, 'archive'))}
          onLater={(threadKeys) => dispatch({ type: 'openSheet', sheet: { kind: 'later', threadKeys } })}
          onContext={(thread) => dispatch({ type: 'openSheet', sheet: { kind: 'threadActions', thread } })}
          onStar={(thread) => act(thread.key, thread.starred ? 'unstar' : 'star')}
        />
        {screen === 'account' ? (
          <AccountScreen
            onBack={() => dispatch({ type: 'back' })}
            backLabel={MOBILE_TAB_CHROME[navigation.tab].label}
            sheet={sheet}
            openSheet={(next) => dispatch({ type: 'openSheet', sheet: next })}
            closeSheet={closeSheet}
          />
        ) : screen === 'thread' && route.kind === 'thread' ? (
          <ThreadScreen
            threadKey={route.threadKey}
            onBack={() => dispatch({ type: 'back' })}
            onReply={replyTo}
            onArchive={(key) => { act(key, 'archive'); dispatch({ type: 'back' }) }}
            onLater={(key) => dispatch({ type: 'openSheet', sheet: { kind: 'later', threadKeys: [key] } })}
            onMore={(thread) => dispatch({ type: 'openSheet', sheet: { kind: 'threadActions', thread } })}
          />
        ) : screen === 'search' ? (
          <SearchScreen onOpen={(threadKey) => dispatch({ type: 'push', entry: { kind: 'thread', threadKey } })} />
        ) : screen === 'settings' ? (
          <SettingsScreen onAccount={openAccount} />
        ) : null}
      </main>

      {atRoot(navigation) && nativeTabBar === false && <TabBar active={navigation.tab} inert={globalModalOpen} onChange={changeTab} />}
      {composerOpen && <ComposeSheet onSent={() => announce('Sent')} />}
      {sheet?.kind === 'later' && (
        <LaterSheet
          count={sheet.threadKeys.length}
          onClose={closeSheet}
          onPick={(wakeAt) => {
            // The haptic rides `useDefer`, beside the cache patch every Later
            // surface shares.
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
      {sheet?.kind === 'pushAccount' && <PushAccountSheet onClose={closeSheet} onAccount={openAccount} />}
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
      {MOBILE_TABS.map((tab) => <button key={tab} type="button" className={active === tab ? 'is-active' : ''} onClick={() => onChange(tab)} aria-current={active === tab ? 'page' : undefined}><MobileIcon name={MOBILE_TAB_CHROME[tab].icon} scale="large" /><span>{MOBILE_TAB_CHROME[tab].label}</span></button>)}
    </nav>
  )
}
