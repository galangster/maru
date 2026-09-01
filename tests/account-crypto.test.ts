import { describe, expect, it } from 'vitest'

import {
  deriveMasterKey,
  derivePasswordKeys,
  deriveRecoveryKeys,
  hkdf,
  open,
  seal,
  unwrapByPassword,
  unwrapByRecovery,
  wrapByPassword,
  wrapByRecovery,
} from '../src/core/account/crypto'
import {
  generateRecoveryPhrase,
  recoveryEntropy,
  recoveryPhraseFromEntropy,
  validateRecoveryPhrase,
} from '../src/core/account/recovery'

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

describe('Maru account cryptography', () => {
  it('matches deterministic Argon2id and HKDF vectors', async () => {
    const master = await deriveMasterKey('correct horse battery staple', 'Nick@Example.com', {
      algo: 'argon2id', m: 32, t: 2, p: 1,
    })
    expect(hex(master)).toBe('f3936a7aa92d7f5a6afd7a005a1377ba2cc098fb6ff3c99aa0e3788bc60ec79d')

    const expanded = await hkdf(new Uint8Array(32).fill(7), 'maru-auth-v1')
    expect(hex(expanded)).toBe('5f4f72ac57edf887f4b3325bd49fd3c265f943ef24fbc5723440ba9a1d627870')
  })

  it('seals, opens and rejects tampering', async () => {
    const key = new Uint8Array(32).fill(3)
    const value = await seal(key, 'private', 'test-aad')
    expect(new TextDecoder().decode(await open(key, value, 'test-aad'))).toBe('private')
    const parts = value.split('.')
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`
    await expect(open(key, parts.join('.'), 'test-aad')).rejects.toThrow()
    await expect(open(key, value, 'wrong-aad')).rejects.toThrow()
  })

  it('opens the same account key through password and recovery wrapping', async () => {
    const accountKey = new Uint8Array(32).fill(11)
    const master = new Uint8Array(32).fill(5)
    const entropy = new Uint8Array(16).fill(9)
    const passwordKeys = await derivePasswordKeys(master)
    const recoveryKeys = await deriveRecoveryKeys(entropy)
    const passwordWrapped = await wrapByPassword(passwordKeys.encKey, accountKey)
    const recoveryWrapped = await wrapByRecovery(recoveryKeys.encKey, accountKey)
    expect(await unwrapByPassword(passwordKeys.encKey, passwordWrapped)).toEqual(accountKey)
    expect(await unwrapByRecovery(recoveryKeys.encKey, recoveryWrapped)).toEqual(accountKey)
  })
})

describe('Maru recovery phrase', () => {
  it('roundtrips 128-bit entropy through 12 words', () => {
    const phrase = generateRecoveryPhrase()
    expect(phrase.split(' ')).toHaveLength(12)
    expect(validateRecoveryPhrase(phrase)).toBe(true)
    expect(recoveryPhraseFromEntropy(recoveryEntropy(phrase))).toBe(phrase)
  })

  it('rejects a phrase with the wrong checksum', () => {
    const words = generateRecoveryPhrase().split(' ')
    words[11] = words[11] === 'zoo' ? 'abandon' : 'zoo'
    expect(validateRecoveryPhrase(words.join(' '))).toBe(false)
    expect(() => recoveryEntropy(words.join(' '))).toThrow(/12 recovery words/u)
  })
})
