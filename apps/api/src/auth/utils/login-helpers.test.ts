// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { verifyPassword, DUMMY_PASSWORD_HASH } from './login-helpers'
import { InMemoryHashProvider } from '../__fixtures__/in-memory-hash-provider'

describe('verifyPassword', () => {
  const hashProvider = new InMemoryHashProvider()

  it('returns true when the plaintext matches the stored hash', async () => {
    const hash = await hashProvider.hash('mypassword')
    expect(await verifyPassword('mypassword', hash, hashProvider)).toBe(true)
  })

  it('returns false when the plaintext does not match', async () => {
    const hash = await hashProvider.hash('correct')
    expect(await verifyPassword('wrong', hash, hashProvider)).toBe(false)
  })
})

describe('DUMMY_PASSWORD_HASH', () => {
  it('has bcrypt format so constant-time comparison runs even when no user is found', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$\d+\$/)
  })
})
