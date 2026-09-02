// The sidebar's collapse state is ONE mechanism — issue #57.
//
// Two facts can put the sidebar in its 80 px rail: the person asked for it,
// and the window is too narrow to seat the wide form. They used to be read
// separately, so in a narrow window the shortcut drew the wide sidebar inside
// the rail the panel group had already pinned — "Compo", single-letter mailbox
// names, and an account row that was a coloured dot.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }))

import { toast } from 'sonner'

import { selectSidebarRail, useUi } from '../src/features/mail/ui-store'
import { requestSidebarToggle } from '../src/features/sidebar/toggle'

beforeEach(() => {
  vi.mocked(toast).mockClear()
  useUi.setState({ sidebarCollapsed: false, sidebarCramped: false })
})

describe('the sidebar rail', () => {
  it('is drawn for either cause, and for both', () => {
    expect(selectSidebarRail(useUi.getState())).toBe(false)

    useUi.setState({ sidebarCollapsed: true })
    expect(selectSidebarRail(useUi.getState())).toBe(true)

    useUi.setState({ sidebarCollapsed: false, sidebarCramped: true })
    expect(selectSidebarRail(useUi.getState())).toBe(true)

    useUi.setState({ sidebarCollapsed: true, sidebarCramped: true })
    expect(selectSidebarRail(useUi.getState())).toBe(true)
  })

  it('flips both ways in a window with room', () => {
    expect(useUi.getState().toggleSidebar()).toBe(true)
    expect(selectSidebarRail(useUi.getState())).toBe(true)
    expect(useUi.getState().toggleSidebar()).toBe(true)
    expect(selectSidebarRail(useUi.getState())).toBe(false)
  })

  it('refuses in a narrow window, and never writes the wide layout', () => {
    useUi.setState({ sidebarCramped: true })

    expect(useUi.getState().toggleSidebar()).toBe(false)
    // The preference is untouched, so widening the window gives back the
    // sidebar the person actually had.
    expect(useUi.getState().sidebarCollapsed).toBe(false)
    expect(selectSidebarRail(useUi.getState())).toBe(true)
  })

  it('answers the press instead of leaving it silent', () => {
    useUi.setState({ sidebarCramped: true })
    requestSidebarToggle()

    expect(toast).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast).mock.calls[0][0]).toMatch(/too narrow/i)
  })

  it('says nothing when the toggle did what it was asked', () => {
    requestSidebarToggle()

    expect(selectSidebarRail(useUi.getState())).toBe(true)
    expect(toast).not.toHaveBeenCalled()
  })

  it('gives the sidebar back when the window widens', () => {
    // Collapsed by the window alone, never by the person.
    useUi.setState({ sidebarCramped: true })
    expect(selectSidebarRail(useUi.getState())).toBe(true)

    useUi.setState({ sidebarCramped: false })
    expect(selectSidebarRail(useUi.getState())).toBe(false)
  })
})
