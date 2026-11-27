// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  AesGcmMfaSecretCipher,
  createMfaSecretCipher,
  MfaCiphertextError,
  MfaNotConfiguredError,
} from './mfa-secret-cipher.js'

const KEY_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
const OTHER_KEY_HEX = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const USER_ID = 'user_a'

describe('AesGcmMfaSecretCipher', () => {
  let cipher: AesGcmMfaSecretCipher

  beforeEach(() => {
    cipher = new AesGcmMfaSecretCipher(KEY_HEX)
  })

  it('round-trips a secret for the same user', async () => {
    const ciphertext = await cipher.encrypt(SECRET, USER_ID)

    const plaintext = await cipher.decrypt(ciphertext, USER_ID)

    expect(plaintext).toBe(SECRET)
  })

  it('emits a v1 envelope with three parts and a fresh IV per call', async () => {
    const first = await cipher.encrypt(SECRET, USER_ID)
    const second = await cipher.encrypt(SECRET, USER_ID)

    const firstParts = first.split(':')
    expect(firstParts).toHaveLength(3)
    expect(firstParts[0]).toBe('v1')
    expect(second.split(':')[1]).not.toBe(firstParts[1])
  })

  it('refuses to decrypt a ciphertext with another user id', async () => {
    const ciphertext = await cipher.encrypt(SECRET, USER_ID)

    // Regression guard: the user id is authenticated data, so a row copied to another account stays unreadable.
    const attempt = cipher.decrypt(ciphertext, 'user_b')

    await expect(attempt).rejects.toBeInstanceOf(MfaCiphertextError)
  })

  it('refuses a tampered ciphertext', async () => {
    const [version, iv, body] = (await cipher.encrypt(SECRET, USER_ID)).split(':')
    const flippedFirstChar = body[0] === 'A' ? 'B' : 'A'
    const tampered = `${version}:${iv}:${flippedFirstChar}${body.slice(1)}`

    const attempt = cipher.decrypt(tampered, USER_ID)

    await expect(attempt).rejects.toBeInstanceOf(MfaCiphertextError)
  })

  it('refuses an unknown envelope version', async () => {
    const [, iv, body] = (await cipher.encrypt(SECRET, USER_ID)).split(':')

    const attempt = cipher.decrypt(`v2:${iv}:${body}`, USER_ID)

    await expect(attempt).rejects.toBeInstanceOf(MfaCiphertextError)
  })

  it('refuses a ciphertext produced under another key', async () => {
    const ciphertext = await new AesGcmMfaSecretCipher(OTHER_KEY_HEX).encrypt(SECRET, USER_ID)

    const attempt = cipher.decrypt(ciphertext, USER_ID)

    await expect(attempt).rejects.toBeInstanceOf(MfaCiphertextError)
  })
})

describe('createMfaSecretCipher', () => {
  it('returns a cipher that throws mfa_not_configured for a missing, blank or malformed key', async () => {
    const unusableKeys = [undefined, '', KEY_HEX.slice(1), 'z'.repeat(64)]

    const failures = await Promise.all(
      unusableKeys.flatMap(key => {
        const cipher = createMfaSecretCipher(key)
        return [cipher.encrypt(SECRET, USER_ID), cipher.decrypt('v1:aa:bb', USER_ID)].map(call => call.then(
          () => null,
          (error: unknown) => error,
        ))
      }),
    )

    expect(failures).toHaveLength(unusableKeys.length * 2)
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(MfaNotConfiguredError)
      expect((failure as MfaNotConfiguredError).code).toBe('mfa_not_configured')
    }
  })
})
