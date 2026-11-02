// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { loginRequestSchema } from './login-request.js'

describe('loginRequestSchema', () => {
  it('accepts a valid email with an 8-character password', () => {
    const result = loginRequestSchema.safeParse({ email: 'user@test.com', password: '12345678' })

    expect(result.success).toBe(true)
  })

  it('trims and lowercases the email so lookup matches signup normalization', () => {
    const result = loginRequestSchema.safeParse({ email: '  Demo@Test.com  ', password: 'pass1234' })

    expect(result.data).toEqual({ email: 'demo@test.com', password: 'pass1234' })
  })

  it('keeps trailing whitespace in the password, matching setup/reset validation', () => {
    const result = loginRequestSchema.safeParse({ email: 'user@test.com', password: 'passwor ' })

    expect(result.data?.password).toBe('passwor ')
  })

  it.each([
    ['null', null],
    ['a string', 'string'],
    ['a number', 42],
    ['undefined', undefined],
    ['a missing email', { password: 'pass1234' }],
    ['a missing password', { email: 'x@x.com' }],
    ['a blank email', { email: '   ', password: 'pass1234' }],
    ['a non-string email', { email: 42, password: 'pass1234' }],
    ['an email without @', { email: 'notanemail', password: 'password123' }],
    ['an email with nothing before the @', { email: '@test.com', password: 'password123' }],
    ['an email with no domain extension', { email: 'user@nodot', password: 'password123' }],
    ['a password shorter than 8 characters', { email: 'user@test.com', password: '1234567' }],
    ['a password longer than 128 characters', { email: 'user@test.com', password: 'a'.repeat(129) }],
    ['a password over 72 bytes but under 128 characters', { email: 'user@test.com', password: 'a'.repeat(73) }],
    // '€' is 3 bytes in UTF-8, so 25 chars = 75 bytes
    ['a multi-byte password over 72 bytes', { email: 'user@test.com', password: '€'.repeat(25) }],
  ])('rejects %s', (_, body) => {
    const result = loginRequestSchema.safeParse(body)

    expect(result.success).toBe(false)
  })

  it.each([
    ['exactly 72 ASCII bytes', 'a'.repeat(72)],
    // '€' is 3 bytes in UTF-8, so 24 chars = 72 bytes, exactly at the bcrypt limit
    ['exactly 72 multi-byte bytes', '€'.repeat(24)],
  ])('accepts a password of %s', (_, password) => {
    const result = loginRequestSchema.safeParse({ email: 'user@test.com', password })

    expect(result.success).toBe(true)
  })
})
