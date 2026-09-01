async function bip39() {
  const [library, words] = await Promise.all([
    import('@scure/bip39'),
    import('@scure/bip39/wordlists/english.js'),
  ])
  return { ...library, wordlist: words.wordlist }
}

export async function generateRecoveryPhrase(): Promise<string> {
  const { generateMnemonic, wordlist } = await bip39()
  return generateMnemonic(wordlist, 128)
}

export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/u).join(' ')
}

export async function validateRecoveryPhrase(phrase: string): Promise<boolean> {
  const { validateMnemonic, wordlist } = await bip39()
  return validateMnemonic(normalizeRecoveryPhrase(phrase), wordlist)
}

export async function recoveryEntropy(phrase: string): Promise<Uint8Array> {
  const { mnemonicToEntropy, validateMnemonic, wordlist } = await bip39()
  const normalized = normalizeRecoveryPhrase(phrase)
  if (!validateMnemonic(normalized, wordlist)) throw new Error('Enter all 12 recovery words in order')
  return mnemonicToEntropy(normalized, wordlist)
}

export async function recoveryPhraseFromEntropy(entropy: Uint8Array): Promise<string> {
  if (entropy.byteLength !== 16) throw new Error('A Maru recovery key is 128 bits')
  const { entropyToMnemonic, wordlist } = await bip39()
  return entropyToMnemonic(entropy, wordlist)
}
