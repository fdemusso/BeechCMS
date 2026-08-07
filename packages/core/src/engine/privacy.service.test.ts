// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { PrivacyService } from './privacy.service.js'

describe('PrivacyService', () => {
  const masterKey = 'test-master-key-32-chars-long!!'
  const service = new PrivacyService(masterKey)

  it('encrypts and decrypts text successfully', async () => {
    const plaintext = 'Secret sensitive data'
    const ciphertext = await service.encrypt(plaintext)

    expect(ciphertext).not.toBe(plaintext)
    expect(ciphertext).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)

    const decrypted = await service.decrypt(ciphertext)
    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertexts due to random IVs', async () => {
    const plaintext = 'Same content'
    const cipher1 = await service.encrypt(plaintext)
    const cipher2 = await service.encrypt(plaintext)

    expect(cipher1).not.toBe(cipher2)

    expect(await service.decrypt(cipher1)).toBe(plaintext)
    expect(await service.decrypt(cipher2)).toBe(plaintext)
  })

  it('throws on invalid ciphertext format', async () => {
    await expect(service.decrypt('invalid-ciphertext')).rejects.toThrow('Invalid ciphertext format')
    await expect(service.decrypt('v2:iv:data')).rejects.toThrow('Invalid ciphertext format')
  })

  it('generates deterministic HMAC SHA-256 hash', async () => {
    const plaintext = 'exact-match-query-val'
    const hash1 = await service.hash(plaintext)
    const hash2 = await service.hash(plaintext)

    expect(hash1).toHaveLength(64) // 256 bits = 64 hex chars
    expect(hash1).toBe(hash2)

    const diffHash = await service.hash('different-val')
    expect(diffHash).not.toBe(hash1)
  })

  it('throws error if constructed with empty masterKey', () => {
    expect(() => new PrivacyService('')).toThrow('PrivacyService requires a non-empty masterKey')
  })
})
