import type { Platform } from '../platform'
import { base64EncodeBytes, decodeBase64Url } from '../mime'

export const CIPHERTEXT_PREFIX = 'wrenc1:'

const KEY_BYTES = 32
const IV_BYTES = 12
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

interface CachedKey {
  key: CryptoKey
  aad: Uint8Array<ArrayBuffer>
}

function secretKey(accountId: string): string {
  return `wren:key:account:${accountId}`
}

async function importKey(bytes: Uint8Array): Promise<CryptoKey> {
  if (bytes.byteLength !== KEY_BYTES) throw new Error('Invalid account key length')
  return globalThis.crypto.subtle.importKey('raw', bytes.slice().buffer, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export class Keyring {
  private readonly keys = new Map<string, CachedKey>()
  private readonly creating = new Map<string, Promise<CachedKey>>()

  constructor(private readonly platform: Platform) {}

  async keyFor(accountId: string): Promise<CryptoKey> {
    return (await this.keyAndAadFor(accountId)).key
  }

  private async keyAndAadFor(accountId: string): Promise<CachedKey> {
    const cached = this.keys.get(accountId)
    if (cached) return cached

    const pending = this.creating.get(accountId)
    if (pending) return pending

    const creating = this.loadOrCreate(accountId)
    this.creating.set(accountId, creating)
    try {
      return await creating
    } finally {
      if (this.creating.get(accountId) === creating) this.creating.delete(accountId)
    }
  }

  private async loadOrCreate(accountId: string): Promise<CachedKey> {
    const stored = await this.platform.secretGet(secretKey(accountId))
    const bytes = stored
      ? decodeBase64Url(stored)
      : globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES))
    if (!stored) await this.platform.secretSet(secretKey(accountId), base64EncodeBytes(bytes))
    const key = await importKey(bytes)
    const cached = { key, aad: textEncoder.encode(accountId) }
    this.keys.set(accountId, cached)
    return cached
  }

  private async existingKey(accountId: string): Promise<CachedKey | null> {
    const cached = this.keys.get(accountId)
    if (cached) return cached
    const stored = await this.platform.secretGet(secretKey(accountId))
    if (!stored) return null
    const key = await importKey(decodeBase64Url(stored))
    const loaded = { key, aad: textEncoder.encode(accountId) }
    this.keys.set(accountId, loaded)
    return loaded
  }

  async destroy(accountId: string): Promise<void> {
    const creating = this.creating.get(accountId)
    if (creating) {
      try {
        await creating
      } catch {
        // Delete after pending creation so it cannot restore the key.
      }
    }
    await this.platform.secretDelete(secretKey(accountId))
    this.keys.delete(accountId)
    this.creating.delete(accountId)
  }

  async encrypt(accountId: string, plaintext: string): Promise<string> {
    const { key, aad } = await this.keyAndAadFor(accountId)
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      key,
      textEncoder.encode(plaintext),
    )
    const value = new Uint8Array(iv.byteLength + ciphertext.byteLength)
    value.set(iv)
    value.set(new Uint8Array(ciphertext), iv.byteLength)
    return CIPHERTEXT_PREFIX + base64EncodeBytes(value)
  }

  async decrypt(accountId: string, value: string): Promise<string | null> {
    if (!value.startsWith(CIPHERTEXT_PREFIX)) return value
    try {
      const cached = await this.existingKey(accountId)
      if (!cached) return null
      const bytes = decodeBase64Url(value.slice(CIPHERTEXT_PREFIX.length))
      if (bytes.byteLength <= IV_BYTES) return null
      const plaintext = await globalThis.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: bytes.slice(0, IV_BYTES).buffer,
          additionalData: cached.aad,
        },
        cached.key,
        bytes.slice(IV_BYTES).buffer,
      )
      return textDecoder.decode(plaintext)
    } catch {
      return null
    }
  }
}

const keyrings = new WeakMap<Platform, Keyring>()

export function keyringFor(platform: Platform): Keyring {
  const existing = keyrings.get(platform)
  if (existing) return existing
  const keyring = new Keyring(platform)
  keyrings.set(platform, keyring)
  return keyring
}
