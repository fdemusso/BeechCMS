// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { parseLoginBody, validateLoginInput, verifyPassword, DUMMY_PASSWORD_HASH } from './login-helpers'
import { InMemoryHashProvider } from '../__fixtures__/in-memory-hash-provider'

describe('parseLoginBody', () => {
  it('returns credentials for a valid object body', () => {
    expect(parseLoginBody({ email: 'user@test.com', password: 'pass1234' }))
      .toEqual({ email: 'user@test.com', password: 'pass1234' })
  })

  it('trims leading and trailing whitespace from email', () => {
    expect(parseLoginBody({ email: '  user@test.com  ', password: 'pass' }))
      .toEqual({ email: 'user@test.com', password: 'pass' })
  })

  it('returns null for non-object input', () => {
    expect(parseLoginBody(null)).toBeNull()
    expect(parseLoginBody('string')).toBeNull()
    expect(parseLoginBody(42)).toBeNull()
    expect(parseLoginBody(undefined)).toBeNull()
  })

  it('returns null when email field is missing', () => {
    expect(parseLoginBody({ password: 'pass' })).toBeNull()
  })

  it('returns null when password field is missing', () => {
    expect(parseLoginBody({ email: 'x@x.com' })).toBeNull()
  })

  it('returns null when email is an empty string after trimming', () => {
    expect(parseLoginBody({ email: '   ', password: 'pass' })).toBeNull()
  })

  it('returns null when email is not a string', () => {
    expect(parseLoginBody({ email: 42, password: 'pass' })).toBeNull()
  })

  it('lowercases email so lookup matches signup normalization', () => {
    expect(parseLoginBody({ email: 'Demo@Test.com', password: 'pass1234' }))
      .toEqual({ email: 'demo@test.com', password: 'pass1234' })
  })
})

describe('validateLoginInput', () => {
  it('accepts a valid email and an 8-character password', () => {
    expect(validateLoginInput('user@test.com', '12345678')).toBe(true)
  })

  it('rejects an email without an @ sign', () => {
    expect(validateLoginInput('notanemail', 'password123')).toBe(false)
  })

  it('rejects an email with nothing before the @', () => {
    expect(validateLoginInput('@test.com', 'password123')).toBe(false)
  })

  it('rejects an email with no domain extension', () => {
    expect(validateLoginInput('user@nodot', 'password123')).toBe(false)
  })

  it('rejects a password shorter than 8 characters', () => {
    expect(validateLoginInput('user@test.com', '1234567')).toBe(false)
  })

  it('rejects a password longer than 128 characters', () => {
    expect(validateLoginInput('user@test.com', 'a'.repeat(129))).toBe(false)
  })

  it('accepts passwords at the lower boundary (exactly 8 characters)', () => {
    expect(validateLoginInput('user@test.com', 'a'.repeat(8))).toBe(true)
  })

  it('accepts a password with trailing whitespace, matching setup/reset validation', () => {
    expect(validateLoginInput('user@test.com', 'passwor ')).toBe(true)
  })

  it('accepts a password at the bcrypt byte boundary (exactly 72 bytes)', () => {
    expect(validateLoginInput('user@test.com', 'a'.repeat(72))).toBe(true)
  })

  it('rejects a password exceeding 72 bytes even though under 128 characters', () => {
    expect(validateLoginInput('user@test.com', 'a'.repeat(73))).toBe(false)
  })

  it('rejects a password exceeding 72 bytes due to multi-byte UTF-8 characters', () => {
    // '€' is 3 bytes in UTF-8, so 25 chars = 75 bytes > 72
    expect(validateLoginInput('user@test.com', '€'.repeat(25))).toBe(false)
  })

  it('accepts a multi-byte UTF-8 password that stays within 72 bytes', () => {
    // '€' is 3 bytes in UTF-8, so 24 chars = 72 bytes, exactly at the limit
    expect(validateLoginInput('user@test.com', '€'.repeat(24))).toBe(true)
  })

  it('accepts a password at the bcrypt byte boundary (exactly 72 bytes)', () => {
    expect(validateLoginInput('user@test.com', 'a'.repeat(72))).toBe(true)
  })

  it('rejects a password exceeding 72 bytes even though under 128 characters', () => {
    expect(validateLoginInput('user@test.com', 'a'.repeat(73))).toBe(false)
  })

  it('rejects a password exceeding 72 bytes due to multi-byte UTF-8 characters', () => {
    // '€' is 3 bytes in UTF-8, so 25 chars = 75 bytes > 72
    expect(validateLoginInput('user@test.com', '€'.repeat(25))).toBe(false)
  })

  it('accepts a multi-byte UTF-8 password that stays within 72 bytes', () => {
    // '€' is 3 bytes in UTF-8, so 24 chars = 72 bytes, exactly at the limit
    expect(validateLoginInput('user@test.com', '€'.repeat(24))).toBe(true)
  })
})

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
