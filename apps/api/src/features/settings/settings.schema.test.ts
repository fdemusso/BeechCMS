// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import {
  changePasswordRequestSchema,
  deleteOrphansRequestSchema,
  updateAvatarRequestSchema,
  updateNotificationPrefsRequestSchema,
  updateProfileRequestSchema,
  updateSettingsRequestSchema,
} from './settings.schema'

describe('updateSettingsRequestSchema', () => {
  it('trims the text fields and the default language before checking it', () => {
    const result = updateSettingsRequestSchema.safeParse({ siteTitle: '  Beech  ', defaultLanguage: ' it ', currency: ' EUR ' })

    expect(result.data).toEqual({ siteTitle: 'Beech', defaultLanguage: 'it', currency: 'EUR' })
  })

  it('accepts a blank company website, which the handler turns into a cleared column', () => {
    const result = updateSettingsRequestSchema.safeParse({ company: { website: '   ' } })

    expect(result.success).toBe(true)
  })

  it('accepts company: null, which clears every company field', () => {
    const result = updateSettingsRequestSchema.safeParse({ company: null })

    expect(result.data).toEqual({ company: null })
  })

  it('reports an invalid company website under company.website', () => {
    const result = updateSettingsRequestSchema.safeParse({ company: { website: 'not-a-valid-url' } })

    expect(result.error?.issues[0].path).toEqual(['company', 'website'])
  })

  it('reports duplicate locales under locales', () => {
    const result = updateSettingsRequestSchema.safeParse({ locales: ['it', 'it'] })

    expect(result.error?.issues[0].path[0]).toBe('locales')
  })

  it.each([
    ['an empty list', []],
    ['a malformed code', ['it', 'not a locale']],
  ])('refuses locales that are %s', (_label, locales) => {
    const result = updateSettingsRequestSchema.safeParse({ locales })

    expect(result.success).toBe(false)
  })

  describe('the locale count limit', () => {
    // Three-letter codes ('aaa', 'aab', ...) so the only thing that varies is how many there are.
    function distinctLocales(count: number): string[] {
      return Array.from({ length: count }, (_, index) =>
        [Math.floor(index / 26 / 26), Math.floor(index / 26) % 26, index % 26].map((digit) => String.fromCharCode(97 + digit)).join(''),
      )
    }

    it('accepts the maximum number of distinct locales', () => {
      const result = updateSettingsRequestSchema.safeParse({ locales: distinctLocales(50) })

      expect(result.success).toBe(true)
    })

    it('refuses one locale more than the maximum', () => {
      const result = updateSettingsRequestSchema.safeParse({ locales: distinctLocales(51) })

      expect(result.error?.issues[0].path[0]).toBe('locales')
    })
  })

  it('reports the first problem in the order the handler used to check: language before locales before retention', () => {
    const result = updateSettingsRequestSchema.safeParse({ trashRetentionDays: -1, locales: [], defaultLanguage: 'fr' })

    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['defaultLanguage', 'locales', 'trashRetentionDays'])
  })

  it.each([
    ['a string', '30'],
    ['a float', 1.5],
    ['a negative number', -1],
    ['above the maximum', 36501],
  ])('refuses trashRetentionDays that is %s', (_label, trashRetentionDays) => {
    const result = updateSettingsRequestSchema.safeParse({ trashRetentionDays })

    expect(result.error?.issues[0].path[0]).toBe('trashRetentionDays')
  })

  it('accepts 0 as trashRetentionDays, meaning never purge', () => {
    const result = updateSettingsRequestSchema.safeParse({ trashRetentionDays: 0 })

    expect(result.data).toEqual({ trashRetentionDays: 0 })
  })

  it.each([[null], [[]], ['text'], [42]])('refuses a body that is not an object (%j) at the root', (body) => {
    const result = updateSettingsRequestSchema.safeParse(body)

    expect(result.error?.issues[0].path).toEqual([])
  })

  it('refuses a field of the wrong type instead of ignoring it', () => {
    const result = updateSettingsRequestSchema.safeParse({ siteTitle: 5 })

    expect(result.error?.issues[0].path).toEqual(['siteTitle'])
  })
})

describe('updateProfileRequestSchema', () => {
  it('normalises the email to trimmed lowercase', () => {
    const result = updateProfileRequestSchema.safeParse({ email: '  Test@BeechCMS.com ' })

    expect(result.data).toEqual({ email: 'test@beechcms.com' })
  })

  it('keeps an empty name, which is a field to update and not an absent one', () => {
    const result = updateProfileRequestSchema.safeParse({ name: '  ' })

    expect(result.data).toEqual({ name: '' })
  })

  it.each([
    ['email', { email: 'nope' }],
    ['name', { name: 'a'.repeat(101) }],
    ['surname', { surname: 'a'.repeat(101) }],
  ])('names %s as the offending field', (field, body) => {
    const result = updateProfileRequestSchema.safeParse(body)

    expect(result.error?.issues[0].path).toEqual([field])
  })

  it('allows a name of exactly 100 characters', () => {
    const result = updateProfileRequestSchema.safeParse({ name: 'a'.repeat(100) })

    expect(result.success).toBe(true)
  })
})

describe('changePasswordRequestSchema', () => {
  const REQUIRED = 'Both currentPassword and newPassword are required'

  it.each([
    ['newPassword is missing', { currentPassword: 'old' }],
    ['currentPassword is missing', { newPassword: 'long-enough-1' }],
    ['currentPassword is empty', { currentPassword: '', newPassword: 'long-enough-1' }],
    ['newPassword is empty', { currentPassword: 'old', newPassword: '' }],
    ['a password is not text', { currentPassword: 1, newPassword: 'long-enough-1' }],
  ])('answers with the "both required" message when %s', (_label, body) => {
    const result = changePasswordRequestSchema.safeParse(body)

    expect(result.error?.issues[0].message).toBe(REQUIRED)
  })

  it.each([
    ['too short', 'short', 'Password must be at least 8 characters long'],
    ['too long', 'A'.repeat(129), 'Password is too long'],
    ['over 72 bytes under 128 characters', 'A'.repeat(73), 'Password must not exceed 72 bytes when UTF-8 encoded'],
    ['over 72 bytes through multi-byte characters', '€'.repeat(25), 'Password must not exceed 72 bytes when UTF-8 encoded'],
  ])('refuses a newPassword that is %s with its own message', (_label, newPassword, message) => {
    const result = changePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword })

    expect(result.error?.issues[0].message).toBe(message)
  })

  it('accepts a newPassword of exactly 72 bytes', () => {
    const result = changePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'A'.repeat(72) })

    expect(result.success).toBe(true)
  })
})

describe('updateAvatarRequestSchema', () => {
  it('accepts null, which clears the avatar', () => {
    const result = updateAvatarRequestSchema.safeParse({ avatarUrl: null })

    expect(result.data).toEqual({ avatarUrl: null })
  })

  it('trims the url', () => {
    const result = updateAvatarRequestSchema.safeParse({ avatarUrl: '  https://beechcms.com/a.png ' })

    expect(result.data).toEqual({ avatarUrl: 'https://beechcms.com/a.png' })
  })

  it('refuses a body without avatarUrl, so an empty object cannot clear the avatar by accident', () => {
    const result = updateAvatarRequestSchema.safeParse({})

    expect(result.success).toBe(false)
  })
})

describe('updateNotificationPrefsRequestSchema', () => {
  it('switches off a preference the body leaves out', () => {
    const result = updateNotificationPrefsRequestSchema.safeParse({ contentCreate: true })

    expect(result.data).toEqual({ contentCreate: true, contentUpdate: false, contentDelete: false, mediaUpload: false })
  })

  it('refuses a preference that is not a boolean instead of reading it as off', () => {
    const result = updateNotificationPrefsRequestSchema.safeParse({ contentCreate: 'true' })

    expect(result.success).toBe(false)
  })
})

describe('deleteOrphansRequestSchema', () => {
  it.each([
    ['no keys', []],
    ['an empty key', ['']],
    ['a repeated key', ['a', 'a']],
    ['more keys than a page', Array.from({ length: 51 }, (_, index) => `key-${index}`)],
    ['a key that is not text', [1]],
  ])('refuses %s', (_label, keys) => {
    const result = deleteOrphansRequestSchema.safeParse({ keys })

    expect(result.success).toBe(false)
  })

  it('accepts a full page of distinct keys', () => {
    const keys = Array.from({ length: 50 }, (_, index) => `key-${index}`)

    const result = deleteOrphansRequestSchema.safeParse({ keys })

    expect(result.data).toEqual({ keys })
  })
})
