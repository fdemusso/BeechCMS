// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { InMemoryHashProvider } from './__fixtures__/in-memory-hash-provider'
import { BcryptHashProvider, BCRYPT_SALT_ROUNDS } from './bcrypt-hash-provider'
import { DUMMY_PASSWORD_HASH } from './login'

describe('InMemoryHashProvider', () => {
  const provider = new InMemoryHashProvider()

  it('hash returns the HASH: prefix concatenated with the plaintext', async () => {
    expect(await provider.hash('mypassword')).toBe('HASH:mypassword')
  })

  it('verify returns true when the plaintext matches the stored hash', async () => {
    const hash = await provider.hash('correct')
    expect(await provider.verify('correct', hash)).toBe(true)
  })

  it('verify returns false when the plaintext does not match', async () => {
    const hash = await provider.hash('correct')
    expect(await provider.verify('wrong', hash)).toBe(false)
  })

  it('verify returns false for a string that does not follow the HASH: format', async () => {
    expect(await provider.verify('anything', 'not-a-prefixed-hash')).toBe(false)
  })
})

describe('BcryptHashProvider', () => {
  // Use 4 salt rounds so the test runs in milliseconds.
  const provider = new BcryptHashProvider(4)

  it('hash and verify roundtrip: correct password returns true', async () => {
    const hash = await provider.hash('secure-password')
    expect(await provider.verify('secure-password', hash)).toBe(true)
  })

  it('verify returns false for an incorrect password', async () => {
    const hash = await provider.hash('correct')
    expect(await provider.verify('incorrect', hash)).toBe(false)
  })

  it('verify returns false against the DUMMY_PASSWORD_HASH for any plaintext', async () => {
    expect(await provider.verify('password123', DUMMY_PASSWORD_HASH)).toBe(false)
  })

  it('DUMMY_PASSWORD_HASH bcrypt cost matches BCRYPT_SALT_ROUNDS — timing oracle invariant', () => {
    const match = DUMMY_PASSWORD_HASH.match(/^\$2[aby]\$(\d+)\$/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(BCRYPT_SALT_ROUNDS)
  })
})
