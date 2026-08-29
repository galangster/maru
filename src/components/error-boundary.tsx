// The last thing between a render error and a white window.
//
// React unmounts the entire tree when a render throws and nothing catches it,
// which is what turned a hook-order change during an HMR update into a blank
// app mid-use, with the mail still syncing behind it and no way back except
// finding the devtools. A boundary at the root turns that into a card and a
// button.
//
// A class, because `getDerivedStateFromError` has no hook equivalent — this is
// the one component in Wren that cannot be a function.
//
// It does not try to recover in place. A tree that threw while rendering is in
// an unknown state, and "try again" on the same broken tree is a second white
// screen a moment later. `location.reload()` is honest: the app starts again,
// and nothing is lost, because the mail and the accounts are on disk.

import { Component, type ErrorInfo, type ReactNode } from 'react'

import { PrimaryButton } from '@/components/wren-controls'

interface Props {
  children: ReactNode
}

interface State {
  message: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The card is for the user; this is for whoever is watching the console.
    // The component stack is the half that says *where*, and React only ever
    // hands it over here.
    console.error('[wren] render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children

    return (
      // Nothing from the failed tree renders under this, so it draws its own
      // canvas rather than sitting on one. Same shape as onboarding: the app's
      // background, one card in the middle of it.
      <div
        role="alert"
        className="bg-canvas fixed inset-0 z-50 flex items-center justify-center p-8"
      >
        <div className="bg-raised flex w-[400px] max-w-full flex-col gap-3 rounded-2xl p-6 shadow-xl">
          <h1 className="font-ui text-ink text-xl font-semibold text-balance">Something broke</h1>
          {/* Family 2: every action card carries a one-line "why", so the
              button is a choice rather than an instruction. */}
          <p className="text-ink-2 text-sm text-pretty">
            Wren hit an error it could not recover from. Reloading starts the window again — your
            mail and your accounts are on disk and are not affected.
          </p>
          {/* The message, quietly. It is the one line that makes a bug report
              worth reading, and it is the meta tier because it is not the
              point of the card. */}
          <p className="text-ink-3 break-words text-xs">{this.state.message}</p>
          <PrimaryButton
            autoFocus
            onClick={() => window.location.reload()}
            className="mt-1 h-9 w-full"
          >
            Reload
          </PrimaryButton>
        </div>
      </div>
    )
  }
}
