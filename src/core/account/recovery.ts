import { entropyToMnemonic, generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128)
}

export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/u).join(' ')
}

export function validateRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(normalizeRecoveryPhrase(phrase), wordlist)
}

export function recoveryEntropy(phrase: string): Uint8Array {
  const normalized = normalizeRecoveryPhrase(phrase)
  if (!validateMnemonic(normalized, wordlist)) throw new Error('Enter all 12 recovery words in order')
  return mnemonicToEntropy(normalized, wordlist)
}

export function recoveryPhraseFromEntropy(entropy: Uint8Array): string {
  if (entropy.byteLength !== 16) throw new Error('A Maru recovery key is 128 bits')
  return entropyToMnemonic(entropy, wordlist)
}

