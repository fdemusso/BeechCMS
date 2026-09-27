// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Contract for the Application-Level Encryption (ALE) and hashing privacy service.
 * Used by the Botanical Engine to secure fields classified as `confidential` or `restricted`.
 */
export interface IPrivacyService {
  /**
   * Symmetrically encrypts a plaintext string using AES-256-GCM.
   * @param plaintext - The raw string value to encrypt.
   * @returns A Promise resolving to formatted ciphertext (`v1:<iv_base64>:<ciphertext_base64>`).
   */
  encrypt(plaintext: string): Promise<string>

  /**
   * Decrypts a formatted AES-256-GCM ciphertext payload.
   * @param ciphertext - The formatted ciphertext string (`v1:<iv_base64>:<ciphertext_base64>`).
   * @returns A Promise resolving to the original plaintext string.
   * @throws Error if the ciphertext format is invalid or decryption fails (authentication tag mismatch).
   */
  decrypt(ciphertext: string): Promise<string>

  /**
   * Computes a deterministic HMAC SHA-256 digest of a plaintext string.
   * Used for blind-indexing and one-way field digests (`restricted` classification).
   * @param plaintext - The raw string value to hash.
   * @returns A Promise resolving to a 64-character hexadecimal digest string.
   */
  hash(plaintext: string): Promise<string>
}

/**
 * Converts a Uint8Array byte sequence to a Base64-encoded string.
 * Native Edge-compatible implementation without Node.js Buffer dependencies.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Converts a Base64-encoded string back to a Uint8Array byte sequence.
 * Native Edge-compatible implementation without Node.js Buffer dependencies.
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Concrete Edge-native implementation of {@link IPrivacyService}.
 * Employs Web Crypto API (`crypto.subtle`) for zero-dependency execution in Cloudflare Workers.
 */
export class PrivacyService implements IPrivacyService {
  private readonly masterKey: string
  private aesKeyPromise?: Promise<CryptoKey>
  private hmacKeyPromise?: Promise<CryptoKey>

  /**
   * Initializes the PrivacyService with a Master Encryption Key.
   * @param masterKey - Secret key used to derive cryptographic keys for AES-GCM and HMAC.
   * @throws Error if `masterKey` is empty or undefined.
   */
  constructor(masterKey: string) {
    if (!masterKey) {
      throw new Error('PrivacyService requires a non-empty masterKey')
    }
    this.masterKey = masterKey
  }

  /**
   * Lazy-loads and caches the derived AES-256-GCM {@link CryptoKey}.
   * Derives a 256-bit key from `masterKey` via SHA-256 digest.
   */
  private async getAesKey(): Promise<CryptoKey> {
    if (!this.aesKeyPromise) {
      this.aesKeyPromise = (async () => {
        const keyData = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(this.masterKey)
        )
        return crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        )
      })()
    }
    return this.aesKeyPromise
  }

  /**
   * Lazy-loads and caches the derived HMAC SHA-256 {@link CryptoKey}.
   */
  private async getHmacKey(): Promise<CryptoKey> {
    if (!this.hmacKeyPromise) {
      this.hmacKeyPromise = (async () => {
        return crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(this.masterKey),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        )
      })()
    }
    return this.hmacKeyPromise
  }

  /**
   * Encrypts a plaintext string with AES-256-GCM and a fresh 96-bit (12-byte) IV.
   * Output is formatted as `v1:<iv_base64>:<ciphertext_base64>`.
   */
  async encrypt(plaintext: string): Promise<string> {
    const key = await this.getAesKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encodedText = new TextEncoder().encode(plaintext)
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      encodedText as BufferSource
    )
    const ivBase64 = bytesToBase64(iv)
    const ciphertextBase64 = bytesToBase64(new Uint8Array(encryptedBuffer))
    return `v1:${ivBase64}:${ciphertextBase64}`
  }

  /**
   * Decrypts a `v1:<iv_base64>:<ciphertext_base64>` string back to its plaintext value.
   * If the input string is not prefixed with `v1:`, returns the raw string as unencrypted legacy data.
   */
  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext || !ciphertext.startsWith('v1:')) {
      return ciphertext
    }
    const parts = ciphertext.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format')
    }
    const [, ivBase64, cipherBase64] = parts
    const iv = base64ToBytes(ivBase64)
    const cipherBytes = base64ToBytes(cipherBase64)
    const key = await this.getAesKey()
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipherBytes as BufferSource
    )
    return new TextDecoder().decode(decryptedBuffer)
  }

  /**
   * Computes a deterministic HMAC SHA-256 hex digest for blind index generation.
   */
  async hash(plaintext: string): Promise<string> {
    const key = await this.getHmacKey()
    const encodedText = new TextEncoder().encode(plaintext)
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encodedText as BufferSource
    )
    const hashBytes = new Uint8Array(signatureBuffer)
    return Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
}
