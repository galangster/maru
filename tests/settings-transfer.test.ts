// Settings transfer — P5. The whitelist and the checksum are contracts: the
// file must never grow a secret, and altered text must never half-apply.

import { describe, it, expect } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/core/defaults'
import type { Settings } from '../src/core/types'
import {
  exportSettings,
  parseSettingsTransfer,
  transferDiff,
} from '../src/features/settings/transfer'

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  theme: 'dark',
  sounds: true,
  googleClientId: 'client-123.apps.googleusercontent.com',
  googleClientSecret: 'GOCSPX-not-really',
}

describe('exportSettings → parseSettingsTransfer', () => {
  it('round-trips every whitelisted field', async () => {
    const text = await exportSettings(SETTINGS, new Date('2026-08-29T12:00:00Z'))
    const parsed = await parseSettingsTransfer(text)
    expect(parsed).toMatchObject({
      ok: true,
      exportedAt: '2026-08-29T12:00:00.000Z',
      settings: {
        theme: 'dark',
        sounds: true,
        conversationOrder: 'chronological',
        googleClientId: 'client-123.apps.googleusercontent.com',
      },
    })
  })

  it('the file says on its face what it carries and what it never does', async () => {
    const text = await exportSettings(SETTINGS)
    expect(text).toContain('never account tokens')
    expect(text).not.toContain('wren_agent_')
  })

  it('refuses altered text by checksum, whole-file', async () => {
    const text = await exportSettings(SETTINGS)
    const tampered = text.replace('"theme": "dark"', '"theme": "light"')
    const parsed = await parseSettingsTransfer(tampered)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toContain('checksum')
  })

  it('refuses a known field with the wrong shape rather than half-applying', async () => {
    const text = await exportSettings(SETTINGS)
    const file = JSON.parse(text)
    file.settings.pollIntervalSec = 'often'
    const parsed = await parseSettingsTransfer(JSON.stringify(file))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toContain('pollIntervalSec')
  })

  it('drops unknown fields silently, so a newer export still imports', async () => {
    const text = await exportSettings(SETTINGS)
    const file = JSON.parse(text)
    file.settings.futureFeature = 'on'
    // Unknown fields are not part of the canonical checksum, so this stays valid.
    const parsed = await parseSettingsTransfer(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect('futureFeature' in parsed.settings).toBe(false)
  })

  it('names a version it cannot read', async () => {
    const parsed = await parseSettingsTransfer(
      JSON.stringify({ wren_settings: 99, settings: { theme: 'dark' } }),
    )
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toContain('version 99')
  })

  it('rejects non-JSON with a human sentence', async () => {
    const parsed = await parseSettingsTransfer('not json')
    expect(parsed.ok).toBe(false)
  })
})

describe('transferDiff', () => {
  it('lists only real changes, and masks the client secret', () => {
    const rows = transferDiff(DEFAULT_SETTINGS, {
      theme: 'dark',
      sounds: false, // same as default: not a change
      googleClientSecret: 'GOCSPX-new',
    })
    expect(rows.map((r) => r.field)).toEqual(['theme', 'googleClientSecret'])
    const secret = rows.find((r) => r.field === 'googleClientSecret')
    expect(secret?.to).toBe('••••')
    expect(secret?.from).toBe('(unset)')
  })
})
