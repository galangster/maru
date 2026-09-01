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
    const text = await exportSettings(SETTINGS, [], new Date('2026-08-29T12:00:00Z'))
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

  it('never exports an official client id or its paired secret', async () => {
    const text = await exportSettings(
      { ...SETTINGS, googleClientId: 'official-client', googleClientSecret: 'ignored-secret' },
      [],
      new Date('2026-08-29T12:00:00Z'),
      'official-client',
    )
    const file = JSON.parse(text)
    expect(file.settings.googleClientId).toBeUndefined()
    expect(file.settings.googleClientSecret).toBeUndefined()
    expect(text).not.toContain('official-client')
    expect(text).not.toContain('ignored-secret')
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

describe('the account address list (G2 map-4 v1 payload)', () => {
  const ADDRESSES = ['nick@gmail.com', 'nick.galang@gmail.com']

  it('carries the addresses and nothing else about the accounts', async () => {
    const text = await exportSettings(SETTINGS, ADDRESSES)
    const file = JSON.parse(text)
    expect(file.accounts).toEqual(ADDRESSES)
    // The hard lines from G2, asserted on the artifact rather than trusted.
    // The PAYLOAD, not the whole file: `note` says the words "tokens" and
    // "grants" on purpose, because saying what a file does not carry is the
    // point of putting a disclosure on its face.
    const payload = JSON.stringify({ settings: file.settings, accounts: file.accounts })
    expect(payload).not.toMatch(/token|grant|historyId|refresh/i)
    // Addresses only — no shape of an account came with them.
    expect(file.accounts.every((a: unknown) => typeof a === 'string')).toBe(true)
  })

  it('round-trips them', async () => {
    const parsed = await parseSettingsTransfer(await exportSettings(SETTINGS, ADDRESSES))
    expect(parsed).toMatchObject({ ok: true, accounts: ADDRESSES })
  })

  it('omits the key entirely with no accounts, so an older Maru reads the file', async () => {
    const text = await exportSettings(SETTINGS, [])
    expect(JSON.parse(text)).not.toHaveProperty('accounts')
    // And the version does not move, which is the other half of that promise.
    expect(JSON.parse(text).wren_settings).toBe(1)
  })

  it('does not put the list in the checksum, so an older Maru still validates', async () => {
    // The checksum is over the SETTINGS. Adding addresses must not change it,
    // or a pre-address-list Maru would reject a valid file as "altered in
    // transit" — a lie, and the worst possible error for a version skew.
    const without = JSON.parse(await exportSettings(SETTINGS, []))
    const with_ = JSON.parse(await exportSettings(SETTINGS, ADDRESSES))
    expect(with_.checksum).toBe(without.checksum)
  })

  it('reads a file that has no address list at all', async () => {
    const older = JSON.parse(await exportSettings(SETTINGS, []))
    const parsed = await parseSettingsTransfer(JSON.stringify(older))
    expect(parsed).toMatchObject({ ok: true, accounts: [] })
  })

  it('drops junk entries rather than refusing the whole import', async () => {
    // The opposite of the settings rule, and deliberately: a malformed SETTING
    // would be applied to the app, while a malformed address is only ever
    // shown to a human who then chooses whether to sign in to it.
    const file = JSON.parse(await exportSettings(SETTINGS, []))
    file.accounts = ['ok@gmail.com', 'not an address', 42, '', 'OK@gmail.com', 'b@x.co']
    const parsed = await parseSettingsTransfer(JSON.stringify(file))
    expect(parsed).toMatchObject({ ok: true, accounts: ['ok@gmail.com', 'b@x.co'] })
  })

  it('caps the list, so a hostile paste cannot queue endless consent screens', async () => {
    const file = JSON.parse(await exportSettings(SETTINGS, []))
    file.accounts = Array.from({ length: 500 }, (_, i) => `a${i}@x.co`)
    const parsed = await parseSettingsTransfer(JSON.stringify(file))
    if (!parsed.ok) throw new Error('expected a valid parse')
    expect(parsed.accounts.length).toBeLessThanOrEqual(20)
  })

  it('still refuses a file whose SETTINGS were altered', async () => {
    const file = JSON.parse(await exportSettings(SETTINGS, ADDRESSES))
    file.settings.pollIntervalSec = 9999
    const parsed = await parseSettingsTransfer(JSON.stringify(file))
    expect(parsed).toMatchObject({ ok: false })
  })
})
