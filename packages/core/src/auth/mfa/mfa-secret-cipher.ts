// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { base64ToBytes, bytesToBase64 } from '../../common/base64.js'

/** Format of MFA_ENCRYPTION_KEY: 64 hex characters = 32 random bytes. */
export const MFA_ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/
/** Current ciphertext envelope version. Rotation (v2, multiple keys) is out of scope. */
export const MFA_CIPHERTEXT_VERSION = 'v1'

const IV_BYTES = 12
const ENVELOPE_PARTS = 3

export class MfaNotConfiguredError extends Error {
  readonly code = 'mfa_not_configured'

  constructor() {
    super('MFA_ENCRYPTION_KEY is not configured or invalid: set it to 64 hex characters (32 random bytes) to enable two-factor authentication')
    this.name = 'MfaNotConfiguredError'
  }
}

export class MfaCiphertextError extends Error {
  readonly code = 'mfa_ciphertext_invalid'

  constructor() {
    super('MFA secret ciphertext is invalid')
    this.name = 'MfaCiphertextError'
  }
}

export interface IMfaSecretCipher {
  /** `v1:<iv_base64>:<ciphertext_base64>`, authenticated against `userId`. */
  encrypt(secret: string, userId: string): Promise<string>
  /** Throws MfaCiphertextError on unknown version, malformed envelope, wrong user or tampering. */
  decrypt(ciphertext: string, userId: string): Promise<string>
}

/** Binds a ciphertext to its owner so a row copied to another account cannot be decrypted. */
function additionalData(userId: string): BufferSource {
  return new TextEncoder().encode(`beech-mfa:${MFA_CIPHERTEXT_VERSION}:${userId}`) as BufferSource
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** AES-256-GCM cipher keyed by the raw 32-byte value of MFA_ENCRYPTION_KEY. */
export class AesGcmMfaSecretCipher implements IMfaSecretCipher {
  private readonly keyHex: string
  private aesKeyPromise?: Promise<CryptoKey>

  /** @throws MfaNotConfiguredError when `keyHex` does not match MFA_ENCRYPTION_KEY_PATTERN. */
  constructor(keyHex: string) {
    if (!MFA_ENCRYPTION_KEY_PATTERN.test(keyHex)) throw new MfaNotConfiguredError()
    this.keyHex = keyHex
  }

  private getAesKey(): Promise<CryptoKey> {
    this.aesKeyPromise ??= crypto.subtle.importKey(
      'raw',
      hexToBytes(this.keyHex) as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )
    return this.aesKeyPromise
  }

  async encrypt(secret: string, userId: string): Promise<string> {
    const key = await this.getAesKey()
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData(userId) },
      key,
      new TextEncoder().encode(secret) as BufferSource,
    )
    return `${MFA_CIPHERTEXT_VERSION}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`
  }

  async decrypt(ciphertext: string, userId: string): Promise<string> {
    const parts = ciphertext.split(':')
    if (parts.length !== ENVELOPE_PARTS || parts[0] !== MFA_CIPHERTEXT_VERSION) throw new MfaCiphertextError()
    try {
      const key = await this.getAesKey()
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(parts[1]) as BufferSource, additionalData: additionalData(userId) },
        key,
        base64ToBytes(parts[2]) as BufferSource,
      )
      return new TextDecoder().decode(decrypted)
    } catch {
      // Wrong key, wrong user, tampering and bad base64 look identical.
      throw new MfaCiphertextError()
    }
  }
}

/** Fail-closed variant: every call throws MfaNotConfiguredError. */
export class UnconfiguredMfaSecretCipher implements IMfaSecretCipher {
  async encrypt(_secret: string, _userId: string): Promise<string> {
    throw new MfaNotConfiguredError()
  }

  async decrypt(_ciphertext: string, _userId: string): Promise<string> {
    throw new MfaNotConfiguredError()
  }
}

/** AesGcmMfaSecretCipher for a valid key, UnconfiguredMfaSecretCipher for a missing, blank or malformed one. Never throws. */
export function createMfaSecretCipher(keyHex: string | undefined): IMfaSecretCipher {
  return keyHex && MFA_ENCRYPTION_KEY_PATTERN.test(keyHex)
    ? new AesGcmMfaSecretCipher(keyHex)
    : new UnconfiguredMfaSecretCipher()
}
