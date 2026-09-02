import { lazy, useCallback, useEffect, useReducer, useRef, useState } from 'react'

import type { Account, MailActionType, MailView } from '@/core/types'
import { useComposer } from '@/features/compose/compose-store'
import { useComposeActions } from '@/features/compose/use-compose-actions'
import {
  registerUndoable,
  useDefer,
  useLabels,
  useMailEvents,
  usePerformAction,
  useAccountsById,
  useWakeSweep,
} from '@/features/mail/queries'
import { isBulkAction, runBatchAction, runBatchDefer } from '@/features/list/bulk'
import { usePush } from '@/features/notifications/use-push'
import { useThemeEffect } from '@/features/shell/use-theme'
import { useSyncSummary } from '@/features/sidebar/use-sync-summary'
import { viewOverride } from '@/lib/env'
import { nativeShellPossible } from '@/platform/shell'
import { MobileIcon } from './components/mobile-icon'
import { mailboxTitle } from './mailboxes'
import { InboxScreen } from './screens/inbox-screen'
import { SearchScreen } from './screens/search-screen'
import { SettingsScreen } from './screens/settings-screen'
import { ThreadScreen } from './screens/thread-screen'
import { ComposeSheet } from './sheets/compose-sheet'
import { LabelSheet } from './sheets/label-sheet'
import { LaterSheet } from './sheets/later-sheet'
import { MailboxSheet } from './sheets/mailbox-sheet'
import { PushAccountSheet } from './sheets/push-account-sheet'
import { MoveSheet, ThreadActionsSheet } from './sheets/thread-actions-sheet'
import {
  MOBILE_TABS,
  MOBILE_TAB_CHROME,
  atRoot,
  deferTarget,
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

/** Where the list starts, and where the Inbox tab always lands. */
const UNIFIED_INBOX: MailView = { kind: 'unified', folder: 'inbox' }

export function MobileApp() {
  useThemeEffect()
  useMailEvents()
  useWakeSweep()
  useInputModality()

  const [navigation, dispatch] = useReducer(mobileRouteReducer, initialMobileRoute)
  // Which mailbox the list screen is showing. Shell state rather than route
  // state: it survives a thread push and a tab change the way the mailbox you
  // are reading in should, and it is not something the back gesture pops.
  // `?view=` is the desktop's capture seam and it opens the same mailboxes,
  // so the phone reads it too rather than making the captures drive the picker.
  const [mailbox, setMailbox] = useState<MailView>(() => viewOverride() ?? UNIFIED_INBOX)
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
  // What the mailbox on screen is called. Resolved once, here, because two
  // screens need the same answer: the list titles itself with it and the
  // thread's back control names the screen underneath with it. The labels
  // query is per account and shares react-query's key with the picker's, so
  // asking for it here costs nothing.
  const mailboxLabels = useLabels(mailbox.kind === 'account' ? mailbox.accountId : undefined)
  const perform = usePerformAction()
  const defer = useDefer()
  const composerOpen = useComposer((state) => state.open)
  const { accounts } = useAccountsById()
  const [announcement, setAnnouncement] = useState({ text: '', alternate: false })
  const { compose, replyTo } = useComposeActions()
  const mailboxName = mailboxTitle(
    mailbox,
    accounts,
    mailbox.kind === 'account'
      ? (mailboxLabels.data ?? []).find((label) => label.id === mailbox.labelId)?.name
      : undefined,
  )
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
  const announce = useCallback((text: string) => {
    setAnnouncement((current) => ({ text, alternate: !current.alternate }))
  }, [])

  const act = (threadKey: string, type: MailActionType) => {
    const action = { threadKey, type }
    registerUndoable((next) => perform.mutate(next), action)
    perform.mutate(action)
    // The archive haptic rides usePerformAction with the completion sound, so
    // every surface gets it and a bulk archive stays one tap.
    if (type === 'archive') announce('Archived')
  }
  /**
   * One verb over a list of conversations — a swipe over one, or the Edit
   * bar's batch.
   *
   * The batch goes through the desktop's own `runBatchAction` rather than a
   * loop over `act` (issue 8). The loop registered one undoable per
   * conversation into a store that holds exactly one, so Undo put back the
   * last row of the batch and quietly abandoned the rest — and the toast said
   * "Archived" whether it had taken one conversation or forty.
   *
   * One row keeps the single-thread toast, because "Archived" beside the row
   * you just flicked is the better sentence and its undo was never wrong.
   */
  const actMany = (threadKeys: string[], type: MailActionType) => {
    if (threadKeys.length === 0) return
    if (threadKeys.length === 1 || !isBulkAction(type)) {
      for (const threadKey of threadKeys) act(threadKey, type)
      return
    }
    announce(runBatchAction((next) => perform.mutate(next), threadKeys, type, 'conversation'))
  }
  const closeSheet = () => dispatch({ type: 'closeSheet' })
  const openAccount = useCallback(() => dispatch({ type: 'push', entry: { kind: 'account' } }), [])
  const openPushSheet = useCallback(() => dispatch({ type: 'openSheet', sheet: { kind: 'pushAccount' } }), [])
  // Only from the inbox at rest. The offer is worth making once and worth
  // making well, so it waits for a screen with nothing else on it.
  const inboxAtRest = screen === 'inbox' && sheet === null && !composerOpen
  usePushAccountNudge(inboxAtRest, openPushSheet)

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
          view={mailbox}
          title={mailboxName}
          readScrollTop={readScrollTop}
          onOpen={(threadKey) => dispatch({ type: 'push', entry: { kind: 'thread', threadKey } })}
          onCompose={compose}
          onSearch={() => changeTab('search')}
          onSettings={() => changeTab('settings')}
          onMailboxes={() => dispatch({ type: 'openSheet', sheet: { kind: 'mailboxes' } })}
          onAct={actMany}
          onLater={(targets) => dispatch({ type: 'openSheet', sheet: { kind: 'later', targets } })}
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
            backLabel={navigation.tab === 'inbox' ? mailboxName : MOBILE_TAB_CHROME[navigation.tab].label}
            onBack={() => dispatch({ type: 'back' })}
            onReply={replyTo}
            onArchive={(key) => { actMany([key], 'archive'); dispatch({ type: 'back' }) }}
            onLater={(target) => dispatch({ type: 'openSheet', sheet: { kind: 'later', targets: [target] } })}
            onMore={(thread) => dispatch({ type: 'openSheet', sheet: { kind: 'threadActions', thread } })}
            onLabels={(thread) => dispatch({ type: 'openSheet', sheet: { kind: 'labels', thread } })}
          />
        ) : screen === 'search' ? (
          <SearchScreen
            onOpen={(threadKey) => dispatch({ type: 'push', entry: { kind: 'thread', threadKey } })}
            onAct={actMany}
            onLater={(targets) => dispatch({ type: 'openSheet', sheet: { kind: 'later', targets } })}
            onContext={(thread) => dispatch({ type: 'openSheet', sheet: { kind: 'threadActions', thread } })}
            onStar={(thread) => act(thread.key, thread.starred ? 'unstar' : 'star')}
          />
        ) : screen === 'settings' ? (
          <SettingsScreen onAccount={openAccount} />
        ) : null}
      </main>

      {atRoot(navigation) && nativeTabBar === false && <TabBar active={navigation.tab} inert={globalModalOpen} onChange={changeTab} />}
      {composerOpen && <ComposeSheet onSent={() => announce('Sent')} />}
      {sheet?.kind === 'later' && (
        <LaterSheet
          count={sheet.targets.length}
          onClose={closeSheet}
          onPick={(wakeAt) => {
            // The haptic rides `useDefer`, beside the cache patch every Later
            // surface shares.
            //
            // Saving for later says so now, and offers Undo (issue 16): a left
            // swipe and a right swipe are one flick apart on a phone, and one
            // of them used to be silently irreversible while the other put up
            // a toast. It goes through the same batch mechanism as the bulk
            // bar, so one pick is one confirmation and one undo however many
            // conversations it took, and the undo returns each of them to its
            // own prior schedule rather than to one shared guess.
            // The prior wake times came in with the keys, from the surface
            // that opened the sheet and already had the conversations in hand.
            const prior = new Map(sheet.targets.map((t) => [t.key, t.deferredUntil]))
            announce(
              runBatchDefer(
                (threadKey, at) => defer.mutate({ threadKey, wakeAt: at }),
                sheet.targets.map((t) => t.key),
                (key) => prior.get(key) ?? null,
                wakeAt,
                Date.now(),
                'conversation',
              ),
            )
            closeSheet()
          }}
        />
      )}
      {sheet?.kind === 'mailboxes' && (
        <MailboxSheet
          accounts={accounts}
          current={mailbox}
          onClose={closeSheet}
          onPick={(view) => { setMailbox(view); closeSheet() }}
        />
      )}
      {sheet?.kind === 'labels' && <LabelSheet thread={sheet.thread} onClose={closeSheet} />}
      {sheet?.kind === 'threadActions' && (
        <ThreadActionsSheet
          thread={sheet.thread}
          onClose={closeSheet}
          onAction={(type) => { act(sheet.thread.key, type); closeSheet() }}
          onLater={() =>
            dispatch({
              type: 'openSheet',
              sheet: { kind: 'later', targets: [deferTarget(sheet.thread)] },
            })
          }
          onMove={() => dispatch({ type: 'openSheet', sheet: { kind: 'move', thread: sheet.thread } })}
        />
      )}
      {sheet?.kind === 'move' && <MoveSheet onClose={closeSheet} onMove={(type) => { act(sheet.thread.key, type); closeSheet() }} />}
      {sheet?.kind === 'pushAccount' && <PushAccountSheet onClose={closeSheet} onAccount={openAccount} />}
      <SyncAnnouncer accounts={accounts} announce={announce} />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement.text}{announcement.alternate ? '\u200B' : ''}
      </div>
    </div>
  )
}

/**
 * The sync state, spoken.
 *
 * A component of its own, drawing nothing, so the minute tick `useSyncSummary`
 * subscribes to re-renders this and not the whole stage — `detail` carries an
 * elapsed time that moves every minute, and re-rendering every screen and
 * sheet for a sentence they do not draw is a frame budget a phone cannot
 * spare. The live region stays in `MobileApp`, because Sent and Archived have
 * to arrive in the same one.
 *
 * The eye reads the same summary in the inbox's sticky header, from the same
 * hook over the same query and the same clock — so the two cannot be two
 * different sentences (issue 9).
 *
 * Spoken on a change of KIND, not of sentence. VoiceOver used to hear "Mail
 * sync needs attention" for all six failure kinds and the eye was given
 * nothing at all; an announcement per minute is the opposite mistake, and it
 * is how a live region teaches people to ignore it.
 */
function SyncAnnouncer({ accounts, announce }: { accounts: Account[]; announce: (text: string) => void }) {
  const sync = useSyncSummary(accounts)
  const spokenKind = useRef('')
  useEffect(() => {
    if (spokenKind.current === sync.kind) return
    spokenKind.current = sync.kind
    announce(sync.detail)
  }, [announce, sync.kind, sync.detail])
  return null
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
