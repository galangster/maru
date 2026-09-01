import { argon2id } from 'hash-wasm'

export const DEFAULT_KDF = { algo: 'argon2id', m: 65_536, t: 3, p: 4 } as const

export interface KdfParams {
  algo: 'argon2id'
  m: number
  t: number
  p: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

export function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function accountSalt(email: string): Promise<Uint8Array> {
  const input = encoder.encode(`maru-account-v1:${email.trim().toLowerCase()}`)
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input))
}

export async function deriveMasterKey(
  password: string,
  email: string,
  params: KdfParams = DEFAULT_KDF,
): Promise<Uint8Array> {
  if (params.algo !== 'argon2id') throw new Error(`Unsupported KDF: ${params.algo}`)
  return argon2id({
    password,
    salt: await accountSalt(email),
    memorySize: params.m,
    iterations: params.t,
    parallelism: params.p,
    hashLength: 32,
    outputType: 'binary',
  })
}

export async function hkdf(key: Uint8Array, info: string, length = 32): Promise<Uint8Array> {
  const material = await globalThis.crypto.subtle.importKey('raw', key.slice(), 'HKDF', false, ['deriveBits'])
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode(info) },
    material,
    length * 8,
  )
  return new Uint8Array(bits)
}

export async function derivePasswordKeys(masterKey: Uint8Array): Promise<{ authKey: Uint8Array; encKey: Uint8Array }> {
  const [authKey, encKey] = await Promise.all([
    hkdf(masterKey, 'maru-auth-v1'),
    hkdf(masterKey, 'maru-enc-v1'),
  ])
  return { authKey, encKey }
}

export async function deriveRecoveryKeys(entropy: Uint8Array): Promise<{ authKey: Uint8Array; encKey: Uint8Array }> {
  const [authKey, encKey] = await Promise.all([
    hkdf(entropy, 'maru-recovery-auth-v1'),
    hkdf(entropy, 'maru-recovery-enc-v1'),
  ])
  return { authKey, encKey }
}

async function aesKey(bytes: Uint8Array): Promise<CryptoKey> {
  if (bytes.byteLength !== 32) throw new Error('AES-256-GCM requires a 32-byte key')
  return globalThis.crypto.subtle.importKey('raw', bytes.slice(), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(key: Uint8Array, plaintext: Uint8Array | string, aad: string): Promise<string> {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const bytes = typeof plaintext === 'string' ? encoder.encode(plaintext) : plaintext
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce.slice().buffer, additionalData: encoder.encode(aad).buffer },
    await aesKey(key),
    bytes.slice().buffer,
  )
  return `m1.${encodeBase64Url(nonce)}.${encodeBase64Url(new Uint8Array(ciphertext))}`
}

export async function open(key: Uint8Array, value: string, aad: string): Promise<Uint8Array> {
  const [prefix, nonceValue, ciphertextValue, extra] = value.split('.')
  if (prefix !== 'm1' || !nonceValue || !ciphertextValue || extra !== undefined) {
    throw new Error('Invalid Maru sealed value')
  }
  const nonce = decodeBase64Url(nonceValue)
  if (nonce.byteLength !== 12) throw new Error('Invalid Maru sealed nonce')
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce.slice().buffer, additionalData: encoder.encode(aad).buffer },
    await aesKey(key),
    decodeBase64Url(ciphertextValue).slice().buffer as ArrayBuffer,
  )
  return new Uint8Array(plaintext)
}

export async function openText(key: Uint8Array, value: string, aad: string): Promise<string> {
  return decoder.decode(await open(key, value, aad))
}

export const wrapByPassword = (encKey: Uint8Array, accountKey: Uint8Array) =>
  seal(encKey, accountKey, 'maru-wrap-password-v1')

export const unwrapByPassword = (encKey: Uint8Array, wrapped: string) =>
  open(encKey, wrapped, 'maru-wrap-password-v1')

export const wrapByRecovery = (encKey: Uint8Array, accountKey: Uint8Array) =>
  seal(encKey, accountKey, 'maru-wrap-recovery-v1')

export const unwrapByRecovery = (encKey: Uint8Array, wrapped: string) =>
  open(encKey, wrapped, 'maru-wrap-recovery-v1')
