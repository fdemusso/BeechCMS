// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { acceptInvitationSchema, createInvitationSchema, createUserSchema, pageQuerySchema, roleBodySchema } from './rbac.schema'

describe('pageQuerySchema', () => {
  it('turns digit strings into numbers and leaves absent keys undefined', () => {
    const full = pageQuerySchema.safeParse({ limit: '100', offset: '20' })
    const empty = pageQuerySchema.safeParse({})

    expect(full.data).toEqual({ limit: 100, offset: 20 })
    expect(empty.data).toEqual({})
  })

  it.each(['0', '101', '-1', '+5', '1.5', '1e2', 'abc', ''])('refuses limit=%j', (limit) => {
    const result = pageQuerySchema.safeParse({ limit })

    expect(result.success).toBe(false)
  })

  it.each(['-1', '1.5', 'abc'])('refuses offset=%j', (offset) => {
    const result = pageQuerySchema.safeParse({ offset })

    expect(result.success).toBe(false)
  })
})

describe('createUserSchema', () => {
  const valid = { email: 'new@beech.test', password: 'password123' }

  // bcrypt truncates past 72 bytes, so the limit is in bytes: 'é' is two.
  it('accepts a password of exactly 72 UTF-8 bytes and refuses one of 74', () => {
    const atLimit = createUserSchema.safeParse({ ...valid, password: 'é'.repeat(36) })
    const overLimit = createUserSchema.safeParse({ ...valid, password: 'é'.repeat(37) })

    expect(atLimit.success).toBe(true)
    expect(overLimit.success).toBe(false)
  })

  it('refuses a password shorter than 8 characters', () => {
    const result = createUserSchema.safeParse({ ...valid, password: 'short' })

    expect(result.success).toBe(false)
  })

  it('accepts null or absent name and surname, which the handler stores as null', () => {
    const absent = createUserSchema.safeParse(valid)
    const explicitNull = createUserSchema.safeParse({ ...valid, name: null, surname: null })

    expect(absent.success).toBe(true)
    expect(explicitNull.success).toBe(true)
  })

  it('trims the email before validating it', () => {
    const result = createUserSchema.safeParse({ ...valid, email: '  new@beech.test  ' })

    expect(result.data?.email).toBe('new@beech.test')
  })
})

describe('roleBodySchema', () => {
  it('refuses a role that grants nothing', () => {
    const result = roleBodySchema.safeParse({ name: 'Empty', permissions: [] })

    expect(result.success).toBe(false)
  })

  it('refuses a permission outside the closed vocabulary', () => {
    const result = roleBodySchema.safeParse({ name: 'Odd', permissions: ['rule_the_world'] })

    expect(result.success).toBe(false)
  })

  it('refuses a name that is blank once trimmed', () => {
    const result = roleBodySchema.safeParse({ name: '   ', permissions: ['manage_users'] })

    expect(result.success).toBe(false)
  })
})

describe('createInvitationSchema', () => {
  const valid = { email: 'invitee@beech.test', roleId: 'role-id', scope: '*' }

  it('keeps the locale optional and bounded to 8 characters', () => {
    const absent = createInvitationSchema.safeParse(valid)
    const tooLong = createInvitationSchema.safeParse({ ...valid, locale: 'it-IT-xxxx' })

    expect(absent.success).toBe(true)
    expect(tooLong.success).toBe(false)
  })
})

describe('acceptInvitationSchema', () => {
  it('refuses an empty token and one longer than 128 characters', () => {
    const empty = acceptInvitationSchema.safeParse({ token: '', password: 'password123' })
    const tooLong = acceptInvitationSchema.safeParse({ token: 'x'.repeat(129), password: 'password123' })

    expect(empty.success).toBe(false)
    expect(tooLong.success).toBe(false)
  })
})
