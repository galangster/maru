// The debug report — P7. No telemetry means this text is the whole support
// story, so what it scrubs is a contract, not a courtesy.

import { describe, it, expect, beforeEach } from 'vitest'

import { buildDebugReport, clearTrouble, recordTrouble } from '../src/lib/debug-report'

const BASE = {
  version: '0.1.0',
  mode: 'real',
  accountCount: 2,
  settings: { theme: 'dark', sounds: false },
  syncStates: ['idle', 'error: token expired for maya@fernwood.dev'],
  userAgent: 'test-agent',
}

beforeEach(() => clearTrouble())

describe('buildDebugReport', () => {
  it('carries versions, counts and settings — never an address', () => {
    const report = buildDebugReport(BASE)
    expect(report).toContain('version: 0.1.0')
    expect(report).toContain('accounts: 2')
    expect(report).toContain('theme: dark')
    expect(report).toContain('sync 2: error:')
    expect(report).not.toContain('maya@fernwood.dev')
    expect(report).toContain('‹address›')
  })

  it('scrubs addresses that rode in on recorded trouble', () => {
    recordTrouble('send failed for dev.raman@fernwood.dev: 403', 1000)
    const report = buildDebugReport(BASE)
    expect(report).toContain('send failed for ‹address›: 403')
    expect(report).not.toContain('fernwood.dev')
  })

  it('says so plainly when nothing went wrong', () => {
    expect(buildDebugReport(BASE)).toContain('none recorded this session')
  })

  it('ring-caps the trouble buffer at fifty lines', () => {
    for (let i = 0; i < 60; i++) recordTrouble(`event ${i}`, i)
    const report = buildDebugReport(BASE)
    expect(report).toContain('recent trouble (50):')
    expect(report).not.toContain('event 9\n')
    expect(report).toContain('event 59')
  })
})
